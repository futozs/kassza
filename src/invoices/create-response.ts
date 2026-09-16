import { base64ToBytes } from '../core/binary'
import {
  type AgentResponse,
  looksLikeXml,
  parseDoneText,
  parseResponseXml,
  readDocumentHeaders,
  throwIfAnyError,
  throwIfXmlFailure,
  unexpectedResponse,
} from '../core/response'
import { childNumber, childText } from '../core/xml/parse'
import { summarizeItems } from '../money/items'
import type { CreatedInvoice, CreatedInvoiceItem, InvoicePreview } from './create-types'

interface RawInvoiceResponse {
  readonly number: string | undefined
  readonly netTotal: number | undefined
  readonly grossTotal: number | undefined
  readonly outstanding: number | undefined
  readonly buyerAccountUrl: string | undefined
  readonly pdf: Uint8Array | undefined
}

function readRawResponse(response: AgentResponse): RawInvoiceResponse {
  throwIfAnyError(response)
  const headers = readDocumentHeaders(response.headers)
  const fromHeaders: RawInvoiceResponse = {
    number: headers.number,
    netTotal: headers.netTotal,
    grossTotal: headers.grossTotal,
    outstanding: undefined,
    buyerAccountUrl: headers.buyerAccountUrl,
    pdf: undefined,
  }
  if (response.isPdf) return { ...fromHeaders, pdf: response.body }
  if (looksLikeXml(response)) {
    const root = parseResponseXml(response)
    throwIfXmlFailure(root, response)
    const pdfBase64 = childText(root, 'pdf')
    return {
      number: childText(root, 'szamlaszam') ?? headers.number,
      netTotal: childNumber(root, 'szamlanetto') ?? headers.netTotal,
      grossTotal: childNumber(root, 'szamlabrutto') ?? headers.grossTotal,
      outstanding: childNumber(root, 'kintlevoseg'),
      buyerAccountUrl: childText(root, 'vevoifiokurl') ?? headers.buyerAccountUrl,
      pdf: pdfBase64 === undefined ? undefined : base64ToBytes(pdfBase64),
    }
  }
  const done = parseDoneText(response.text())
  if (done) return { ...fromHeaders, number: done.number ?? headers.number }
  if (headers.number !== undefined) return fromHeaders
  throw unexpectedResponse(response, 'Számlaszámot vagy PDF-et vártunk.')
}

function totalsFor(
  raw: RawInvoiceResponse,
  items: readonly CreatedInvoiceItem[],
): { readonly netTotal: number; readonly grossTotal: number } {
  if (raw.netTotal !== undefined && raw.grossTotal !== undefined) {
    return { netTotal: raw.netTotal, grossTotal: raw.grossTotal }
  }
  const computed = summarizeItems(items)
  return {
    netTotal: raw.netTotal ?? computed.netAmount,
    grossTotal: raw.grossTotal ?? computed.grossAmount,
  }
}

export function parseCreateInvoiceResponse(
  response: AgentResponse,
  items: readonly CreatedInvoiceItem[] = [],
): CreatedInvoice {
  const raw = readRawResponse(response)
  if (raw.number === undefined) {
    throw unexpectedResponse(response, 'A sikeres válaszból hiányzik a számlaszám.')
  }
  return {
    number: raw.number,
    ...totalsFor(raw, items),
    outstanding: raw.outstanding,
    buyerAccountUrl: raw.buyerAccountUrl,
    pdf: raw.pdf,
    items,
  }
}

export function parseInvoicePreviewResponse(
  response: AgentResponse,
  items: readonly CreatedInvoiceItem[] = [],
): InvoicePreview {
  const raw = readRawResponse(response)
  if (raw.pdf === undefined) {
    throw unexpectedResponse(response, 'Az előnézeti válaszból hiányzik a PDF.')
  }
  return { pdf: raw.pdf, ...totalsFor(raw, items), items }
}
