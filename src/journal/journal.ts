import { toAgentDate, toBudapestTimestamp } from '../core/dates'
import type { DocumentEvent } from '../core/document-events'
import { SzamlazzError } from '../core/errors'
import { isUncertainOutcome } from '../core/once'
import type { DataLinkArchivedReceipt } from '../data-link/push'
import type { InvoiceOnceResult } from '../invoices/create-once'
import type { InvoiceDetails } from '../invoices/get'
import type { ReceiptOnceResult } from '../receipts/create-once'
import type { Receipt } from '../receipts/types'
import { inRange, normalizeRange, recentRange } from './dates'
import { eventEntry, invoiceDetailsEntry, invoiceResultEntry, receiptEntry } from './entries'
import type {
  JournalDocumentKind,
  JournalEntry,
  JournalRange,
  JournalReservation,
  JournalStorage,
} from './types'

export const DEFAULT_PENDING_DAYS = 30

export class JournalWriteError extends Error {
  override readonly name: string = 'JournalWriteError'
  readonly result: unknown
  readonly orderNumber: string

  constructor(orderNumber: string, result: unknown, cause: unknown) {
    super(
      `A(z) ${orderNumber} rendelés bizonylata elkészült, de a naplóba írás nem sikerült. A tétel befejezetlenként a naplóban maradt: a journal.settle() később pótolja. Ne állítsd ki újra a bizonylatot.`,
      { cause },
    )
    this.orderNumber = orderNumber
    this.result = result
  }
}

export interface JournalOptions {
  readonly now?: (() => Date) | undefined
}

export interface JournalEntryQuery extends JournalRange {
  readonly kind?: JournalDocumentKind | undefined
}

export interface JournalReceiptQuery extends JournalRange {
  readonly includeTest?: boolean | undefined
}

export interface JournalReconcileOptions {
  readonly from?: string | undefined
  readonly to?: string | undefined
  readonly dryRun?: boolean | undefined
}

export interface JournalReconciliation {
  readonly range: JournalRange | undefined
  readonly added: readonly string[]
  readonly missingFromArchive: readonly string[]
  readonly matched: number
}

export interface JournalSettleApi {
  readonly invoices?: {
    find(reference: { readonly orderNumber: string }): Promise<InvoiceDetails | null>
  }
  readonly receipts?: {
    find(input: {
      readonly orderNumber: string
      readonly downloadPdf?: boolean
    }): Promise<Receipt | null>
  }
}

export interface JournalSettleOptions {
  readonly range?: JournalRange | undefined
  readonly releaseNotFound?: boolean | undefined
}

export interface JournalSettlement {
  readonly recorded: readonly JournalReservation[]
  readonly notFound: readonly JournalReservation[]
  readonly failed: readonly { readonly reservation: JournalReservation; readonly error: unknown }[]
}

export interface Journal {
  readonly storage: JournalStorage
  record(event: DocumentEvent): Promise<void>
  recordReceipt(receipt: Receipt): Promise<boolean>
  recordInvoice(details: InvoiceDetails): Promise<boolean>
  reserve(kind: JournalDocumentKind, orderNumber: string): Promise<void>
  release(kind: JournalDocumentKind, orderNumber: string): Promise<void>
  trackReceipt(
    orderNumber: string,
    run: () => Promise<ReceiptOnceResult | Receipt>,
  ): Promise<ReceiptOnceResult | Receipt>
  trackInvoice(
    orderNumber: string,
    run: () => Promise<InvoiceOnceResult>,
  ): Promise<InvoiceOnceResult>
  entries(query: JournalEntryQuery): Promise<JournalEntry[]>
  receipts(query: JournalReceiptQuery): Promise<Receipt[]>
  pending(range?: JournalRange): Promise<JournalReservation[]>
  settle(api: JournalSettleApi, options?: JournalSettleOptions): Promise<JournalSettlement>
  reconcile(
    archive: readonly (Receipt | DataLinkArchivedReceipt)[],
    options?: JournalReconcileOptions,
  ): Promise<JournalReconciliation>
}

function requireOrderNumber(orderNumber: string): string {
  const trimmed = orderNumber?.trim()
  if (!trimmed) {
    throw new SzamlazzError('A naplóhoz add meg a rendelésszámot (orderNumber).', {
      category: 'validation',
    })
  }
  return trimmed
}

function isDefinitelyNotCreated(error: unknown): boolean {
  return error instanceof SzamlazzError && !isUncertainOutcome(error)
}

function archivedReceipt(item: Receipt | DataLinkArchivedReceipt): Receipt {
  return 'receipt' in item && typeof item.receipt === 'object' ? item.receipt : (item as Receipt)
}

function archiveRange(receipts: readonly Receipt[]): JournalRange | undefined {
  const dates = receipts
    .map((receipt) => receipt.issueDate)
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
  if (dates.length === 0) return undefined
  const sorted = [...dates].sort()
  return { from: sorted[0] as string, to: sorted[sorted.length - 1] as string }
}

