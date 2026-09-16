import type { AgentAttachment } from '../core/context'
import type { DateInput } from '../core/dates'
import type { ItemAmounts, ItemPriceInput } from '../money/items'

export type InvoiceType =
  | 'invoice'
  | 'proforma'
  | 'advance'
  | 'final'
  | 'corrective'
  | 'deliveryNote'

export const INVOICE_TYPES: readonly InvoiceType[] = [
  'invoice',
  'proforma',
  'advance',
  'final',
  'corrective',
  'deliveryNote',
]

export const INVOICE_LANGUAGES = [
  'hu',
  'en',
  'de',
  'it',
  'ro',
  'sk',
  'hr',
  'fr',
  'es',
  'cz',
  'pl',
  'bg',
  'nl',
  'ru',
  'si',
] as const

export type InvoiceLanguage = (typeof INVOICE_LANGUAGES)[number]

export const INVOICE_TEMPLATES = [
  'SzlaMost',
  'SzlaAlap',
  'SzlaNoEnv',
  'Szla8cm',
  'SzlaTomb',
  'SzlaFuvarlevelesAlap',
] as const

export type InvoiceTemplate = (typeof INVOICE_TEMPLATES)[number]

export const CURRENCIES = [
  'HUF',
  'Ft',
  'EUR',
  'CHF',
  'USD',
  'AED',
  'ALL',
  'AUD',
  'BAM',
  'BGN',
  'BRL',
  'CAD',
  'CNY',
  'CZK',
  'DKK',
  'EEK',
  'GBP',
  'HKD',
  'HRK',
  'IDR',
  'ILS',
  'INR',
  'ISK',
  'JPY',
  'KRW',
  'KWD',
  'KSH',
  'KZT',
  'LTL',
  'LVL',
  'MXN',
  'MYR',
  'NOK',
  'NZD',
  'PHP',
  'PLN',
  'RON',
  'RSD',
  'RUB',
  'SEK',
  'SGD',
  'THB',
  'TRY',
  'TWD',
  'UAH',
  'VND',
  'ZAR',
] as const

export type Currency = (typeof CURRENCIES)[number] | (string & {})

export type TaxpayerType =
  | 'nonEuBusiness'
  | 'euBusiness'
  | 'hungarianTaxNumber'
  | 'unknown'
  | 'noTaxNumber'

export const TAXPAYER_TYPE_CODES: Readonly<Record<TaxpayerType, number>> = {
  nonEuBusiness: 7,
  euBusiness: 6,
  hungarianTaxNumber: 1,
  unknown: 0,
  noTaxNumber: -1,
}

export type CourierService =
  | 'TOF'
  | 'PPP'
  | 'SPRINTER'
  | 'FOXPOST'
  | 'MPL'
  | 'GLS'
  | 'EMPTY'
  | (string & {})

export interface InvoiceSeller {
  readonly bank?: string | undefined
  readonly bankAccount?: string | undefined
  readonly emailReplyTo?: string | undefined
  readonly emailSubject?: string | undefined
  readonly emailText?: string | undefined
  readonly signatoryName?: string | undefined
}

export interface InvoicePostalAddress {
  readonly name?: string | undefined
  readonly country?: string | undefined
  readonly zip?: string | undefined
  readonly city?: string | undefined
  readonly address?: string | undefined
}

export interface BuyerLedger {
  readonly bookingDate?: DateInput | undefined
  readonly buyerId?: string | undefined
  readonly ledgerAccount?: string | undefined
  readonly continuousFulfillment?: boolean | undefined
  readonly settlementPeriodStart?: DateInput | undefined
  readonly settlementPeriodEnd?: DateInput | undefined
}

export interface InvoiceBuyer {
  readonly name: string
  readonly country?: string | undefined
  readonly zip: string
  readonly city: string
  readonly address: string
  readonly email?: string | undefined
  readonly sendEmail?: boolean | undefined
  readonly taxpayerType?: TaxpayerType | undefined
  readonly taxNumber?: string | undefined
  readonly groupTaxNumber?: string | undefined
  readonly euTaxNumber?: string | undefined
  readonly postal?: InvoicePostalAddress | undefined
  readonly ledger?: BuyerLedger | undefined
  readonly identifier?: string | undefined
  readonly signatoryName?: string | undefined
  readonly phone?: string | undefined
  readonly comment?: string | undefined
}

export interface ItemLedger {
  readonly economicEvent?: string | undefined
  readonly vatEconomicEvent?: string | undefined
  readonly revenueLedgerAccount?: string | undefined
  readonly vatLedgerAccount?: string | undefined
  readonly settlementPeriodStart?: DateInput | undefined
  readonly settlementPeriodEnd?: DateInput | undefined
}

export type InvoiceItemInput = ItemPriceInput & {
  readonly name: string
  readonly identifier?: string | undefined
  readonly unit?: string | undefined
  readonly comment?: string | undefined
  readonly ledger?: ItemLedger | undefined
  readonly dataDeletionCode?: number | undefined
  readonly marginVatBase?: number | undefined
}

