import type { InvoicesApi, ReceiptsApi } from '../client'
import { SzamlazzError } from '../core/errors'
import { isUncertainOutcome, recoverAfterFailure, resolveRecoveryDelay } from '../core/once'
import { chooseDocument, type DocumentDecision } from '../documents/choose'
import type { InvoiceOnceResult } from '../invoices/create-once'
import type { InvoiceBuyer, StandardInvoiceInput } from '../invoices/create-types'
import { calculateInvoiceItem } from '../money/items'
import { roundMoney } from '../money/rounding'
import { isHuf, isVatRate, type VatRate } from '../money/vat'
import { conversionExternalId } from '../receipts/convert'
import { calculateReceiptItems } from '../receipts/create'
import type { CreateReceiptInput, Receipt } from '../receipts/types'
import {
  type IssuedCorrection,
  type IssuedRefundProposal,
  issueForPartialRefund,
  type PartialRefundMode,
  type RefundItemsResolver,
} from './partial-refund'
import type { PaymentCustomer, PaymentEvent, PaymentLineItem } from './types'

export interface PaymentDocumentItem {
  readonly name: string
  readonly quantity?: number
  readonly unit?: string | undefined
  readonly identifier?: string | undefined
  readonly comment?: string | undefined
  readonly grossUnitPrice?: number
  readonly netUnitPrice?: number
  readonly vat: VatRate
}

export interface IssueForPaymentOptions {
  readonly vat?: VatRate | undefined
  readonly vatFor?: ((item: PaymentLineItem) => VatRate) | undefined
  readonly items?: readonly PaymentDocumentItem[] | undefined
  readonly fallbackItemName?: string | undefined
  readonly document?: 'auto' | 'receipt' | 'invoice' | undefined
  readonly buyer?: InvoiceBuyer | undefined
  readonly buyerIsBusiness?: boolean | undefined
  readonly invoiceRequested?: boolean | undefined
  readonly cashRegisterRequired?: boolean | undefined
  readonly orderNumber?: string | undefined
  readonly currency?: string | undefined
  readonly exchangeRate?: number | undefined
  readonly exchangeBank?: string | undefined
  readonly allowAmountMismatch?: boolean | undefined
  readonly partialRefund?: PartialRefundMode | undefined
  readonly refundItems?: RefundItemsResolver | undefined
  readonly receipt?:
    | Partial<
        Omit<
          CreateReceiptInput,
          'items' | 'orderNumber' | 'callId' | 'currency' | 'exchangeRate' | 'exchangeBank'
        >
      >
    | undefined
  readonly invoice?:
    | Partial<
        Omit<
          StandardInvoiceInput,
          | 'items'
          | 'buyer'
          | 'type'
          | 'orderNumber'
          | 'paid'
          | 'currency'
          | 'exchangeRate'
          | 'exchangeBank'
          | 'externalId'
        >
      >
    | undefined
  readonly recoveryDelayMs?: number | undefined
  readonly signal?: AbortSignal | undefined
}

export interface IssuedReceipt {
  readonly kind: 'receipt'
  readonly orderNumber: string
  readonly number: string
  readonly created: boolean
  readonly receipt: Receipt
  readonly decision: DocumentDecision
}

export interface IssuedInvoice {
  readonly kind: 'invoice'
  readonly orderNumber: string
  readonly number: string
  readonly created: boolean
  readonly invoice: InvoiceOnceResult
  readonly decision: DocumentDecision
}

export interface IssuedReversal {
  readonly kind: 'reversal'
  readonly orderNumber: string
  readonly document: 'receipt' | 'invoice'
  readonly reversedNumber: string
  readonly number?: string | undefined
  readonly created: boolean
}

export interface SkippedPayment {
  readonly kind: 'skipped'
  readonly orderNumber: string
  readonly reason: string
}

export type IssuedDocument =
  | IssuedReceipt
  | IssuedInvoice
  | IssuedReversal
  | IssuedCorrection
  | IssuedRefundProposal
  | SkippedPayment

export interface PaymentDocumentsApi {
  readonly invoices: Pick<InvoicesApi, 'createOnce' | 'find' | 'reverse'>
  readonly receipts: Pick<ReceiptsApi, 'createOnce' | 'find' | 'reverse'>
}

