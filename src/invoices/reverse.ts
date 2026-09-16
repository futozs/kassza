import type { AgentContext, RequestOptions } from '../core/context'
import type { DateInput } from '../core/dates'
import { SzamlazzError } from '../core/errors'
import { type AgentResponse, unexpectedResponse } from '../core/response'
import { buildXmlDocument, el, optionalEl, type XmlNode } from '../core/xml/serialize'
import { INVOICE_TEMPLATES, type InvoiceTemplate } from './create-types'
import {
  AGENT_XSD_BASE_URL,
  optionalAgentDate,
  optionalText,
  parseInvoiceResult,
  RESPONSE_VERSION_XML,
  requireText,
  validationError,
} from './reference'

export const REVERSAL_DOCUMENT_TYPE = 'SS'

export interface ReverseInvoiceEmail {
  readonly replyTo?: string | undefined
  readonly subject?: string | undefined
  readonly text?: string | undefined
}

export interface ReverseInvoiceBuyer {
  readonly email?: string | undefined
  readonly taxNumber?: string | undefined
  readonly euTaxNumber?: string | undefined
}

export interface ReverseInvoiceOptions {
  readonly invoiceNumber: string
  readonly issueDate?: DateInput | undefined
  readonly fulfillmentDate?: DateInput | undefined
  readonly comment?: string | undefined
  readonly template?: InvoiceTemplate | undefined
  readonly eInvoice?: boolean | undefined
  readonly downloadPdf?: boolean | undefined
  readonly externalId?: string | undefined
  readonly email?: ReverseInvoiceEmail | undefined
  readonly buyer?: ReverseInvoiceBuyer | undefined
}

export type ReverseInvoiceInput = string | ReverseInvoiceOptions

export interface ReversedInvoice {
  readonly number: string
  readonly netTotal?: number | undefined
  readonly grossTotal?: number | undefined
  readonly outstanding?: number | undefined
  readonly buyerAccountUrl?: string | undefined
  readonly pdf?: Uint8Array | undefined
}

const templates: ReadonlySet<string> = new Set(INVOICE_TEMPLATES)

function normalizeInput(input: ReverseInvoiceInput): ReverseInvoiceOptions {
  return typeof input === 'string' ? { invoiceNumber: input } : input
}

function validateTemplate(template: InvoiceTemplate | undefined): InvoiceTemplate | undefined {
  if (template === undefined || templates.has(template)) return template
  throw validationError(
    `Ismeretlen számlasablon: ${String(template)}. Lehetséges értékek: ${INVOICE_TEMPLATES.join(', ')}.`,
  )
}

export function buildReverseInvoiceXml(
  credentials: readonly XmlNode[],
  input: ReverseInvoiceInput,
): string {
  const options = normalizeInput(input)
  const invoiceNumber = requireText(
    options.invoiceNumber,
    'Add meg a sztornózandó számla számát (invoiceNumber).',
  )
  const email = options.email
  const buyer = options.buyer
  return buildXmlDocument({
    root: 'xmlszamlast',
    namespace: 'http://www.szamlazz.hu/xmlszamlast',
    schemaLocation: `${AGENT_XSD_BASE_URL}agentst/xmlszamlast.xsd`,
    children: [
      el('beallitasok', [
        ...credentials,
        el('eszamla', options.eInvoice ?? false),
        el('szamlaLetoltes', options.downloadPdf ?? true),
        el('valaszVerzio', RESPONSE_VERSION_XML),
        optionalEl('szamlaKulsoAzon', optionalText(options.externalId)),
      ]),
      el('fejlec', [
        el('szamlaszam', invoiceNumber),
        optionalEl('keltDatum', optionalAgentDate(options.issueDate, 'issueDate')),
        optionalEl(
          'teljesitesDatum',
          optionalAgentDate(options.fulfillmentDate, 'fulfillmentDate'),
        ),
        optionalEl('megjegyzes', optionalText(options.comment)),
        el('tipus', REVERSAL_DOCUMENT_TYPE),
        optionalEl('szamlaSablon', validateTemplate(options.template)),
      ]),
      optionalEl('elado', [
        optionalEl('emailReplyto', optionalText(email?.replyTo)),
        optionalEl('emailTargy', optionalText(email?.subject)),
        optionalEl('emailSzoveg', optionalText(email?.text)),
      ]),
      optionalEl('vevo', [
        optionalEl('email', optionalText(buyer?.email)),
        optionalEl('adoszam', optionalText(buyer?.taxNumber)),
        optionalEl('adoszamEU', optionalText(buyer?.euTaxNumber)),
      ]),
    ],
  })
}

export function parseReverseInvoiceResponse(
  response: AgentResponse,
  originalInvoiceNumber?: string,
): ReversedInvoice {
  const result = parseInvoiceResult(response)
  if (result.number === undefined) {
    throw unexpectedResponse(response, 'A válaszban nincs sztornó számlaszám.')
  }
  if (originalInvoiceNumber !== undefined && result.number === originalInvoiceNumber.trim()) {
    throw new SzamlazzError(
      `A(z) ${result.number} bizonylat nem lett sztornózva: a Számlázz.hu az eredeti bizonylatot adta vissza.`,
      {
        category: 'validation',
        action: response.action,
        httpStatus: response.status,
        hint: 'Díjbekérő és szállítólevél nem sztornózható. Díjbekérőt a deleteProforma függvénnyel törölhetsz.',
      },
    )
  }
  return { ...result, number: result.number }
}

export async function reverseInvoice(
  ctx: AgentContext,
  input: ReverseInvoiceInput,
  options: RequestOptions = {},
): Promise<ReversedInvoice> {
  const invoiceNumber = normalizeInput(input).invoiceNumber
  const xml = buildReverseInvoiceXml(ctx.credentials, input)
  return ctx.execute({ action: 'reverseInvoice', xml, signal: options.signal }, (response) =>
    parseReverseInvoiceResponse(response, invoiceNumber),
  )
}
