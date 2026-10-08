import { toAgentDate, toBudapestTimestamp } from '../core/dates'
import type { DocumentEvent } from '../core/document-events'
import type { InvoiceOnceResult } from '../invoices/create-once'
import type { InvoiceDetails } from '../invoices/get'
import type { Receipt } from '../receipts/types'
import type { JournalEntry, JournalEntrySource } from './types'

function withoutPdf(receipt: Receipt): Receipt {
  if (receipt.pdf === undefined) return receipt
  const { pdf: _pdf, ...rest } = receipt
  return rest
}

function compact<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T
}

function inputDate(value: unknown, fallback: string): string {
  if (value instanceof Date || typeof value === 'string') {
    try {
      return toAgentDate(value)
    } catch {
      return fallback
    }
  }
  return fallback
}

export function receiptEntry(
  receipt: Receipt,
  source: JournalEntrySource,
  now: Date,
): JournalEntry {
  const reversal = receipt.type === 'reversal'
  return compact<JournalEntry>({
    kind: 'receipt',
    type: reversal ? 'reversal' : 'document',
    number: receipt.number,
    date: inputDate(receipt.issueDate, toAgentDate(now)),
    recordedAt: toBudapestTimestamp(now),
    source,
    orderNumber: receipt.orderNumber,
    reversedNumber: reversal ? receipt.reversedReceiptNumber : undefined,
    netTotal: receipt.totals.netAmount,
    grossTotal: receipt.totals.grossAmount,
    currency: receipt.currency,
    isTest: receipt.isTest,
    receipt: withoutPdf(receipt),
  })
}

export function invoiceDetailsEntry(
  details: InvoiceDetails,
  source: JournalEntrySource,
  now: Date,
): JournalEntry {
  const reversal = details.header.type === 'reversal'
  return compact<JournalEntry>({
    kind: 'invoice',
    type: reversal ? 'reversal' : 'document',
    number: details.header.number,
    date: inputDate(details.header.issueDate, toAgentDate(now)),
    recordedAt: toBudapestTimestamp(now),
    source,
    orderNumber: details.header.orderNumber,
    reversedNumber: reversal ? details.header.referencedInvoiceNumber : undefined,
    netTotal: details.totals.netAmount,
    grossTotal: details.totals.grossAmount,
    currency: details.header.currency,
    isTest: details.header.test,
  })
}

export function invoiceResultEntry(
  result: InvoiceOnceResult,
  orderNumber: string,
  source: JournalEntrySource,
  now: Date,
): JournalEntry {
  if (result.details) return invoiceDetailsEntry(result.details, source, now)
  return compact<JournalEntry>({
    kind: 'invoice',
    type: 'document',
    number: result.number,
    date: toAgentDate(now),
    recordedAt: toBudapestTimestamp(now),
    source,
    orderNumber,
    netTotal: result.invoice?.netTotal,
    grossTotal: result.invoice?.grossTotal,
  })
}

export function eventEntry(event: DocumentEvent, now: Date): JournalEntry | undefined {
  const today = toAgentDate(now)
  const recordedAt = toBudapestTimestamp(now)
  if (event.kind === 'receipt') return receiptEntry(event.document, 'hook', now)
  if (event.action === 'payment') return undefined
  if (event.action === 'created') {
    return compact<JournalEntry>({
      kind: 'invoice',
      type: 'document',
      number: event.number,
      date: inputDate(event.input.issueDate, today),
      recordedAt,
      source: 'hook',
      orderNumber: event.input.orderNumber?.trim() || undefined,
      netTotal: event.document.netTotal,
      grossTotal: event.document.grossTotal,
      currency: event.input.currency,
    })
  }
  return compact<JournalEntry>({
    kind: 'invoice',
    type: 'reversal',
    number: event.number,
    date: today,
    recordedAt,
    source: 'hook',
    reversedNumber: event.reversedNumber,
    netTotal: event.document.netTotal,
    grossTotal: event.document.grossTotal,
  })
}