const AMOUNT_TOLERANCE = 0.005
const DEFAULT_ITEM_NAME = 'Termék vagy szolgáltatás'
const DEFAULT_CURRENCY = 'HUF'
const DEFAULT_EXCHANGE_BANK = 'MNB'
const INVOICE_REVERSAL_SUFFIX = '/SS'
const RECEIPT_REVERSAL_SUFFIX = '/SN'
function validation(message: string, hint?: string): SzamlazzError {
  return new SzamlazzError(message, { category: 'validation', hint })
}

function skipped(orderNumber: string, reason: string): SkippedPayment {
  return { kind: 'skipped', orderNumber, reason }
}

export function paymentOrderNumber(payment: PaymentEvent): string {
  return `${payment.provider.toUpperCase()}-${payment.id}`
}

let countryNames: Intl.DisplayNames | null | undefined

function regionName(code: string): string | undefined {
  if (countryNames === undefined) {
    try {
      countryNames = new Intl.DisplayNames(['hu'], { type: 'region' })
    } catch {
      countryNames = null
    }
  }
  try {
    return countryNames?.of(code)
  } catch {
    return undefined
  }
}

function countryName(code: string | undefined): string | undefined {
  const value = code?.trim()
  if (!value) return undefined
  if (/^[A-Za-z]{2}$/.test(value)) {
    if (value.toUpperCase() === 'HU') return undefined
    return regionName(value.toUpperCase()) ?? value
  }
  return value
}

export function buyerFromCustomer(customer: PaymentCustomer | undefined): InvoiceBuyer | undefined {
  const address = customer?.address
  const name = customer?.name?.trim()
  const zip = address?.zip?.trim()
  const city = address?.city?.trim()
  const street = [address?.line1, address?.line2]
    .map((line) => line?.trim())
    .filter((line): line is string => Boolean(line))
    .join(', ')
  if (!name || !zip || !city || !street) return undefined
  return {
    name,
    zip,
    city,
    address: street,
    country: countryName(address?.country),
    email: customer?.email?.trim() || undefined,
    taxNumber: customer?.taxNumber?.trim() || undefined,
    euTaxNumber: customer?.euTaxNumber?.trim() || undefined,
  }
}

function vatOf(item: PaymentLineItem, options: IssueForPaymentOptions): VatRate {
  if (options.vatFor) return options.vatFor(item)
  if (item.vatPercent !== undefined) {
    if (isVatRate(item.vatPercent)) return item.vatPercent
    throw validation(
      `A(z) „${item.name}” tétel áfakulcsa (${item.vatPercent}%) nem ismert áfakulcs.`,
      'Add meg a vatFor opciót a helyes áfakulcs kiválasztásához.',
    )
  }
  if (options.vat !== undefined) return options.vat
  throw validation(
    `A(z) „${item.name}” tételhez nincs áfakulcs.`,
    'Add meg az alapértelmezett áfakulcsot (vat), vagy tételenként (vatFor).',
  )
}

function itemsOf(payment: PaymentEvent, options: IssueForPaymentOptions): PaymentDocumentItem[] {
  if (options.items && options.items.length > 0) return [...options.items]
  if (payment.items && payment.items.length > 0) {
    return payment.items.map((item) => {
      if (!(item.quantity > 0)) {
        throw validation(`A(z) „${item.name}” tétel mennyisége nem pozitív.`)
      }
      return {
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        identifier: item.sku,
        grossUnitPrice: item.totalGross / item.quantity,
        vat: vatOf(item, options),
      }
    })
  }
  if (payment.amount) {
    const name = options.fallbackItemName?.trim() || DEFAULT_ITEM_NAME
    const fallback: PaymentLineItem = { name, quantity: 1, totalGross: payment.amount.value }
    return [
      { name, quantity: 1, grossUnitPrice: payment.amount.value, vat: vatOf(fallback, options) },
    ]
  }
  throw validation(
    `A(z) ${payment.provider} fizetésből (${payment.id}) sem összeg, sem tétel nem olvasható ki.`,
    'Add meg a tételeket az items opcióban (például a saját rendelésedből).',
  )
}

