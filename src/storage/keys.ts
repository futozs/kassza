import { type DateInput, toAgentDate, todayInBudapest } from '../core/dates'
import { StorageError } from './errors'

export type InvoiceDocumentKind =
  | 'invoice'
  | 'proforma'
  | 'advance'
  | 'final'
  | 'corrective'
  | 'storno'
  | 'deliveryNote'

export interface InvoicePdfKeyInput {
  readonly number: string
  readonly type?: InvoiceDocumentKind | undefined
  readonly prefix?: string | undefined
  readonly date?: DateInput | undefined
}

export interface ReceiptPdfKeyInput {
  readonly number: string
  readonly prefix?: string | undefined
  readonly date?: DateInput | undefined
}

export const DEFAULT_INVOICE_KEY_PREFIX = 'szamlak'
export const DEFAULT_RECEIPT_KEY_PREFIX = 'nyugtak'

const KIND_FOLDERS: Readonly<Record<InvoiceDocumentKind, string | undefined>> = {
  invoice: undefined,
  proforma: 'dijbekero',
  advance: 'elolegszamla',
  final: 'vegszamla',
  corrective: 'helyesbito',
  storno: 'sztorno',
  deliveryNote: 'szallitolevel',
}

const COMBINING_MARKS = /\p{M}/gu

export function sanitizeKeySegment(value: string): string {
  return value
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
}

function datedPdfKey(
  prefix: string,
  folder: string | undefined,
  number: string,
  date: DateInput | undefined,
): string {
  const fileName = sanitizeKeySegment(number)
  if (fileName === '') {
    throw new StorageError(`A bizonylatszámból nem képezhető fájlnév: ${JSON.stringify(number)}`, {
      operation: 'key',
    })
  }
  const isoDate = date === undefined ? todayInBudapest() : toAgentDate(date)
  const [year = '', month = ''] = isoDate.split('-')
  return [...prefix.split('/'), folder ?? '', year, month]
    .map(sanitizeKeySegment)
    .filter((segment) => segment !== '')
    .concat(`${fileName}.pdf`)
    .join('/')
}

export function invoicePdfKey(input: InvoicePdfKeyInput): string {
  return datedPdfKey(
    input.prefix ?? DEFAULT_INVOICE_KEY_PREFIX,
    KIND_FOLDERS[input.type ?? 'invoice'],
    input.number,
    input.date,
  )
}

export function receiptPdfKey(input: ReceiptPdfKeyInput): string {
  return datedPdfKey(
    input.prefix ?? DEFAULT_RECEIPT_KEY_PREFIX,
    undefined,
    input.number,
    input.date,
  )
}
