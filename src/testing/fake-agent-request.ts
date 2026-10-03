import { AGENT_ACTIONS, type AgentAction } from '../core/actions'
import { childNumber, childText, findChild, parseXml, type XmlElement } from '../core/xml/parse'
import type { FakeAgentErrorStyle } from './fake-agent-http'
import { FakeAgentFailure } from './fake-agent-state'

export interface FakeAgentAttachment {
  readonly filename: string
  readonly size: number
}

export interface FakeAgentRequestRecord {
  readonly action: AgentAction | undefined
  readonly xml: string | undefined
  readonly attachments: readonly FakeAgentAttachment[]
}

export interface FakeAgentCredentials {
  readonly agentKey?: string | undefined
  readonly username?: string | undefined
  readonly password?: string | undefined
}

export interface FakeAgentRequest {
  readonly action: AgentAction
  readonly xml: string
  readonly root: XmlElement
  readonly attachments: readonly FakeAgentAttachment[]
}

const REQUEST_ROOTS: Readonly<Record<AgentAction, string>> = {
  createInvoice: 'xmlszamla',
  reverseInvoice: 'xmlszamlast',
  registerPayment: 'xmlszamlakifiz',
  getInvoicePdf: 'xmlszamlapdf',
  getInvoiceXml: 'xmlszamlaxml',
  deleteProforma: 'xmlszamladbkdel',
  createReceipt: 'xmlnyugtacreate',
  reverseReceipt: 'xmlnyugtast',
  getReceipt: 'xmlnyugtaget',
  sendReceipt: 'xmlnyugtasend',
  queryTaxpayer: 'xmltaxpayer',
  connectPrincipal: 'XmlCegMb',
}

const MAX_ATTACHMENTS = 5

const ACTION_FIELDS = Object.entries(AGENT_ACTIONS) as readonly (readonly [AgentAction, string])[]

async function readForm(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<FormData | undefined> {
  if (init?.body instanceof FormData) return init.body
  try {
    const request =
      input instanceof Request && init === undefined ? input : new Request(input, init)
    return await request.formData()
  } catch {
    return undefined
  }
}

async function entryText(value: FormDataEntryValue): Promise<string> {
  return typeof value === 'string' ? value : value.text()
}

function attachmentsOf(form: FormData): FakeAgentAttachment[] {
  const attachments: FakeAgentAttachment[] = []
  for (let index = 1; index <= MAX_ATTACHMENTS; index++) {
    const value = form.get(`attachfile${index}`)
    if (value instanceof Blob) {
      attachments.push({ filename: value instanceof File ? value.name : '', size: value.size })
    }
  }
  return attachments
}

export async function readFakeAgentForm(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): Promise<FakeAgentRequestRecord> {
  const form = await readForm(input, init)
  if (!form) return { action: undefined, xml: undefined, attachments: [] }
  for (const [action, field] of ACTION_FIELDS) {
    const value = form.get(field)
    if (value !== null) {
      return { action, xml: await entryText(value), attachments: attachmentsOf(form) }
    }
  }
  return { action: undefined, xml: undefined, attachments: attachmentsOf(form) }
}

export function parseFakeAgentRequest(
  action: AgentAction,
  xml: string,
  attachments: readonly FakeAgentAttachment[],
): FakeAgentRequest {
  let root: XmlElement
  try {
    root = parseXml(xml)
  } catch (error) {
    const detail = error instanceof Error ? ` ${error.message}` : ''
    throw new FakeAgentFailure(57, `XML beolvasási hiba.${detail}`)
  }
  const expected = REQUEST_ROOTS[action]
  if (root.name !== expected) {
    throw new FakeAgentFailure(
      57,
      `XML beolvasási hiba. A(z) ${action} művelethez <${expected}> gyökérelem kell, érkezett: <${root.name}>.`,
    )
  }
  return { action, xml, root, attachments }
}

export function credentialsOf(root: XmlElement): FakeAgentCredentials {
  for (const holder of [findChild(root, 'login'), findChild(root, 'beallitasok'), root]) {
    const agentKey = childText(holder, 'szamlaagentkulcs')
    const username = childText(holder, 'felhasznalo') ?? childText(holder, 'loginname')
    const password = childText(holder, 'jelszo') ?? childText(holder, 'password')
    if (agentKey !== undefined || username !== undefined || password !== undefined) {
      return { agentKey, username, password }
    }
  }
  return {}
}

export function responseVersion(root: XmlElement): number {
  return (
    childNumber(findChild(root, 'beallitasok'), 'valaszVerzio') ??
    childNumber(root, 'valaszVerzio') ??
    1
  )
}

export function errorStyleFor(
  action: AgentAction,
  root: XmlElement | undefined,
): FakeAgentErrorStyle {
  switch (action) {
    case 'createInvoice':
    case 'reverseInvoice':
    case 'registerPayment':
    case 'getInvoicePdf':
      return root !== undefined && responseVersion(root) === 2 ? 'invoice' : 'text'
    case 'getInvoiceXml':
      return 'invoice'
    case 'deleteProforma':
      return 'proforma'
    case 'createReceipt':
    case 'reverseReceipt':
    case 'getReceipt':
      return 'receipt'
    case 'sendReceipt':
      return 'receipt-send'
    case 'queryTaxpayer':
    case 'connectPrincipal':
      return 'text'
  }
}
