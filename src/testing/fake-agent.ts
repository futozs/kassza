import { AGENT_ACTIONS, type AgentAction } from '../core/actions'
import { childText, findChild, type XmlElement } from '../core/xml/parse'
import {
  acceptDelegation,
  authenticate,
  handleConnectPrincipal,
  handleQueryTaxpayer,
} from './fake-agent-account'
import {
  errorResponse,
  type FakeAgentResponse,
  serverErrorResponse,
  toFetchResponse,
} from './fake-agent-http'
import {
  handleCreateInvoice,
  handleDeleteProforma,
  handleGetInvoicePdf,
  handleGetInvoiceXml,
  handleRegisterPayment,
  handleReverseInvoice,
} from './fake-agent-invoices'
import {
  handleCreateReceipt,
  handleGetReceipt,
  handleReverseReceipt,
  handleSendReceipt,
} from './fake-agent-receipts'
import {
  credentialsOf,
  errorStyleFor,
  type FakeAgentAttachment,
  type FakeAgentRequest,
  type FakeAgentRequestRecord,
  parseFakeAgentRequest,
  readFakeAgentForm,
} from './fake-agent-request'
import {
  agentFailure,
  FakeAgentFailure,
  type FakeAgentInvoice,
  type FakeAgentPrincipal,
  type FakeAgentPrincipalState,
  type FakeAgentReceipt,
  type FakeAgentSeller,
  type FakeAgentState,
  type FakeAgentTaxpayer,
  taxpayerKey,
} from './fake-agent-state'

export type FakeAgentFaultName =
  | 'ghostSuccess'
  | 'timeout'
  | 'networkError'
  | 'serverError'
  | 'maintenance'
  | 'partialSuccess'
  | 'testAccountLimit'
  | 'duplicateCallId'
  | 'duplicateOrderNumber'

export interface FakeAgentCodeFault {
  readonly code: number
  readonly message?: string | undefined
  readonly afterSuccess?: boolean | undefined
}

export type FakeAgentFault = FakeAgentFaultName | FakeAgentCodeFault

export interface FakeAgentFaultOptions {
  readonly action?: AgentAction | undefined
  readonly times?: number | undefined
}

export interface FakeAgentScheduledFault extends FakeAgentFaultOptions {
  readonly fault: FakeAgentFault
}

export interface FakeAgentDuplicateOrderNumbers {
  readonly invoices?: boolean | undefined
  readonly receipts?: boolean | undefined
}

export interface FakeAgentOptions {
  readonly now?: (() => Date) | undefined
  readonly agentKeys?: readonly string[] | undefined
  readonly users?: Readonly<Record<string, string>> | undefined
  readonly seller?: Partial<FakeAgentSeller> | undefined
  readonly testAccount?: boolean | undefined
  readonly defaultInvoicePrefix?: string | undefined
  readonly invoicePrefixes?: readonly string[] | undefined
  readonly receiptPrefixes?: readonly string[] | undefined
  readonly rejectDuplicateOrderNumbers?: boolean | FakeAgentDuplicateOrderNumbers | undefined
  readonly taxpayers?: Readonly<Record<string, FakeAgentTaxpayer>> | undefined
  readonly principals?: Readonly<Record<string, FakeAgentPrincipalState>> | undefined
  readonly faults?: readonly FakeAgentScheduledFault[] | undefined
}

export interface FakeAgent {
  readonly fetch: typeof globalThis.fetch
  readonly requests: readonly FakeAgentRequestRecord[]
  readonly invoices: ReadonlyMap<string, FakeAgentInvoice>
  readonly receipts: ReadonlyMap<string, FakeAgentReceipt>
  fail(fault: FakeAgentFault, options?: FakeAgentFaultOptions): void
  acceptDelegation(taxNumber: string): void
  reset(): void
}

type FaultStage = 'before' | 'after'
type FaultEffect = 'timeout' | 'network' | 'server-error' | 'code'

interface FaultBehavior {
  readonly stage: FaultStage
  readonly effect: FaultEffect
  readonly code?: number | undefined
  readonly message?: string | undefined
}

interface PendingFault {
  readonly behavior: FaultBehavior
  readonly action: AgentAction | undefined
  remaining: number
}

type Handler = (state: FakeAgentState, request: FakeAgentRequest) => FakeAgentResponse

