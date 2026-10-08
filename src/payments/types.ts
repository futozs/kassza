import type { KeyValueStore } from '../core/store'
import type { KasszaWarning } from '../core/warnings'

export type PaymentProvider =
  | 'stripe'
  | 'simplepay'
  | 'barion'
  | 'revolut'
  | 'paypal'
  | (string & {})

export type PaymentEventKind = 'paid' | 'refunded' | 'partially-refunded' | 'failed' | 'other'

export interface PaymentAmount {
  readonly value: number
  readonly currency: string
}

export interface PaymentAddress {
  readonly country?: string | undefined
  readonly zip?: string | undefined
  readonly city?: string | undefined
  readonly line1?: string | undefined
  readonly line2?: string | undefined
}

export interface PaymentCustomer {
  readonly name?: string | undefined
  readonly email?: string | undefined
  readonly phone?: string | undefined
  readonly taxNumber?: string | undefined
  readonly euTaxNumber?: string | undefined
  readonly isBusiness?: boolean | undefined
  readonly address?: PaymentAddress | undefined
}

export interface PaymentLineItem {
  readonly name: string
  readonly quantity: number
  readonly totalGross: number
  readonly unit?: string | undefined
  readonly sku?: string | undefined
  readonly vatPercent?: number | undefined
}

export interface PaymentRefund {
  readonly id: string
  readonly amount: PaymentAmount
  readonly refundedBefore?: number | undefined
  readonly createdAt?: string | undefined
}

export interface PaymentEvent {
  readonly provider: PaymentProvider
  readonly kind: PaymentEventKind
  readonly id: string
  readonly eventId?: string | undefined
  readonly eventType?: string | undefined
  readonly orderRef?: string | undefined
  readonly amount?: PaymentAmount | undefined
  readonly refundedAmount?: PaymentAmount | undefined
  readonly refunds?: readonly PaymentRefund[] | undefined
  readonly paidAt?: string | undefined
  readonly method: string
  readonly customer?: PaymentCustomer | undefined
  readonly items?: readonly PaymentLineItem[] | undefined
  readonly raw: unknown
}

export type PaymentHandler = (payment: PaymentEvent) => unknown

export interface PaymentWebhookBaseOptions {
  readonly onPayment: PaymentHandler
  readonly onError?: ((error: unknown) => void) | undefined
  readonly onWarning?: ((warning: KasszaWarning) => void) | undefined
  readonly dedupe?: KeyValueStore | undefined
  readonly dedupeTtlSeconds?: number | undefined
  readonly maxBodyBytes?: number | undefined
  readonly method?: string | undefined
  readonly fetch?: typeof globalThis.fetch | undefined
}