export interface TransOFlexWaybill {
  readonly id?: string | undefined
  readonly shipmentId?: string | undefined
  readonly packageCount?: number | undefined
  readonly countryCode?: string | undefined
  readonly zip?: string | undefined
  readonly service?: string | undefined
}

export interface PickPackPointWaybill {
  readonly barcodePrefix?: string | undefined
  readonly barcodePostfix?: string | undefined
}

export interface SprinterWaybill {
  readonly id?: string | undefined
  readonly senderCode?: string | undefined
  readonly directionCode?: string | undefined
  readonly packageCount?: number | undefined
  readonly barcodePostfix?: string | undefined
  readonly deliveryTime?: string | undefined
}

export interface MplWaybill {
  readonly customerCode: string
  readonly barcode: string
  readonly weight: string | number
  readonly services?: string | undefined
  readonly declaredValue?: number | undefined
}

export interface Waybill {
  readonly courier?: CourierService | undefined
  readonly barcode?: string | undefined
  readonly comment?: string | undefined
  readonly transOFlex?: TransOFlexWaybill | undefined
  readonly pickPackPoint?: PickPackPointWaybill | undefined
  readonly sprinter?: SprinterWaybill | undefined
  readonly mpl?: MplWaybill | undefined
}

export interface InvoiceDefaults {
  readonly seller?: InvoiceSeller | undefined
  readonly prefix?: string | undefined
  readonly language?: InvoiceLanguage | undefined
  readonly currency?: Currency | undefined
  readonly exchangeBank?: string | undefined
  readonly paymentMethod?: string | undefined
  readonly paymentDueInDays?: number | undefined
  readonly eInvoice?: boolean | undefined
  readonly downloadPdf?: boolean | undefined
  readonly template?: InvoiceTemplate | undefined
  readonly sendEmail?: boolean | undefined
  readonly logoExtra?: string | undefined
  readonly simpleItems?: boolean | undefined
  readonly euVat?: boolean | undefined
  readonly aggregator?: string | undefined
  readonly guardian?: boolean | undefined
  readonly articleIdentifierInvoice?: boolean | undefined
}

export interface CreateInvoiceBase {
  readonly buyer: InvoiceBuyer
  readonly items: readonly InvoiceItemInput[]
  readonly seller?: InvoiceSeller | undefined
  readonly issueDate?: DateInput | undefined
  readonly fulfillmentDate?: DateInput | undefined
  readonly dueDate?: DateInput | undefined
  readonly paymentDueInDays?: number | undefined
  readonly paymentMethod?: string | undefined
  readonly currency?: Currency | undefined
  readonly exchangeRate?: number | undefined
  readonly exchangeBank?: string | undefined
  readonly language?: InvoiceLanguage | undefined
  readonly comment?: string | undefined
  readonly orderNumber?: string | undefined
  readonly proformaNumber?: string | undefined
  readonly prefix?: string | undefined
  readonly paid?: boolean | undefined
  readonly eInvoice?: boolean | undefined
  readonly downloadPdf?: boolean | undefined
  readonly externalId?: string | undefined
  readonly template?: InvoiceTemplate | undefined
  readonly simpleItems?: boolean | undefined
  readonly logoExtra?: string | undefined
  readonly paymentCorrection?: number | undefined
  readonly marginVat?: boolean | undefined
  readonly euVat?: boolean | undefined
  readonly aggregator?: string | undefined
  readonly guardian?: boolean | undefined
  readonly articleIdentifierInvoice?: boolean | undefined
  readonly waybill?: Waybill | undefined
  readonly attachments?: readonly AgentAttachment[] | undefined
}

export interface StandardInvoiceInput extends CreateInvoiceBase {
  readonly type?: 'invoice' | 'proforma' | 'advance' | 'deliveryNote' | undefined
}

export interface FinalInvoiceInput extends CreateInvoiceBase {
  readonly type: 'final'
  readonly advanceInvoiceNumber?: string | undefined
}

export interface CorrectiveInvoiceInput extends CreateInvoiceBase {
  readonly type: 'corrective'
  readonly correctedInvoiceNumber: string
}

export type CreateInvoiceInput = StandardInvoiceInput | FinalInvoiceInput | CorrectiveInvoiceInput

export type CreatedInvoiceItem = ItemAmounts & { readonly name: string }

export interface CreatedInvoice {
  readonly number: string
  readonly netTotal: number
  readonly grossTotal: number
  readonly outstanding?: number | undefined
  readonly buyerAccountUrl?: string | undefined
  readonly pdf?: Uint8Array | undefined
  readonly items: readonly CreatedInvoiceItem[]
}

export interface InvoicePreview {
  readonly pdf: Uint8Array
  readonly netTotal: number
  readonly grossTotal: number
  readonly items: readonly CreatedInvoiceItem[]
}
