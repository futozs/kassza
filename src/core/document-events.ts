import type { CreatedInvoice, CreateInvoiceInput } from '../invoices/create-types'
import type { RegisteredPayment } from '../invoices/payment'
import type { ReversedInvoice } from '../invoices/reverse'
import type { Receipt } from '../receipts/types'

export interface InvoiceCreatedEvent {
  readonly kind: 'invoice'
  readonly action: 'created'
  readonly number: string
  readonly document: CreatedInvoice
  readonly input: CreateInvoiceInput
}

export interface InvoiceReversedEvent {
  readonly kind: 'invoice'
  readonly action: 'reversed'
  readonly number: string
  readonly reversedNumber: string
  readonly document: ReversedInvoice
}

export interface InvoicePaymentEvent {
  readonly kind: 'invoice'
  readonly action: 'payment'
  readonly number: string
  readonly document: RegisteredPayment
}

export interface ReceiptCreatedEvent {
  readonly kind: 'receipt'
  readonly action: 'created'
  readonly number: string
  readonly document: Receipt
}

export interface ReceiptReversedEvent {
  readonly kind: 'receipt'
  readonly action: 'reversed'
  readonly number: string
  readonly reversedNumber: string
  readonly document: Receipt
}

export type DocumentEvent =
  | InvoiceCreatedEvent
  | InvoiceReversedEvent
  | InvoicePaymentEvent
  | ReceiptCreatedEvent
  | ReceiptReversedEvent

export type DocumentHook = (event: DocumentEvent) => void | Promise<void>

export async function emitDocumentEvent(
  hook: DocumentHook | undefined,
  event: DocumentEvent,
): Promise<void> {
  if (!hook) return
  try {
    await hook(event)
  } catch (error) {
    console.warn(
      `[szamlazz] Az onDocument hook hibát dobott a(z) ${event.number} bizonylatnál. A bizonylat elkészült, a hiba nem érinti.`,
      error,
    )
  }
}
