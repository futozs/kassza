import { bytesToBase64 } from '../core/binary'
import {
  buildXmlDocument,
  el,
  formatXmlNumber,
  optionalEl,
  type XmlChild,
} from '../core/xml/serialize'
import type { FakeAgentFailure } from './fake-agent-state'

export interface FakeAgentResponse {
  readonly status: number
  readonly headers: Readonly<Record<string, string>>
  readonly body: string | Uint8Array
}

export type FakeAgentErrorStyle = 'invoice' | 'text' | 'receipt' | 'receipt-send' | 'proforma'

const XML_CONTENT_TYPE = 'application/xml; charset=UTF-8'
const TEXT_CONTENT_TYPE = 'text/plain; charset=UTF-8'
const PDF_CONTENT_TYPE = 'application/pdf'

const ERROR_ROOTS: Readonly<Record<Exclude<FakeAgentErrorStyle, 'text'>, string>> = {
  invoice: 'xmlszamlavalasz',
  receipt: 'xmlnyugtavalasz',
  'receipt-send': 'xmlnyugtasendvalasz',
  proforma: 'xmlszamladbkdelvalasz',
}

export function encodeHeaderValue(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, '+')
}

export function xmlResponse(
  xml: string,
  headers: Readonly<Record<string, string>> = {},
): FakeAgentResponse {
  return { status: 200, headers: { 'content-type': XML_CONTENT_TYPE, ...headers }, body: xml }
}

export function textResponse(
  text: string,
  headers: Readonly<Record<string, string>> = {},
  status = 200,
): FakeAgentResponse {
  return { status, headers: { 'content-type': TEXT_CONTENT_TYPE, ...headers }, body: text }
}

export function pdfResponse(
  pdf: Uint8Array,
  headers: Readonly<Record<string, string>> = {},
): FakeAgentResponse {
  return { status: 200, headers: { 'content-type': PDF_CONTENT_TYPE, ...headers }, body: pdf }
}

export function serverErrorResponse(): FakeAgentResponse {
  return {
    status: 500,
    headers: { 'content-type': 'text/html; charset=UTF-8' },
    body: '<!DOCTYPE html><html><body><h1>500 Internal Server Error</h1></body></html>',
  }
}

export function namespaceOf(root: string): string {
  return `http://www.szamlazz.hu/${root}`
}

export function xmlDocument(root: string, children: readonly XmlChild[]): string {
  return buildXmlDocument({ root, namespace: namespaceOf(root), children })
}

function errorHeaders(failure: FakeAgentFailure): Record<string, string> {
  return {
    szlahu_error: encodeHeaderValue(failure.message),
    ...(failure.code === undefined ? {} : { szlahu_error_code: String(failure.code) }),
  }
}

function errorText(failure: FakeAgentFailure): string {
  const code = failure.code === undefined ? '' : `[${failure.code}] `
  return `[ERR] ${code}${failure.message}\n----------\nkassza hamis Agent\n`
}

export function errorResponse(
  style: FakeAgentErrorStyle,
  failure: FakeAgentFailure,
): FakeAgentResponse {
  if (style === 'text') return textResponse(errorText(failure), errorHeaders(failure))
  const xml = xmlDocument(ERROR_ROOTS[style], [
    el('sikeres', false),
    optionalEl('hibakod', failure.code),
    el('hibauzenet', failure.message),
  ])
  return xmlResponse(xml, style === 'invoice' ? errorHeaders(failure) : {})
}

export interface InvoiceResultFields {
  readonly number?: string | undefined
  readonly netTotal?: number | undefined
  readonly grossTotal?: number | undefined
  readonly outstanding?: number | undefined
  readonly paymentMethod?: string | undefined
  readonly pdf?: Uint8Array | undefined
}

export function invoiceResultHeaders(fields: InvoiceResultFields): Record<string, string> {
  const headers: Record<string, string> = {}
  if (fields.number !== undefined) headers.szlahu_szamlaszam = encodeHeaderValue(fields.number)
  if (fields.netTotal !== undefined) {
    headers.szlahu_nettovegosszeg = formatXmlNumber(fields.netTotal)
  }
  if (fields.grossTotal !== undefined) {
    headers.szlahu_bruttovegosszeg = formatXmlNumber(fields.grossTotal)
  }
  if (fields.outstanding !== undefined) {
    headers.szlahu_kintlevoseg = formatXmlNumber(fields.outstanding)
  }
  if (fields.paymentMethod !== undefined) {
    headers.szlahu_fizetesmod = encodeHeaderValue(fields.paymentMethod)
  }
  return headers
}

export function invoiceResultResponse(
  fields: InvoiceResultFields,
  version: number,
): FakeAgentResponse {
  const headers = invoiceResultHeaders(fields)
  if (version === 2) {
    const xml = xmlDocument('xmlszamlavalasz', [
      el('sikeres', true),
      optionalEl('szamlaszam', fields.number),
      optionalEl('szamlanetto', fields.netTotal),
      optionalEl('szamlabrutto', fields.grossTotal),
      optionalEl('kintlevoseg', fields.outstanding),
      optionalEl('pdf', fields.pdf && bytesToBase64(fields.pdf)),
    ])
    return xmlResponse(xml, headers)
  }
  if (fields.pdf) return pdfResponse(fields.pdf, headers)
  const suffix = fields.number === undefined ? '' : `;${fields.number}`
  return textResponse(`xmlagentresponse=DONE${suffix}\n`, headers)
}

export function toFetchResponse(response: FakeAgentResponse): Response {
  const body =
    typeof response.body === 'string' ? response.body : new Blob([response.body as BlobPart])
  return new Response(body, { status: response.status, headers: response.headers })
}
