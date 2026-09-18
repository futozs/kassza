import { AGENT_ACTIONS, type AgentAction, SZAMLAZZ_AGENT_URL } from 'kassza'
import {
  handleCreateInvoice,
  handleDeleteProforma,
  handleGetInvoicePdf,
  handleGetInvoiceXml,
  handleRegisterPayment,
  handleReverseInvoice,
  INVOICE_RESPONSE,
  PROFORMA_DELETE_RESPONSE,
} from './invoices'
import {
  handleCreateReceipt,
  handleGetReceipt,
  handleReverseReceipt,
  handleSendReceipt,
  RECEIPT_RESPONSE,
  RECEIPT_SEND_RESPONSE,
} from './receipts'
import {
  AgentFault,
  htmlErrorResponse,
  type SimResponse,
  textErrorResponse,
  xmlErrorResponse,
} from './respond'
import { SELLER, SimulatorStore } from './store'
import { handleQueryTaxpayer } from './taxpayer'
import type {
  AccountSnapshot,
  SimulatedAttachment,
  SimulatedCall,
  SimulatedFailure,
  SimulatorOptions,
} from './types'
import { child, parseXml, text, type XmlElement } from './xml'

export { DEFAULT_INVOICE_PREFIXES, SELLER } from './store'
export { TAXPAYER_FIXTURES } from './taxpayer'
export type { AccountSnapshot, SimulatedCall, SimulatedFailure, SimulatorOptions } from './types'

type Handler = (store: SimulatorStore, root: XmlElement) => SimResponse

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
}

const invoiceError = (fault: AgentFault): SimResponse =>
  xmlErrorResponse(INVOICE_RESPONSE.root, INVOICE_RESPONSE.namespace, fault)
const receiptError = (fault: AgentFault): SimResponse =>
  xmlErrorResponse(RECEIPT_RESPONSE.root, RECEIPT_RESPONSE.namespace, fault)

const ERROR_RESPONSES: Readonly<Record<AgentAction, (fault: AgentFault) => SimResponse>> = {
  createInvoice: invoiceError,
  reverseInvoice: invoiceError,
  registerPayment: invoiceError,
  getInvoicePdf: invoiceError,
  getInvoiceXml: textErrorResponse,
  deleteProforma: (fault) =>
    xmlErrorResponse(PROFORMA_DELETE_RESPONSE.root, PROFORMA_DELETE_RESPONSE.namespace, fault),
  createReceipt: receiptError,
  reverseReceipt: receiptError,
  getReceipt: receiptError,
  sendReceipt: (fault) =>
    xmlErrorResponse(RECEIPT_SEND_RESPONSE.root, RECEIPT_SEND_RESPONSE.namespace, fault),
  queryTaxpayer: textErrorResponse,
}

const ACTIONS_BY_FIELD: ReadonlyMap<string, AgentAction> = new Map(
  Object.entries(AGENT_ACTIONS).map(([action, field]) => [field, action as AgentAction]),
)

export interface AgentSimulator {
  readonly fetch: typeof globalThis.fetch
  readonly calls: readonly SimulatedCall[]
  failNext(action: AgentAction, failure: SimulatedFailure): void
  onCall(listener: (call: SimulatedCall) => void): () => void
  snapshot(): AccountSnapshot
  reset(): void
}

function redact(xml: string): string {
  return xml
    .replace(/(<szamlaagentkulcs>)[^<]*(<\/szamlaagentkulcs>)/g, '$1••••••••$2')
    .replace(/(<jelszo>)[^<]*(<\/jelszo>)/g, '$1••••••••$2')
}

function previewBody(response: SimResponse): string {
  if (response.kind === 'pdf') return `[PDF, ${response.body.byteLength} bájt]`
  const body = new TextDecoder().decode(response.body)
  return body.replace(
    /<(pdf|nyugtaPdf)>([^<]{80})[^<]*<\/(pdf|nyugtaPdf)>/g,
    (_match, open: string, start: string, close: string) =>
      `<${open}>${start}… (base64 PDF, rövidítve)</${close}>`,
  )
}

function assertCredentials(root: XmlElement): void {
  const settings = child(root, 'beallitasok')
  const key = text(settings, 'szamlaagentkulcs') ?? text(root, 'szamlaagentkulcs')
  if (key) {
    if (key.startsWith('rossz')) throw new AgentFault(3)
    return
  }
  const user = text(settings, 'felhasznalo') ?? text(root, 'felhasznalo')
  const password = text(settings, 'jelszo') ?? text(root, 'jelszo')
  if (!user || !password || password.startsWith('rossz')) throw new AgentFault(3)
}

function wait(
  range: readonly [number, number] | undefined,
  signal: AbortSignal | null | undefined,
): Promise<void> {
  if (!range) return Promise.resolve()
  const [min, max] = range
  const delay = min + Math.random() * Math.max(0, max - min)
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const timer = setTimeout(resolve, delay)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(signal.reason)
      },
      { once: true },
    )
  })
}