function currencyOf(payment: PaymentEvent, options: IssueForPaymentOptions): string {
  const paid = payment.amount?.currency.trim().toUpperCase()
  const configured = options.currency?.trim().toUpperCase()
  if (paid && configured && paid !== configured) {
    throw validation(
      `A fizetés pénzneme (${paid}) eltér a megadott pénznemtől (${configured}).`,
      'A bizonylat pénzneme mindig a fizetésé; a currency opció csak akkor kell, ha a fizetésből nem olvasható ki.',
    )
  }
  return paid || configured || DEFAULT_CURRENCY
}

function documentGross(
  items: readonly PaymentDocumentItem[],
  currency: string,
  kind: 'receipt' | 'invoice',
): number {
  if (kind === 'receipt') {
    return roundMoney(
      calculateReceiptItems(items, currency).reduce(
        (sum, item) => sum + item.amounts.grossAmount,
        0,
      ),
      2,
    )
  }
  return roundMoney(
    items.reduce((sum, item) => sum + calculateInvoiceItem(item, currency).grossAmount, 0),
    2,
  )
}

function assertAmountMatches(
  payment: PaymentEvent,
  items: readonly PaymentDocumentItem[],
  currency: string,
  kind: 'receipt' | 'invoice',
  options: IssueForPaymentOptions,
): void {
  if (!payment.amount || options.allowAmountMismatch === true) return
  const gross = documentGross(items, currency, kind)
  if (Math.abs(gross - payment.amount.value) > AMOUNT_TOLERANCE) {
    throw validation(
      `A bizonylat tételeinek bruttó összege (${gross} ${currency}) eltér a kifizetett összegtől (${payment.amount.value} ${payment.amount.currency}).`,
      'Ellenőrizd a tételeket (szállítás, kedvezmény), vagy ha szándékos, add meg az allowAmountMismatch: true opciót.',
    )
  }
}

function decide(
  payment: PaymentEvent,
  buyer: InvoiceBuyer | undefined,
  gross: number,
  currency: string,
  options: IssueForPaymentOptions,
): DocumentDecision {
  if (options.document === 'receipt' || options.document === 'invoice') {
    const rate = isHuf(currency) ? 1 : options.exchangeRate
    return {
      type: options.document,
      reasons: ['A bizonylat típusát a hívó adta meg.'],
      grossTotalHuf: rate === undefined ? Number.NaN : roundMoney(gross * rate, 2),
    }
  }
  const decision = chooseDocument({
    grossTotal: gross,
    currency,
    exchangeRate: options.exchangeRate,
    buyer: {
      taxNumber: buyer?.taxNumber ?? payment.customer?.taxNumber,
      euTaxNumber: buyer?.euTaxNumber ?? payment.customer?.euTaxNumber,
      isBusiness: options.buyerIsBusiness ?? payment.customer?.isBusiness,
    },
    paidByFulfillment: true,
    invoiceRequested: options.invoiceRequested,
    cashRegisterRequired: options.cashRegisterRequired,
  })
  if (decision.type === 'cash-register') throw validation(decision.reasons.join(' '))
  return decision
}

function onceOptions(options: IssueForPaymentOptions): {
  readonly signal: AbortSignal | undefined
  readonly recoveryDelayMs: number | undefined
} {
  return { signal: options.signal, recoveryDelayMs: options.recoveryDelayMs }
}

async function issueReceipt(
  api: PaymentDocumentsApi,
  payment: PaymentEvent,
  orderNumber: string,
  items: readonly PaymentDocumentItem[],
  currency: string,
  decision: DocumentDecision,
  options: IssueForPaymentOptions,
): Promise<IssuedReceipt | SkippedPayment> {
  const extra = options.receipt ?? {}
  const foreign = !isHuf(currency)
  const result = await api.receipts.createOnce(
    {
      ...extra,
      paymentMethod: extra.paymentMethod ?? payment.method,
      currency,
      exchangeRate: foreign ? options.exchangeRate : undefined,
      exchangeBank: foreign ? (options.exchangeBank ?? DEFAULT_EXCHANGE_BANK) : undefined,
      orderNumber,
      callId: orderNumber,
      items,
    },
    onceOptions(options),
  )
  if (result.receipt.type === 'reversal') {
    return skipped(
      orderNumber,
      `A rendeléshez tartozó nyugtát már sztornózták (sztornó: ${result.receipt.number}), ezért nem készül új nyugta.`,
    )
  }
  return {
    kind: 'receipt',
    orderNumber,
    number: result.receipt.number,
    created: result.created,
    receipt: result.receipt,
    decision,
  }
}

