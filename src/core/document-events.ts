import type { CreatedInvoice, CreateInvoiceInput } from '../invoices/create-types'
import type { RegisteredPayment } from '../invoices/payment'
import type { ReversedInvoice } from '../invoices/reverse'
import type { Receipt } from '../receipts/types'
import { emitWarning, type WarningHook } from './warnings'

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

export type DocumentErrorHandler = (error: unknown, event: DocumentEvent) => void | Promise<void>

export type DocumentErrorMode = 'warn' | 'throw' | DocumentErrorHandler

export interface DocumentEventOptions {
  readonly mode?: DocumentErrorMode | undefined
  readonly onWarning?: WarningHook | undefined
}

export class DocumentHookError extends Error {
  override readonly name: string = 'DocumentHookError'
  readonly event: DocumentEvent

  constructor(event: DocumentEvent, cause: unknown) {
    super(
      `Az onDocument hook hibát dobott a(z) ${event.number} bizonylatnál. A bizonylat elkészült, csak a hook (például a napló mentése) maradt el: mentsd el újra az error.event alapján, és ne állítsd ki újra a bizonylatot.`,
      { cause },
    )
    this.event = event
  }

  get number(): string {
    return this.event.number
  }

  get document(): DocumentEvent['document'] {
    return this.event.document
  }
}

export function isDocumentHookError(error: unknown): error is DocumentHookError {
  return error instanceof DocumentHookError
}

function warnDocumentHook(
  onWarning: WarningHook | undefined,
  event: DocumentEvent,
  error: unknown,
): void {
  emitWarning(
    onWarning,
    {
      kind: 'document',
      message: `Az onDocument hook hibát dobott a(z) ${event.number} bizonylatnál. A bizonylat elkészült, a hiba nem érinti.`,
      error,
      operation: `${event.kind}.${event.action}`,
    },
    'console',
  )
}

export async function emitDocumentEvent(
  hook: DocumentHook | undefined,
  event: DocumentEvent,
  options: DocumentEventOptions = {},
): Promise<void> {
  if (!hook) return
  try {
    await hook(event)
  } catch (error) {
    const mode = options.mode ?? 'warn'
    if (mode === 'warn') {
      warnDocumentHook(options.onWarning, event, error)
      return
    }
    if (mode === 'throw') throw new DocumentHookError(event, error)
    try {
      await mode(error, event)
    } catch (handlerError) {
      throw new DocumentHookError(event, handlerError)
    }
  }
}
