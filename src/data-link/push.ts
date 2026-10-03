import { encodeUtf8 } from '../core/binary'
import { SzamlazzError } from '../core/errors'
import { createAgentResponse } from '../core/response'
import {
  childBoolean,
  childNumber,
  childText,
  findChild,
  findChildren,
  parseXml,
  type XmlElement,
  XmlParseError,
} from '../core/xml/parse'
import { type InvoiceDetails, parseInvoiceDetailsXml } from '../invoices/get'
import { parseReceiptElement } from '../receipts/parse'
import type { Receipt } from '../receipts/types'

export type DataLinkPushKind = 'invoice' | 'incoming-invoice' | 'bank-transaction' | 'receipts'

export type DataLinkErrorReason =
  | 'invalid_payload'
  | 'payload_too_large'
  | 'unknown_document'
  | 'missing_key'

export class DataLinkError extends Error {
  override readonly name: string = 'DataLinkError'
  readonly reason: DataLinkErrorReason

  constructor(reason: DataLinkErrorReason, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.reason = reason
  }
}

interface DataLinkPushBase {
  readonly key: string | undefined
  readonly raw: string
}

export interface DataLinkInvoicePush extends DataLinkPushBase {
  readonly kind: 'invoice' | 'incoming-invoice'
  readonly id: number
  readonly invoice: InvoiceDetails
  readonly deleted: boolean
}

export interface DataLinkBankTransactionPartner {
  readonly name?: string | undefined
  readonly accountNumber?: string | undefined
}

export interface DataLinkBankTransaction {
  readonly id: number
  readonly accountNumber: string
  readonly valueDate: string
  readonly direction: 'in' | 'out'
  readonly type?: string | undefined
  readonly technical: boolean
  readonly amount: number
  readonly currency: string
  readonly partner?: DataLinkBankTransactionPartner | undefined
  readonly reference?: string | undefined
}

export interface DataLinkBankTransactionPush extends DataLinkPushBase {
  readonly kind: 'bank-transaction'
  readonly transaction: DataLinkBankTransaction
}

export interface DataLinkArchivedReceipt {
  readonly receipt: Receipt
  readonly issuerTaxNumber?: string | undefined
}

export interface DataLinkReceiptsPush extends DataLinkPushBase {
  readonly kind: 'receipts'
  readonly receipts: readonly DataLinkArchivedReceipt[]
}

export type DataLinkPush = DataLinkInvoicePush | DataLinkBankTransactionPush | DataLinkReceiptsPush

const ROOT_KINDS: ReadonlyMap<string, DataLinkPushKind> = new Map([
  ['szamla', 'invoice'],
  ['szamlabe', 'incoming-invoice'],
  ['banktranz', 'bank-transaction'],
  ['xmlnyugtaarchiv', 'receipts'],
])

function invalid(message: string, cause?: unknown): DataLinkError {
  return new DataLinkError('invalid_payload', message, cause)
}

function requiredText(element: XmlElement | undefined, name: string, path: string): string {
  const value = childText(element, name)
  if (value === undefined) throw invalid(`Hiányzik a(z) <${path}/${name}> elem.`)
  return value
}

function requiredInteger(element: XmlElement | undefined, name: string, path: string): number {
  const value = Number(requiredText(element, name, path))
  if (!Number.isInteger(value)) throw invalid(`A(z) <${path}/${name}> nem egész szám.`)
  return value
}

function wrapSzamlazzError<T>(read: () => T): T {
  try {
    return read()
  } catch (error) {
    if (error instanceof SzamlazzError) throw invalid(error.message, error)
    throw error
  }
}

function invoicePush(
  kind: 'invoice' | 'incoming-invoice',
  root: XmlElement,
  raw: string,
  key: string | undefined,
): DataLinkInvoicePush {
  const header = findChild(root, 'alap')
  const id = requiredInteger(header, 'id', 'alap')
  const response = createAgentResponse('getInvoiceXml', 200, new Headers(), encodeUtf8(raw))
  const invoice = wrapSzamlazzError(() => parseInvoiceDetailsXml(root, response))
  return { kind, key, raw, id, invoice, deleted: childBoolean(header, 'dobdel') === true }
}

function bankTransactionPush(
  root: XmlElement,
  raw: string,
  key: string | undefined,
): DataLinkBankTransactionPush {
  const direction = requiredText(root, 'irany', 'banktranz')
  if (direction !== 'BE' && direction !== 'KI') {
    throw invalid(`Ismeretlen banki tranzakció irány: ${direction}.`)
  }
  const amount = childNumber(root, 'osszeg')
  if (amount === undefined) throw invalid('Hiányzik a(z) <banktranz/osszeg> elem.')
  const partner = findChild(root, 'partner')
  return {
    kind: 'bank-transaction',
    key,
    raw,
    transaction: {
      id: requiredInteger(root, 'id', 'banktranz'),
      accountNumber: requiredText(root, 'bankszamla', 'banktranz'),
      valueDate: requiredText(root, 'erteknap', 'banktranz'),
      direction: direction === 'BE' ? 'in' : 'out',
      type: childText(root, 'tipus'),
      technical: childBoolean(root, 'technikai') === true,
      amount,
      currency: requiredText(root, 'devizanem', 'banktranz'),
      partner: partner && {
        name: childText(partner, 'nev'),
        accountNumber: childText(partner, 'bankszamla'),
      },
      reference: childText(root, 'kozlemeny'),
    },
  }
}

function receiptsPush(
  root: XmlElement,
  raw: string,
  key: string | undefined,
): DataLinkReceiptsPush {
  const response = createAgentResponse('getReceipt', 200, new Headers(), encodeUtf8(raw))
  const receipts = findChildren(root, 'nyugta').map((element) => ({
    receipt: wrapSzamlazzError(() => parseReceiptElement(element, response)),
    issuerTaxNumber: childText(findChild(element, 'alap'), 'adoszam'),
  }))
  if (receipts.length === 0) throw invalid('A nyugtaarchívum nem tartalmaz <nyugta> elemet.')
  return { kind: 'receipts', key, raw, receipts }
}

export function parseDataLinkPush(xml: string, key?: string | undefined): DataLinkPush {
  if (xml.trim() === '') throw invalid('Üres adatkapcsolati üzenet érkezett.')
  let root: XmlElement
  try {
    root = parseXml(xml)
  } catch (error) {
    if (error instanceof XmlParseError)
      throw invalid(`Az üzenet nem érvényes XML: ${error.message}`, error)
    throw error
  }
  const kind = ROOT_KINDS.get(root.name)
  const normalizedKey = key?.trim() || undefined
  switch (kind) {
    case 'invoice':
    case 'incoming-invoice':
      return invoicePush(kind, root, xml, normalizedKey)
    case 'bank-transaction':
      return bankTransactionPush(root, xml, normalizedKey)
    case 'receipts':
      return receiptsPush(root, xml, normalizedKey)
    default:
      throw new DataLinkError(
        'unknown_document',
        `Ismeretlen adatkapcsolati bizonylattípus: <${root.name}>.`,
      )
  }
}