async function issueInvoice(
  api: PaymentDocumentsApi,
  payment: PaymentEvent,
  orderNumber: string,
  items: readonly PaymentDocumentItem[],
  currency: string,
  buyer: InvoiceBuyer | undefined,
  decision: DocumentDecision,
  options: IssueForPaymentOptions,
): Promise<IssuedInvoice> {
  if (!buyer) {
    throw validation(
      'Számlához a vevő neve és teljes címe kell, ezt a fizetésből nem lehetett kiolvasni.',
      'Add meg a vevőt a buyer opcióban.',
    )
  }
  const extra = options.invoice ?? {}
  const foreign = !isHuf(currency)
  const invoice = await api.invoices.createOnce(
    {
      ...extra,
      paid: true,
      paymentMethod: extra.paymentMethod ?? payment.method,
      currency,
      exchangeRate: foreign ? options.exchangeRate : undefined,
      exchangeBank: foreign ? options.exchangeBank : undefined,
      externalId: orderNumber,
      orderNumber,
      buyer,
      items,
    },
    onceOptions(options),
  )
  return {
    kind: 'invoice',
    orderNumber,
    number: invoice.number,
    created: invoice.created,
    invoice,
    decision,
  }
}

async function reverseInvoiceOnce(
  api: PaymentDocumentsApi,
  orderNumber: string,
  invoiceNumber: string,
  options: IssueForPaymentOptions,
): Promise<IssuedReversal> {
  const externalId = `${orderNumber}${INVOICE_REVERSAL_SUFFIX}`
  const lookup = (): Promise<{ readonly header: { readonly number: string } } | null> =>
    api.invoices.find({ externalId }, { includePdf: false }, { signal: options.signal })
  const base = {
    kind: 'reversal' as const,
    orderNumber,
    document: 'invoice' as const,
    reversedNumber: invoiceNumber,
  }
  const existing = await lookup()
  if (existing) return { ...base, number: existing.header.number, created: false }
  try {
    const reversed = await api.invoices.reverse(
      { invoiceNumber, externalId, downloadPdf: false },
      { signal: options.signal },
    )
    return { ...base, number: reversed.number, created: true }
  } catch (error) {
    if (!isUncertainOutcome(error)) throw error
    const delay = resolveRecoveryDelay(options.recoveryDelayMs)
    const recovered = await recoverAfterFailure(lookup, delay, options.signal)
    if (!recovered) throw error
    return { ...base, number: recovered.header.number, created: error.category !== 'duplicate' }
  }
}

async function reverseConvertedInvoice(
  api: PaymentDocumentsApi,
  orderNumber: string,
  receiptNumber: string,
  options: IssueForPaymentOptions,
): Promise<IssuedReversal | undefined> {
  const converted = await api.invoices.find(
    { externalId: conversionExternalId(receiptNumber) },
    { includePdf: false },
    { signal: options.signal },
  )
  if (!converted || converted.header.type === 'reversal') return undefined
  return reverseInvoiceOnce(api, orderNumber, converted.header.number, options)
}

function receiptReversal(
  orderNumber: string,
  reversedNumber: string,
  number: string | undefined,
  created: boolean,
): IssuedReversal {
  return { kind: 'reversal', orderNumber, document: 'receipt', reversedNumber, number, created }
}

function isReversedReceipt(receipt: Receipt): boolean {
  return receipt.type === 'reversal' || receipt.isReversed
}