function randomSession(): string {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return [...bytes]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

function responseLike(
  status: number,
  entries: readonly (readonly [string, string])[],
  body: Uint8Array,
): Response {
  const headers = new Headers()
  for (const [name, value] of entries) headers.append(name, value)
  const buffer = body.slice().buffer
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: '',
    url: SZAMLAZZ_AGENT_URL,
    headers,
    arrayBuffer: async () => buffer.slice(0),
    text: async () => new TextDecoder().decode(body),
  } as unknown as Response
}

function partialSuccess(action: AgentAction, response: SimResponse): SimResponse {
  const failed = ERROR_RESPONSES[action](new AgentFault(56))
  return {
    ...failed,
    effects: [
      ...response.effects,
      'A bizonylat elkészült, de a szimulált értesítő e-mail kiküldése sikertelen (56).',
    ],
  }
}

export function createAgentSimulator(options: SimulatorOptions = {}): AgentSimulator {
  let store = new SimulatorStore(options)
  const calls: SimulatedCall[] = []
  const failures = new Map<AgentAction, SimulatedFailure[]>()
  const listeners = new Set<(call: SimulatedCall) => void>()
  let nextCallId = 1

  function record(call: Omit<SimulatedCall, 'id'>): void {
    const complete: SimulatedCall = { id: nextCallId++, ...call }
    calls.push(complete)
    for (const listener of listeners) listener(complete)
  }

  async function simulatedFetch(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const startedAt = Date.now()
    const body = init?.body
    if (!(body instanceof FormData)) {
      throw new TypeError('A szimulátor csak multipart/form-data kérést fogad.')
    }
    let field = ''
    let xml = ''
    const attachments: SimulatedAttachment[] = []
    for (const [name, value] of body.entries()) {
      if (typeof value === 'string') continue
      if (name.startsWith('action-')) {
        field = name
        xml = await value.text()
      } else {
        attachments.push({ name: value.name, size: value.size, type: value.type })
      }
    }
    const action = ACTIONS_BY_FIELD.get(field)
    if (!action) throw new TypeError(`Ismeretlen Számla Agent művelet: ${field}`)

    const cookie = new Headers(init?.headers).get('cookie') ?? ''
    const sessionReused = store.session !== undefined && cookie.includes(store.session)
    await wait(options.latencyMs, init?.signal)

    const queue = failures.get(action)
    const failure = queue?.shift()
    const base = {
      action,
      field,
      startedAt,
      requestXml: redact(xml),
      attachments,
      sessionReused,
    }

    if (failure === 'network' || failure === 'timeout') {
      record({
        ...base,
        durationMs: Date.now() - startedAt,
        status: failure === 'network' ? 'network-error' : 'timeout',
        responseHeaders: [],
        responseBody: '',
        responseKind: 'none',
        effects: [
          failure === 'network'
            ? 'Szimulált hálózati hiba: a válasz nem érkezett meg.'
            : 'Szimulált időtúllépés: a Számlázz.hu nem válaszolt időben.',
        ],
      })
      if (failure === 'network') throw new TypeError('fetch failed')
      throw new DOMException('The operation timed out.', 'TimeoutError')
    }

    let response: SimResponse
    if (failure === 'server-error') {
      response = htmlErrorResponse(502)
    } else if (failure === 'maintenance') {
      response = ERROR_RESPONSES[action](new AgentFault(1))
    } else {
      try {
        const root = parseXml(xml)
        assertCredentials(root)
        if (typeof failure === 'number' && failure !== 56) throw new AgentFault(failure)
        response = HANDLERS[action](store, root)
        if (failure === 56) response = partialSuccess(action, response)
      } catch (error) {
        const fault =
          error instanceof AgentFault
            ? error
            : new AgentFault(
                57,
                `XML beolvasási hiba: ${error instanceof Error ? error.message : String(error)}`,
              )
        response = ERROR_RESPONSES[action](fault)
      }
    }

    const responseHeaders = [...response.headers]
    if (!sessionReused) {
      store.session = `JSESSIONID=${randomSession()}`
      responseHeaders.push(['set-cookie', `${store.session}; Path=/szamla; Secure; HttpOnly`])
    }
    record({
      ...base,
      durationMs: Date.now() - startedAt,
      status: response.status,
      responseHeaders,
      responseBody: previewBody(response),
      responseKind: response.kind,
      effects: response.effects,
    })
    return responseLike(response.status, responseHeaders, response.body)
  }

  return {
    fetch: simulatedFetch as typeof globalThis.fetch,
    calls,
    failNext(action, failure) {
      failures.set(action, [...(failures.get(action) ?? []), failure])
    },
    onCall(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    snapshot() {
      return {
        seller: {
          name: SELLER.name,
          taxNumber: SELLER.taxNumber,
          address: `${SELLER.zip} ${SELLER.city}, ${SELLER.address}`,
          bankAccount: SELLER.bankAccount,
        },
        invoicePrefixes: [...store.invoicePrefixes],
        invoices: store.invoices.map((invoice) => ({
          ...invoice,
          payments: [...invoice.payments],
        })),
        receipts: store.receipts.map((receipt) => ({ ...receipt, sentTo: [...receipt.sentTo] })),
        sessionActive: store.session !== undefined,
      }
    },
    reset() {
      store = new SimulatorStore(options)
      calls.length = 0
      failures.clear()
      nextCallId = 1
    },
  }
}
