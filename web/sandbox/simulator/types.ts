import type { AgentAction } from 'kassza'

export type SimulatedFailure = 'network' | 'timeout' | 'maintenance' | 'server-error' | number

export interface SimulatorOptions {
  readonly latencyMs?: readonly [number, number] | undefined
  readonly invoicePrefixes?: readonly string[] | undefined
  readonly defaultInvoicePrefix?: string | undefined
  readonly forbidDuplicateOrderNumbers?: boolean | undefined
  readonly now?: (() => Date) | undefined
}

export interface SimulatedAttachment {
  readonly name: string
  readonly size: number
  readonly type: string
}

export type ResponseKind = 'xml' | 'pdf' | 'text' | 'html' | 'none'

export interface SimulatedCall {
  readonly id: number
  readonly action: AgentAction
  readonly field: string
  readonly startedAt: number
  readonly durationMs: number
  readonly requestXml: string
  readonly attachments: readonly SimulatedAttachment[]
  readonly sessionReused: boolean
  readonly status: number | 'network-error' | 'timeout'
  readonly responseHeaders: readonly (readonly [string, string])[]
  readonly responseBody: string
  readonly responseKind: ResponseKind
  readonly effects: readonly string[]
}

export interface SimItem {
  readonly name: string
  readonly identifier?: string | undefined
  readonly quantity: number
  readonly unit: string
  readonly netUnitPrice: number
  readonly vatCode: string
  readonly vatPercent: number
  readonly net: number
  readonly vat: number
  readonly gross: number
  readonly comment?: string | undefined
}

export interface SimPayment {
  readonly date: string
  readonly method: string
  readonly amount: number
  readonly description?: string | undefined
}

export type InvoiceTypeCode = 'SZ' | 'D' | 'ES' | 'VS' | 'HS' | 'SS' | 'SL'

export interface SimBuyer {
  readonly name: string
  readonly country?: string | undefined
  readonly zip: string
  readonly city: string
  readonly address: string
  readonly email?: string | undefined
  readonly taxNumber?: string | undefined
  readonly euTaxNumber?: string | undefined
  readonly identifier?: string | undefined
  readonly phone?: string | undefined
}

export interface SimInvoice {
  readonly id: number
  readonly number: string
  readonly typeCode: InvoiceTypeCode
  readonly prefix: string
  readonly eInvoice: boolean
  readonly issueDate: string
  readonly fulfillmentDate: string
  readonly dueDate: string
  readonly paymentMethod: string
  readonly currency: string
  readonly language: string
  readonly exchangeBank?: string | undefined
  readonly exchangeRate?: number | undefined
  readonly comment?: string | undefined
  readonly orderNumber?: string | undefined
  readonly externalId?: string | undefined
  readonly proformaNumber?: string | undefined
  readonly referencedInvoiceNumber?: string | undefined
  readonly buyer: SimBuyer
  readonly items: readonly SimItem[]
  payments: SimPayment[]
  reversed: boolean
  deleted: boolean
}

export interface SimReceiptItem extends SimItem {
  readonly ledgerRevenue?: string | undefined
  readonly ledgerVat?: string | undefined
}

export interface SimReceiptPayment {
  readonly method: string
  readonly amount: number
  readonly description?: string | undefined
}

export interface SimReceipt {
  readonly id: number
  readonly number: string
  readonly prefix: string
  readonly callId?: string | undefined
  readonly typeCode: 'NY' | 'SN'
  reversed: boolean
  readonly reversedNumber?: string | undefined
  readonly issueDate: string
  readonly paymentMethod: string
  readonly currency: string
  readonly exchangeBank?: string | undefined
  readonly exchangeRate?: number | undefined
  readonly comment?: string | undefined
  readonly customerLedgerId?: string | undefined
  readonly orderNumber?: string | undefined
  readonly items: readonly SimReceiptItem[]
  readonly payments: readonly SimReceiptPayment[]
  readonly sentTo: string[]
}

export interface AccountSnapshot {
  readonly seller: {
    readonly name: string
    readonly taxNumber: string
    readonly address: string
    readonly bankAccount: string
  }
  readonly invoicePrefixes: readonly string[]
  readonly invoices: readonly SimInvoice[]
  readonly receipts: readonly SimReceipt[]
  readonly sessionActive: boolean
}
