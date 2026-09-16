import type { ItemPriceInput, VatRate } from '../money'

export const RECEIPT_ONLY_VAT_CODES = ['ÁKK', 'MAA', 'EU', 'EUK'] as const

export type ReceiptOnlyVatCode = (typeof RECEIPT_ONLY_VAT_CODES)[number]

export type ReceiptVatRate = VatRate | ReceiptOnlyVatCode

export const RECEIPT_PDF_TEMPLATES = ['A', 'N', 'J', 'L'] as const

export type ReceiptPdfTemplate = (typeof RECEIPT_PDF_TEMPLATES)[number]

export interface ReceiptLedgerInput {
  readonly revenue?: string | undefined
  readonly vat?: string | undefined
}

export type ReceiptItemInput = Omit<ItemPriceInput, 'vat'> & {
  readonly vat: ReceiptVatRate
  readonly name: string
  readonly identifier?: string | undefined
  readonly unit?: string | undefined
  readonly comment?: string | undefined
  readonly ledger?: ReceiptLedgerInput | undefined
  readonly dataDeletionCode?: number | undefined
}

export interface ReceiptPaymentInput {
  readonly method: string
  readonly amount: number
  readonly description?: string | undefined
}

export interface ReceiptDefaults {
  readonly prefix?: string | undefined
  readonly paymentMethod?: string | undefined
  readonly currency?: string | undefined
  readonly exchangeRate?: number | undefined
  readonly exchangeBank?: string | undefined
  readonly downloadPdf?: boolean | undefined
  readonly template?: ReceiptPdfTemplate | undefined
  readonly unit?: string | undefined
  readonly customerLedgerId?: string | undefined
}

export interface CreateReceiptInput {
  readonly prefix?: string | undefined
  readonly paymentMethod?: string | undefined
  readonly currency?: string | undefined
  readonly exchangeRate?: number | undefined
  readonly exchangeBank?: string | undefined
  readonly callId?: string | undefined
  readonly comment?: string | undefined
  readonly template?: ReceiptPdfTemplate | undefined
  readonly customerLedgerId?: string | undefined
  readonly orderNumber?: string | undefined
  readonly downloadPdf?: boolean | undefined
  readonly items: readonly ReceiptItemInput[]
  readonly payments?: readonly ReceiptPaymentInput[] | undefined
}

export interface ReverseReceiptInput {
  readonly receiptNumber: string
  readonly callId?: string | undefined
  readonly template?: ReceiptPdfTemplate | undefined
  readonly downloadPdf?: boolean | undefined
}

interface GetReceiptOptions {
  readonly callId?: string | undefined
  readonly template?: ReceiptPdfTemplate | undefined
  readonly downloadPdf?: boolean | undefined
}

export type GetReceiptInput = GetReceiptOptions &
  (
    | { readonly receiptNumber: string; readonly orderNumber?: undefined }
    | { readonly orderNumber: string; readonly receiptNumber?: undefined }
  )

export interface SendReceiptInput {
  readonly receiptNumber: string
  readonly emails: string | readonly string[]
  readonly replyTo?: string | undefined
  readonly subject?: string | undefined
  readonly text?: string | undefined
}

export type ReceiptType = 'receipt' | 'reversal'

export interface ReceiptLedger {
  readonly revenue?: string | undefined
  readonly vat?: string | undefined
}

export interface ReceiptItem {
  readonly name: string
  readonly identifier?: string | undefined
  readonly quantity: number
  readonly unit: string
  readonly netUnitPrice: number
  readonly vat: ReceiptVatRate
  readonly vatPercentage: number
  readonly netAmount: number
  readonly vatAmount: number
  readonly grossAmount: number
  readonly ledger?: ReceiptLedger | undefined
}

export interface ReceiptPayment {
  readonly method: string
  readonly amount: number
  readonly description?: string | undefined
}

export interface ReceiptVatTotal {
  readonly vat: ReceiptVatRate
  readonly vatPercentage: number
  readonly netAmount: number
  readonly vatAmount: number
  readonly grossAmount: number
}

export interface ReceiptTotals {
  readonly netAmount: number
  readonly vatAmount: number
  readonly grossAmount: number
  readonly byVat: readonly ReceiptVatTotal[]
}

export interface Receipt {
  readonly id: number
  readonly number: string
  readonly callId?: string | undefined
  readonly type: ReceiptType
  readonly isReversed: boolean
  readonly reversedReceiptNumber?: string | undefined
  readonly issueDate: string
  readonly paymentMethod: string
  readonly currency: string
  readonly exchangeBank?: string | undefined
  readonly exchangeRate?: number | undefined
  readonly comment?: string | undefined
  readonly customerLedgerId?: string | undefined
  readonly isTest: boolean
  readonly orderNumber?: string | undefined
  readonly items: readonly ReceiptItem[]
  readonly payments: readonly ReceiptPayment[]
  readonly totals: ReceiptTotals
  readonly pdf?: Uint8Array | undefined
}