const HANDLERS: Readonly<Record<AgentAction, Handler>> = {
  createInvoice: handleCreateInvoice,
  reverseInvoice: handleReverseInvoice,
  registerPayment: handleRegisterPayment,
  getInvoicePdf: handleGetInvoicePdf,
  getInvoiceXml: handleGetInvoiceXml,
  deleteProforma: handleDeleteProforma,
  createReceipt: handleCreateReceipt,
  reverseReceipt: handleReverseReceipt,
  getReceipt: handleGetReceipt,
  sendReceipt: handleSendReceipt,
  queryTaxpayer: handleQueryTaxpayer,
  connectPrincipal: handleConnectPrincipal,
}

const NAMED_FAULTS: Readonly<Record<FakeAgentFaultName, FaultBehavior>> = {
  ghostSuccess: { stage: 'after', effect: 'timeout' },
  timeout: { stage: 'before', effect: 'timeout' },
  networkError: { stage: 'before', effect: 'network' },
  serverError: { stage: 'before', effect: 'server-error' },
  maintenance: { stage: 'before', effect: 'code', code: 1 },
  partialSuccess: { stage: 'after', effect: 'code', code: 56 },
  testAccountLimit: { stage: 'before', effect: 'code', code: 167 },
  duplicateCallId: { stage: 'before', effect: 'code', code: 338 },
  duplicateOrderNumber: { stage: 'before', effect: 'code', code: 152 },
}

const DEFAULT_SELLER: FakeAgentSeller = {
  name: 'Kassza Teszt Kft.',
  taxNumber: '12345676-2-42',
  zip: '1111',
  city: 'Budapest',
  address: 'Teszt utca 1.',
}

const DEFAULT_INVOICE_PREFIX = 'KASSZA'

const KNOWN_ACTIONS: ReadonlySet<string> = new Set(Object.keys(AGENT_ACTIONS))

function behaviorOf(fault: FakeAgentFault): FaultBehavior {
  if (typeof fault === 'string') {
    const behavior = NAMED_FAULTS[fault]
    if (!behavior) throw new TypeError(`Ismeretlen hamis Agent hiba: ${String(fault)}`)
    return behavior
  }
  if (!Number.isInteger(fault.code) || fault.code < 1) {
    throw new TypeError(`A hibakód pozitív egész szám legyen, kapott: ${String(fault.code)}`)
  }
  return {
    stage: fault.afterSuccess === true ? 'after' : 'before',
    effect: 'code',
    code: fault.code,
    message: fault.message,
  }
}

function pendingFault(fault: FakeAgentFault, options: FakeAgentFaultOptions): PendingFault {
  const times = options.times ?? 1
  if (!Number.isInteger(times) || times < 1) {
    throw new TypeError(`A times értéke legalább 1 egész szám legyen, kapott: ${String(times)}`)
  }
  if (options.action !== undefined && !KNOWN_ACTIONS.has(options.action)) {
    throw new TypeError(`Ismeretlen Agent művelet: ${String(options.action)}`)
  }
  return { behavior: behaviorOf(fault), action: options.action, remaining: times }
}

function duplicateFlags(value: FakeAgentOptions['rejectDuplicateOrderNumbers']): {
  readonly invoices: boolean
  readonly receipts: boolean
} {
  if (typeof value === 'boolean') return { invoices: value, receipts: value }
  return { invoices: value?.invoices === true, receipts: value?.receipts === true }
}

function normalizedTaxpayers(
  taxpayers: FakeAgentOptions['taxpayers'],
): Record<string, FakeAgentTaxpayer> {
  return Object.fromEntries(
    Object.entries(taxpayers ?? {}).map(([taxNumber, taxpayer]) => [
      taxpayerKey(taxNumber),
      taxpayer,
    ]),
  )
}

function seededPrincipals(options: FakeAgentOptions): Map<string, FakeAgentPrincipal> {
  return new Map(
    Object.entries(options.principals ?? {}).map(([taxNumber, state]) => [
      taxpayerKey(taxNumber),
      { state, joinRequests: 0 },
    ]),
  )
}

function createState(options: FakeAgentOptions): FakeAgentState {
  const duplicates = duplicateFlags(options.rejectDuplicateOrderNumbers)
  return {
    now: options.now ?? (() => new Date()),
    config: {
      seller: { ...DEFAULT_SELLER, ...options.seller },
      testAccount: options.testAccount ?? true,
      defaultInvoicePrefix:
        options.defaultInvoicePrefix ?? options.invoicePrefixes?.[0] ?? DEFAULT_INVOICE_PREFIX,
      invoicePrefixes: options.invoicePrefixes && new Set(options.invoicePrefixes),
      receiptPrefixes: options.receiptPrefixes && new Set(options.receiptPrefixes),
      uniqueInvoiceOrderNumbers: duplicates.invoices,
      uniqueReceiptOrderNumbers: duplicates.receipts,
      strictAuth: options.agentKeys !== undefined || options.users !== undefined,
      agentKeys: new Set(options.agentKeys ?? []),
      taxpayers: normalizedTaxpayers(options.taxpayers),
    },
    invoices: new Map(),
    receipts: new Map(),
    counters: new Map(),
    principals: seededPrincipals(options),
    delegates: new Map(),
    users: new Map(Object.entries(options.users ?? {})),
  }
}