export function createJournal(storage: JournalStorage, options: JournalOptions = {}): Journal {
  const now = options.now ?? (() => new Date())

  const put = (entry: JournalEntry | undefined): Promise<boolean> =>
    entry ? storage.putEntry(entry) : Promise.resolve(false)

  async function reserve(kind: JournalDocumentKind, orderNumber: string): Promise<void> {
    const current = now()
    await storage.putReservation({
      kind,
      orderNumber: requireOrderNumber(orderNumber),
      date: toAgentDate(current),
      reservedAt: toBudapestTimestamp(current),
    })
  }

  async function release(kind: JournalDocumentKind, orderNumber: string): Promise<void> {
    await storage.deleteReservation(kind, requireOrderNumber(orderNumber))
  }

  async function track<T>(
    kind: JournalDocumentKind,
    orderNumber: string,
    run: () => Promise<T>,
    entryOf: (result: T) => JournalEntry,
  ): Promise<T> {
    const order = requireOrderNumber(orderNumber)
    await reserve(kind, order)
    let result: T
    try {
      result = await run()
    } catch (error) {
      if (isDefinitelyNotCreated(error)) await storage.deleteReservation(kind, order)
      throw error
    }
    try {
      await storage.putEntry(entryOf(result))
      await storage.deleteReservation(kind, order)
    } catch (error) {
      throw new JournalWriteError(order, result, error)
    }
    return result
  }

  async function settleOne(
    api: JournalSettleApi,
    reservation: JournalReservation,
  ): Promise<'recorded' | 'notFound'> {
    if (reservation.kind === 'receipt') {
      if (!api.receipts) throw new TypeError('A nyugták rendezéséhez add meg a receipts API-t.')
      const receipt = await api.receipts.find({
        orderNumber: reservation.orderNumber,
        downloadPdf: false,
      })
      if (!receipt) return 'notFound'
      await storage.putEntry(receiptEntry(receipt, 'settle', now()))
      return 'recorded'
    }
    if (!api.invoices) throw new TypeError('A számlák rendezéséhez add meg az invoices API-t.')
    const details = await api.invoices.find({ orderNumber: reservation.orderNumber })
    if (!details) return 'notFound'
    await storage.putEntry(invoiceDetailsEntry(details, 'settle', now()))
    return 'recorded'
  }

  const journal: Journal = {
    storage,
    async record(event) {
      await put(eventEntry(event, now()))
    },
    recordReceipt: (receipt) => storage.putEntry(receiptEntry(receipt, 'manual', now())),
    recordInvoice: (details) => storage.putEntry(invoiceDetailsEntry(details, 'manual', now())),
    reserve,
    release,
    trackReceipt: (orderNumber, run) =>
      track('receipt', orderNumber, run, (result) =>
        receiptEntry('receipt' in result ? result.receipt : result, 'track', now()),
      ),
    trackInvoice: (orderNumber, run) =>
      track('invoice', orderNumber, run, (result) =>
        invoiceResultEntry(result, requireOrderNumber(orderNumber), 'track', now()),
      ),
    async entries(query) {
      const entries = await storage.listEntries(normalizeRange(query))
      return entries
        .filter((entry) => query.kind === undefined || entry.kind === query.kind)
        .sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number, 'hu'))
    },
    async receipts(query) {
      const entries = await journal.entries({ ...query, kind: 'receipt' })
      return entries
        .map((entry) => entry.receipt)
        .filter((receipt): receipt is Receipt => receipt !== undefined)
        .filter((receipt) => query.includeTest === true || !receipt.isTest)
    },
    async pending(range) {
      return storage.listReservations(range ?? recentRange(now(), DEFAULT_PENDING_DAYS))
    },
    async settle(api, settleOptions = {}) {
      const reservations = await journal.pending(settleOptions.range)
      const recorded: JournalReservation[] = []
      const notFound: JournalReservation[] = []
      const failed: { reservation: JournalReservation; error: unknown }[] = []
      for (const reservation of reservations) {
        try {
          const outcome = await settleOne(api, reservation)
          if (outcome === 'recorded' || settleOptions.releaseNotFound === true) {
            await storage.deleteReservation(reservation.kind, reservation.orderNumber)
          }
          if (outcome === 'recorded') recorded.push(reservation)
          else notFound.push(reservation)
        } catch (error) {
          failed.push({ reservation, error })
        }
      }
      return { recorded, notFound, failed }
    },
    async reconcile(archive, reconcileOptions = {}) {
      const receipts = archive.map(archivedReceipt)
      const derived = archiveRange(receipts)
      const range =
        reconcileOptions.from !== undefined || reconcileOptions.to !== undefined
          ? normalizeRange({
              from: reconcileOptions.from ?? derived?.from ?? reconcileOptions.to ?? '',
              to: reconcileOptions.to ?? derived?.to ?? reconcileOptions.from ?? '',
            })
          : derived
      const journaled = range
        ? await journal.entries({ ...range, kind: 'receipt' })
        : ([] as JournalEntry[])
      const known = new Set(journaled.map((entry) => entry.number))
      const archived = new Set<string>()
      const added: string[] = []
      for (const receipt of receipts) {
        if (archived.has(receipt.number)) continue
        archived.add(receipt.number)
        if (range && !inRange(receipt.issueDate, range)) continue
        if (known.has(receipt.number)) continue
        if (reconcileOptions.dryRun !== true) {
          await storage.putEntry(receiptEntry(receipt, 'reconcile', now()))
        }
        added.push(receipt.number)
      }
      const missingFromArchive = journaled
        .map((entry) => entry.number)
        .filter((number) => !archived.has(number))
      return {
        range,
        added,
        missingFromArchive,
        matched: journaled.length - missingFromArchive.length,
      }
    },
  }
  return journal
}
