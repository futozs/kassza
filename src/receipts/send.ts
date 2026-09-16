import type { AgentContext, RequestOptions } from '../core/context'
import {
  type AgentResponse,
  looksLikeXml,
  parseDoneText,
  parseResponseXml,
  throwIfHeaderError,
  throwIfHttpError,
  throwIfTextError,
  throwIfXmlFailure,
  unexpectedResponse,
} from '../core/response'
import { childBoolean } from '../core/xml/parse'
import { buildXmlDocument, el, optionalEl, type XmlNode } from '../core/xml/serialize'
import {
  optionalText,
  RECEIPT_XSD_BASE_URL,
  receiptValidationError,
  requireReceiptNumber,
} from './common'
import type { SendReceiptInput } from './types'

export const SEND_RECEIPT_NAMESPACE = 'http://www.szamlazz.hu/xmlnyugtasend'

const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value)
}

function assertEmail(value: string, field: string): string {
  if (!isValidEmail(value)) {
    throw receiptValidationError(`Érvénytelen e-mail cím a(z) ${field} mezőben: ${value}`)
  }
  return value
}

export function normalizeEmails(emails: string | readonly string[]): string[] {
  const list = (typeof emails === 'string' ? [emails] : [...emails])
    .flatMap((entry) => entry.split(/[,;]/))
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
  if (list.length === 0) {
    throw receiptValidationError('Adj meg legalább egy címzett e-mail címet (emails).')
  }
  return list.map((email) => assertEmail(email, 'emails'))
}

export function buildSendReceiptXml(
  credentials: readonly XmlNode[],
  input: SendReceiptInput,
): string {
  const receiptNumber = requireReceiptNumber(input.receiptNumber)
  const emails = normalizeEmails(input.emails)
  const replyTo = optionalText(input.replyTo)
  if (replyTo !== undefined) assertEmail(replyTo, 'replyTo')
  return buildXmlDocument({
    root: 'xmlnyugtasend',
    namespace: SEND_RECEIPT_NAMESPACE,
    schemaLocation: `${RECEIPT_XSD_BASE_URL}nyugtasend/xmlnyugtasend.xsd`,
    children: [
      el('beallitasok', credentials),
      el('fejlec', [el('nyugtaszam', receiptNumber)]),
      el('emailKuldes', [
        el('email', emails.join(',')),
        optionalEl('emailReplyto', replyTo),
        el('emailTargy', optionalText(input.subject) ?? `Nyugta ${receiptNumber}`),
        optionalEl('emailSzoveg', input.text?.trim() ? input.text : undefined),
      ]),
    ],
  })
}

export function parseSendReceiptResponse(response: AgentResponse): void {
  throwIfHeaderError(response)
  throwIfTextError(response)
  if (!looksLikeXml(response)) {
    throwIfHttpError(response)
    if (parseDoneText(response.text())) return
    throw unexpectedResponse(response, 'XML választ vártunk a nyugta kiküldésére.')
  }
  const root = parseResponseXml(response)
  throwIfXmlFailure(root, response)
  if (childBoolean(root, 'sikeres') !== true) {
    throwIfHttpError(response)
    throw unexpectedResponse(response, 'A válasz nem jelez sikeres kiküldést.')
  }
}

export function sendReceipt(
  ctx: AgentContext,
  input: SendReceiptInput,
  options: RequestOptions = {},
): Promise<void> {
  const xml = buildSendReceiptXml(ctx.credentials, input)
  return ctx.execute(
    { action: 'sendReceipt', xml, signal: options.signal },
    parseSendReceiptResponse,
  )
}
