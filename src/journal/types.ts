import type { Receipt } from '../receipts/types'

export type JournalDocumentKind = 'invoice' | 'receipt'

export type JournalEntryType = 'document' | 'reversal'

export type JournalEntrySource = 'hook' | 'track' | 'reconcile' | 'settle' | 'manual'

export interface JournalEntry {
  readonly kind: JournalDocumentKind
  readonly type: JournalEntryType
  readonly number: string
  readonly date: string
  readonly recordedAt: string
  readonly source: JournalEntrySource
  readonly orderNumber?: string | undefined
  readonly reversedNumber?: string | undefined
  readonly netTotal?: number | undefined
  readonly grossTotal?: number | undefined
  readonly currency?: string | undefined
  readonly isTest?: boolean | undefined
  readonly receipt?: Receipt | undefined
}

export interface JournalReservation {
  readonly kind: JournalDocumentKind
  readonly orderNumber: string
  readonly date: string
  readonly reservedAt: string
}

export interface JournalRange {
  readonly from: string
  readonly to: string
}

export interface JournalStorage {
  getEntry(kind: JournalDocumentKind, number: string): Promise<JournalEntry | undefined>
  putEntry(entry: JournalEntry): Promise<boolean>
  listEntries(range: JournalRange): Promise<JournalEntry[]>
  putReservation(reservation: JournalReservation): Promise<boolean>
  deleteReservation(kind: JournalDocumentKind, orderNumber: string): Promise<void>
  listReservations(range: JournalRange): Promise<JournalReservation[]>
}
