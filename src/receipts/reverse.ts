import type { AgentContext, RequestOptions } from '../core/context'
import { buildXmlDocument, el, optionalEl, type XmlNode } from '../core/xml/serialize'
import {
  DEFAULT_RECEIPT_DOWNLOAD_PDF,
  optionalText,
  RECEIPT_XSD_BASE_URL,
  requireReceiptNumber,
  validateTemplate,
} from './common'
import { parseReceiptResponse } from './parse'
import type { Receipt, ReverseReceiptInput } from './types'

export const REVERSE_RECEIPT_NAMESPACE = 'http://www.szamlazz.hu/xmlnyugtast'

function normalizeInput(input: ReverseReceiptInput | string): ReverseReceiptInput {
  return typeof input === 'string' ? { receiptNumber: input } : input
}

export function buildReverseReceiptXml(
  credentials: readonly XmlNode[],
  input: ReverseReceiptInput | string,
): string {
  const normalized = normalizeInput(input)
  return buildXmlDocument({
    root: 'xmlnyugtast',
    namespace: REVERSE_RECEIPT_NAMESPACE,
    schemaLocation: `${RECEIPT_XSD_BASE_URL}nyugtast/xmlnyugtast.xsd`,
    children: [
      el('beallitasok', [
        ...credentials,
        el('pdfLetoltes', normalized.downloadPdf ?? DEFAULT_RECEIPT_DOWNLOAD_PDF),
      ]),
      el('fejlec', [
        el('nyugtaszam', requireReceiptNumber(normalized.receiptNumber)),
        optionalEl('pdfSablon', validateTemplate(normalized.template)),
        optionalEl('hivasAzonosito', optionalText(normalized.callId)),
      ]),
    ],
  })
}

export function reverseReceipt(
  ctx: AgentContext,
  input: ReverseReceiptInput | string,
  options: RequestOptions = {},
): Promise<Receipt> {
  const normalized = normalizeInput(input)
  const xml = buildReverseReceiptXml(ctx.credentials, normalized)
  return ctx.execute(
    {
      action: 'reverseReceipt',
      xml,
      signal: options.signal,
      safeToRetry: optionalText(normalized.callId) !== undefined,
    },
    parseReceiptResponse,
  )
}
