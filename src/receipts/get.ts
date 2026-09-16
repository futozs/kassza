import type { AgentContext, RequestOptions } from '../core/context'
import { buildXmlDocument, el, optionalEl, type XmlNode } from '../core/xml/serialize'
import {
  DEFAULT_RECEIPT_DOWNLOAD_PDF,
  optionalText,
  RECEIPT_XSD_BASE_URL,
  receiptValidationError,
  validateTemplate,
} from './common'
import { parseReceiptResponse } from './parse'
import type { GetReceiptInput, Receipt } from './types'

export const GET_RECEIPT_NAMESPACE = 'http://www.szamlazz.hu/xmlnyugtaget'

function normalizeInput(input: GetReceiptInput | string): GetReceiptInput {
  return typeof input === 'string' ? { receiptNumber: input } : input
}

function resolveIdentifier(input: GetReceiptInput): {
  receiptNumber: string | undefined
  orderNumber: string | undefined
} {
  const receiptNumber = optionalText(input.receiptNumber)
  const orderNumber = optionalText(input.orderNumber)
  if (receiptNumber === undefined && orderNumber === undefined) {
    throw receiptValidationError(
      'A nyugta lekérdezéséhez add meg a nyugtaszámot (receiptNumber) vagy a rendelésszámot (orderNumber).',
    )
  }
  if (receiptNumber !== undefined && orderNumber !== undefined) {
    throw receiptValidationError(
      'A nyugta lekérdezéséhez a nyugtaszám (receiptNumber) és a rendelésszám (orderNumber) közül csak az egyiket add meg.',
    )
  }
  return { receiptNumber, orderNumber }
}

export function buildGetReceiptXml(
  credentials: readonly XmlNode[],
  input: GetReceiptInput | string,
): string {
  const normalized = normalizeInput(input)
  const { receiptNumber, orderNumber } = resolveIdentifier(normalized)
  return buildXmlDocument({
    root: 'xmlnyugtaget',
    namespace: GET_RECEIPT_NAMESPACE,
    schemaLocation: `${RECEIPT_XSD_BASE_URL}nyugtaget/xmlnyugtaget.xsd`,
    children: [
      el('beallitasok', [
        ...credentials,
        el('pdfLetoltes', normalized.downloadPdf ?? DEFAULT_RECEIPT_DOWNLOAD_PDF),
      ]),
      el('fejlec', [
        optionalEl('nyugtaszam', receiptNumber),
        optionalEl('rendelesSzam', orderNumber),
        optionalEl('hivasAzonosito', optionalText(normalized.callId)),
        optionalEl('pdfSablon', validateTemplate(normalized.template)),
      ]),
    ],
  })
}

export function getReceipt(
  ctx: AgentContext,
  input: GetReceiptInput | string,
  options: RequestOptions = {},
): Promise<Receipt> {
  const xml = buildGetReceiptXml(ctx.credentials, input)
  return ctx.execute(
    { action: 'getReceipt', xml, signal: options.signal, safeToRetry: true },
    parseReceiptResponse,
  )
}