async function reverseReceiptForRefund(
  api: PaymentDocumentsApi,
  payment: PaymentEvent,
  orderNumber: string,
  options: IssueForPaymentOptions,
): Promise<IssuedReversal | SkippedPayment> {
  const lookup = (): Promise<Receipt | null> =>
    api.receipts.find({ orderNumber, downloadPdf: false }, { signal: options.signal })
  const receipt = await lookup()
  if (!receipt) {
    return skipped(
      orderNumber,
      `A(z) ${payment.provider} visszatérítéshez (${payment.id}) nem található kiállított bizonylat.`,
    )
  }
  if (isReversedReceipt(receipt)) {
    const originalNumber =
      receipt.type === 'reversal'
        ? (receipt.reversedReceiptNumber ?? receipt.number)
        : receipt.number
    const converted = await reverseConvertedInvoice(api, orderNumber, originalNumber, options)
    if (converted) return converted
    const reversalNumber = receipt.type === 'reversal' ? receipt.number : undefined
    return receiptReversal(orderNumber, originalNumber, reversalNumber, false)
  }
  try {
    const reversal = await api.receipts.reverse(
      {
        receiptNumber: receipt.number,
        callId: `${orderNumber}${RECEIPT_REVERSAL_SUFFIX}`,
        downloadPdf: false,
      },
      { signal: options.signal },
    )
    return receiptReversal(orderNumber, receipt.number, reversal.number, true)
  } catch (error) {
    if (!isUncertainOutcome(error)) throw error
    const delay = resolveRecoveryDelay(options.recoveryDelayMs)
    const reversedLookup = async (): Promise<Receipt | null> => {
      const current = await lookup()
      return current && isReversedReceipt(current) ? current : null
    }
    const recovered = await recoverAfterFailure(reversedLookup, delay, options.signal)
    const created = error.category !== 'duplicate'
    if (recovered) {
      const number = recovered.type === 'reversal' ? recovered.number : undefined
      return receiptReversal(orderNumber, receipt.number, number, created)
    }
    if (!created) return receiptReversal(orderNumber, receipt.number, undefined, false)
    throw error
  }
}

async function reverseForRefund(
  api: PaymentDocumentsApi,
  payment: PaymentEvent,
  orderNumber: string,
  options: IssueForPaymentOptions,
): Promise<IssuedReversal | SkippedPayment> {
  const invoice = await api.invoices.find(
    { externalId: orderNumber },
    { includePdf: false },
    { signal: options.signal },
  )
  if (invoice && invoice.header.type !== 'reversal') {
    return reverseInvoiceOnce(api, orderNumber, invoice.header.number, options)
  }
  return reverseReceiptForRefund(api, payment, orderNumber, options)
}

function assertPaidAmount(payment: PaymentEvent): void {
  const value = payment.amount?.value
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
    throw validation(`A(z) ${payment.provider} fizetés összege érvénytelen: ${value}`)
  }
}

export async function issueForPayment(
  api: PaymentDocumentsApi,
  payment: PaymentEvent,
  options: IssueForPaymentOptions = {},
): Promise<IssuedDocument> {
  resolveRecoveryDelay(options.recoveryDelayMs)
  const orderNumber = options.orderNumber?.trim() || paymentOrderNumber(payment)
  if (payment.kind === 'refunded') return reverseForRefund(api, payment, orderNumber, options)
  if (payment.kind === 'partially-refunded') {
    return issueForPartialRefund(api, payment, orderNumber, options)
  }
  if (payment.kind !== 'paid') {
    return skipped(
      orderNumber,
      `A fizetés állapota (${payment.kind}) nem sikeres fizetés, ezért nem készül bizonylat.`,
    )
  }
  assertPaidAmount(payment)
  if (payment.amount?.value === 0) {
    return skipped(orderNumber, 'A fizetett összeg 0, ezért nem készül bizonylat.')
  }
  const currency = currencyOf(payment, options)
  const items = itemsOf(payment, options)
  const buyer = options.buyer ?? buyerFromCustomer(payment.customer)
  const gross = payment.amount?.value ?? documentGross(items, currency, 'invoice')
  const decision = decide(payment, buyer, gross, currency, options)
  const kind = decision.type === 'receipt' ? 'receipt' : 'invoice'
  assertAmountMatches(payment, items, currency, kind, options)
  if (kind === 'receipt') {
    return issueReceipt(api, payment, orderNumber, items, currency, decision, options)
  }
  return issueInvoice(api, payment, orderNumber, items, currency, buyer, decision, options)
}