function timeoutError(): DOMException {
  return new DOMException('A hamis Agent nem küldött választ (időtúllépés).', 'TimeoutError')
}

function orderNumberOf(root: XmlElement): string | undefined {
  return childText(findChild(root, 'fejlec'), 'rendelesSzam')
}

function faultFailure(behavior: FaultBehavior, root: XmlElement): FakeAgentFailure {
  const code = behavior.code ?? 1
  if (behavior.message !== undefined) return new FakeAgentFailure(code, behavior.message)
  if (code === 152) {
    const orderNumber = orderNumberOf(root) ?? 'XXX'
    return agentFailure(
      152,
      `Már létező rendelésszám: ${orderNumber}. Az ismétlődés engedélyezhető a Beállítások oldalon.`,
    )
  }
  return agentFailure(code)
}

function respondBefore(behavior: FaultBehavior, request: FakeAgentRequest): FakeAgentResponse {
  if (behavior.effect === 'timeout') throw timeoutError()
  if (behavior.effect === 'network') throw new TypeError('fetch failed')
  if (behavior.effect === 'server-error') return serverErrorResponse()
  return errorResponse(
    errorStyleFor(request.action, request.root),
    faultFailure(behavior, request.root),
  )
}

export function createFakeAgentFetch(options: FakeAgentOptions = {}): FakeAgent {
  let state = createState(options)
  const requests: FakeAgentRequestRecord[] = []
  const faults: PendingFault[] = []

  const scheduleInitialFaults = (): void => {
    for (const scheduled of options.faults ?? [])
      faults.push(pendingFault(scheduled.fault, scheduled))
  }
  scheduleInitialFaults()

  const takeFault = (action: AgentAction): FaultBehavior | undefined => {
    const index = faults.findIndex((fault) => fault.action === undefined || fault.action === action)
    const fault = faults[index]
    if (!fault) return undefined
    fault.remaining -= 1
    if (fault.remaining === 0) faults.splice(index, 1)
    return fault.behavior
  }

  const perform = (request: FakeAgentRequest): { response: FakeAgentResponse; ok: boolean } => {
    try {
      authenticate(state, credentialsOf(request.root))
      return { response: HANDLERS[request.action](state, request), ok: true }
    } catch (error) {
      if (!(error instanceof FakeAgentFailure)) throw error
      return {
        response: errorResponse(errorStyleFor(request.action, request.root), error),
        ok: false,
      }
    }
  }

  const handle = (
    action: AgentAction,
    xml: string,
    attachments: readonly FakeAgentAttachment[],
  ): FakeAgentResponse => {
    let request: FakeAgentRequest
    try {
      request = parseFakeAgentRequest(action, xml, attachments)
    } catch (error) {
      if (!(error instanceof FakeAgentFailure)) throw error
      return errorResponse(errorStyleFor(action, undefined), error)
    }
    const fault = takeFault(action)
    if (fault?.stage === 'before') return respondBefore(fault, request)
    const { response, ok } = perform(request)
    if (fault?.effect === 'timeout') throw timeoutError()
    if (fault && ok) {
      return errorResponse(errorStyleFor(action, request.root), faultFailure(fault, request.root))
    }
    return response
  }

  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    init?.signal?.throwIfAborted()
    const record = await readFakeAgentForm(input, init)
    requests.push(record)
    if (record.action === undefined || record.xml === undefined) {
      return toFetchResponse(errorResponse('text', agentFailure(53)))
    }
    return toFetchResponse(handle(record.action, record.xml, record.attachments))
  }

  return {
    fetch: fakeFetch as typeof globalThis.fetch,
    requests,
    get invoices() {
      return state.invoices
    },
    get receipts() {
      return state.receipts
    },
    fail(fault, faultOptions = {}) {
      faults.push(pendingFault(fault, faultOptions))
    },
    acceptDelegation(taxNumber) {
      acceptDelegation(state, taxNumber)
    },
    reset() {
      state = createState(options)
      requests.length = 0
      faults.length = 0
      scheduleInitialFaults()
    },
  }
}
