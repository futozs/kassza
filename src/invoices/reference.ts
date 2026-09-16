import { base64ToBytes } from '../core/binary'
import { type DateInput, toAgentDate } from '../core/dates'
import { SzamlazzError } from '../core/errors'
import {
  type AgentResponse,
  looksLikeXml,
  parseDoneText,
  parseResponseXml,
  readDocumentHeaders,
  readHeader,
  throwIfHeaderError,
  throwIfHttpError,
  throwIfTextError,
  throwIfXmlFailure,
  unexpectedResponse,
} from '../core/response'
import { childNumber, childText, type XmlElement } from '../core/xml/parse'

export const AGENT_XSD_BASE_URL = 'https://www.szamlazz.hu/szamla/docs/xsds/'

export const RESPONSE_VERSION_XML = 2

export type InvoiceReference =
  | string
  | { readonly invoiceNumber: string }
  | { readonly orderNumber: string }
  | { readonly externalId: string }

export type ResolvedInvoiceReference =
  | { readonly kind: 'invoiceNumber'; readonly value: string }
  | { readonly kind: 'orderNumber'; readonly value: string }
  | { readonly kind: 'externalId'; readonly value: string }

export function validationError(message: string): SzamlazzError {
  return new SzamlazzError(message, { category: 'validation' })
}

export function requireText(value: unknown, message: string): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (trimmed === '') throw validationError(message)
  return trimmed
}

export function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export function agentDate(input: DateInput, field: string): string {
  try {
    return toAgentDate(input)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new SzamlazzError(`Érvénytelen dátum (${field}): ${detail}`, {
      category: 'validation',
      cause: error,
    })
  }
}

export function optionalAgentDate(input: DateInput | undefined, field: string): string | undefined {
  return input === undefined ? undefined : agentDate(input, field)
}

const REFERENCE_KEYS = ['invoiceNumber', 'orderNumber', 'externalId'] as const

const REFERENCE_HINT =
  'Add meg a számlaszámot szövegként, vagy pontosan egyet ezek közül: { invoiceNumber }, { orderNumber }, { externalId }.'

export function resolveInvoiceReference(reference: InvoiceReference): ResolvedInvoiceReference {
  if (typeof reference === 'string') {
    return {
      kind: 'invoiceNumber',
      value: requireText(reference, `Üres számlaszám. ${REFERENCE_HINT}`),
    }
  }
  if (typeof reference !== 'object' || reference === null) {
    throw validationError(`Érvénytelen bizonylat-hivatkozás. ${REFERENCE_HINT}`)
  }
  const record = reference as Readonly<Record<string, unknown>>
  const present = REFERENCE_KEYS.filter((key) => record[key] !== undefined)
  const [kind] = present
  if (kind === undefined || present.length > 1) {
    throw validationError(`Érvénytelen bizonylat-hivatkozás. ${REFERENCE_HINT}`)
  }
  return { kind, value: requireText(record[kind], `Üres ${kind} érték. ${REFERENCE_HINT}`) }
}

export function referenceValue(
  reference: ResolvedInvoiceReference,
  kind: ResolvedInvoiceReference['kind'],
): string | undefined {
  return reference.kind === kind ? reference.value : undefined
}

export interface InvoiceResultSummary {
  readonly number?: string | undefined
  readonly netTotal?: number | undefined
  readonly grossTotal?: number | undefined
  readonly outstanding?: number | undefined
  readonly buyerAccountUrl?: string | undefined
  readonly pdf?: Uint8Array | undefined
}

function readNumericHeader(headers: Headers, name: string): number | undefined {
  const value = readHeader(headers, name)
  if (value === undefined) return undefined
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : undefined
}

function headerSummary(response: AgentResponse): InvoiceResultSummary {
  const headers = readDocumentHeaders(response.headers)
  return {
    number: headers.number,
    netTotal: headers.netTotal,
    grossTotal: headers.grossTotal,
    outstanding: readNumericHeader(response.headers, 'szlahu_kintlevoseg'),
    buyerAccountUrl: headers.buyerAccountUrl,
  }
}

export function decodeResponsePdf(
  root: XmlElement,
  response: AgentResponse,
): Uint8Array | undefined {
  const encoded = childText(root, 'pdf')
  if (encoded === undefined) return undefined
  try {
    return base64ToBytes(encoded)
  } catch (error) {
    throw new SzamlazzError('A válaszban kapott PDF nem érvényes base64.', {
      category: 'unexpected_response',
      action: response.action,
      httpStatus: response.status,
      cause: error,
    })
  }
}

export function readInvoiceResultXml(
  root: XmlElement,
  response: AgentResponse,
): InvoiceResultSummary {
  const headers = headerSummary(response)
  return {
    number: childText(root, 'szamlaszam') ?? headers.number,
    netTotal: childNumber(root, 'szamlanetto') ?? headers.netTotal,
    grossTotal: childNumber(root, 'szamlabrutto') ?? headers.grossTotal,
    outstanding: childNumber(root, 'kintlevoseg') ?? headers.outstanding,
    buyerAccountUrl: childText(root, 'vevoifiokurl') ?? headers.buyerAccountUrl,
    pdf: decodeResponsePdf(root, response),
  }
}

const INVOICE_RESULT_ROOT = 'xmlszamlavalasz'

export function parseInvoiceResult(response: AgentResponse): InvoiceResultSummary {
  throwIfHeaderError(response)
  if (response.isPdf) return { ...headerSummary(response), pdf: response.body }
  throwIfTextError(response)
  throwIfHttpError(response)
  if (looksLikeXml(response)) {
    const root = parseResponseXml(response)
    throwIfXmlFailure(root, response)
    if (root.name !== INVOICE_RESULT_ROOT || childText(root, 'sikeres')?.toLowerCase() !== 'true') {
      throw unexpectedResponse(response, `${INVOICE_RESULT_ROOT} XML választ vártunk.`)
    }
    return readInvoiceResultXml(root, response)
  }
  const headers = headerSummary(response)
  const done = parseDoneText(response.text())
  if (done) return { ...headers, number: done.number ?? headers.number }
  if (headers.number !== undefined) return headers
  throw unexpectedResponse(response)
}
