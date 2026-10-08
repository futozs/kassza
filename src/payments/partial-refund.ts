import { SzamlazzError } from '../core/errors'
import type { InvoiceOnceResult } from '../invoices/create-once'
import type { InvoiceBuyer } from '../invoices/create-types'
import type { InvoiceDetails, InvoiceDetailsItem } from '../invoices/get'
import { allocateRefund, type RefundAllocation, type RefundableItem } from '../money/refund'
import { roundMoney } from '../money/rounding'
import { isHuf, isVatRate, type VatRate } from '../money/vat'
import { conversionExternalId } from '../receipts/convert'
import type { Receipt, ReceiptVatRate } from '../receipts/types'
import type {
  IssueForPaymentOptions,
  PaymentDocumentItem,
  PaymentDocumentsApi,
  SkippedPayment,
} from './issue'
import type { PaymentEvent, PaymentRefund } from './types'

export type PartialRefundMode = 'auto' | 'proportional' | 'skip'

export interface RefundItemsContext {
  readonly refund: PaymentRefund
  readonly invoiceNumber: string
  readonly items: readonly RefundableItem[]
}

export type RefundItemsResolver = (
  context: RefundItemsContext,
) =>
  | readonly PaymentDocumentItem[]
  | undefined
  | Promise<readonly PaymentDocumentItem[] | undefined>

export interface IssuedRefundCorrection {
  readonly refundId: string
  readonly externalId: string
  readonly number: string
  readonly created: boolean
  readonly grossTotal: number
  readonly invoice: InvoiceOnceResult
}

export interface IssuedCorrection {
  readonly kind: 'correction'
  readonly orderNumber: string
  readonly correctedNumber: string
  readonly created: boolean
  readonly corrections: readonly IssuedRefundCorrection[]
}

export interface RefundProposalLine {
  readonly refundId: string
  readonly grossTotal: number
  readonly items: readonly RefundAllocation<ReceiptVatRate>[]
}

export interface IssuedRefundProposal {
  readonly kind: 'refund-proposal'
  readonly orderNumber: string
  readonly document: 'receipt' | 'invoice'
  readonly documentNumber: string
  readonly refunds: readonly RefundProposalLine[]
  readonly reason: string
}

const CORRECTION_SUFFIX = '/R-'
const MAX_PLAIN_REFUND_KEY = 24
const AMOUNT_TOLERANCE = 0.005

function validation(message: string, hint?: string): SzamlazzError {
  return new SzamlazzError(message, { category: 'validation', hint })
}

function skipped(orderNumber: string, reason: string): SkippedPayment {
  return { kind: 'skipped', orderNumber, reason }
}

async function refundKey(id: string): Promise<string> {
  if (id.length <= MAX_PLAIN_REFUND_KEY && /^[A-Za-z0-9_.:-]+$/.test(id)) return id
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(id))
  return Array.from(new Uint8Array(digest).slice(0, 8), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

export async function correctionExternalId(orderNumber: string, refundId: string): Promise<string> {
  return `${orderNumber}${CORRECTION_SUFFIX}${await refundKey(refundId)}`
}

function decimalsFor(currency: string | undefined): number {
  return isHuf(currency) ? 0 : 2
}

function vatOfItem(item: InvoiceDetailsItem): VatRate | undefined {
  if (item.vatCode && isVatRate(item.vatCode)) return item.vatCode
  return isVatRate(item.vat) ? item.vat : undefined
}

function refundableItems(details: InvoiceDetails): RefundableItem[] | undefined {
  const items: RefundableItem[] = []
  for (const item of details.items) {
    const vat = vatOfItem(item)
    if (vat === undefined || item.grossAmount < 0) return undefined
    items.push({
      name: item.name,
      vat,
      grossAmount: item.grossAmount,
      ...(item.unit === undefined ? {} : { unit: item.unit }),
      ...(item.identifier === undefined ? {} : { identifier: item.identifier }),
    })
  }
  return items.length > 0 ? items : undefined
}

function receiptItems(receipt: Receipt): RefundableItem<ReceiptVatRate>[] {
  return receipt.items.map((item) => ({
    name: item.name,
    vat: item.vat,
    grossAmount: item.grossAmount,
    ...(item.unit === undefined ? {} : { unit: item.unit }),
  }))
}

function buyerOf(details: InvoiceDetails): InvoiceBuyer | undefined {
  const { buyer } = details
  const address = buyer.address
  if (!buyer.name || !address?.zip || !address.city || !address.address) return undefined
  return {
    name: buyer.name,
    zip: address.zip,
    city: address.city,
    address: address.address,
    country: address.country,
    email: buyer.email,
    taxNumber: buyer.taxNumber,
    groupTaxNumber: buyer.groupTaxNumber,
    euTaxNumber: buyer.euTaxNumber,
    identifier: buyer.identifier,
  }
}

function sameCurrency(a: string | undefined, b: string | undefined): boolean {
  if (isHuf(a) && isHuf(b)) return true
  return a?.trim().toUpperCase() === b?.trim().toUpperCase()
}

function assertRefunds(
  refunds: readonly PaymentRefund[],
  currency: string | undefined,
  documentNumber: string,
): void {
  for (const refund of refunds) {
    if (!sameCurrency(refund.amount.currency, currency)) {
      throw validation(
        `A(z) ${refund.id} visszatérítés pénzneme (${refund.amount.currency}) eltér a(z) ${documentNumber} bizonylatétól (${currency ?? 'HUF'}).`,
      )
    }
  }
}

function proposal(
  orderNumber: string,
  document: 'receipt' | 'invoice',
  documentNumber: string,
  items: readonly RefundableItem<ReceiptVatRate>[],
  refunds: readonly PaymentRefund[],
  currency: string | undefined,
  reason: string,
): IssuedRefundProposal {
  return {
    kind: 'refund-proposal',
    orderNumber,
    document,
    documentNumber,
    refunds: refunds.map((refund) => ({
      refundId: refund.id,
      grossTotal: refund.amount.value,
      items: allocateRefund(items, refund.amount.value, {
        decimals: decimalsFor(currency),
        refundedBefore: refund.refundedBefore,
      }),
    })),
    reason,
  }
}

function allocationItems(allocations: readonly RefundAllocation[]): PaymentDocumentItem[] {
  return allocations.map((allocation) => ({
    name: allocation.name,
    quantity: -1,
    unit: allocation.unit,
    identifier: allocation.identifier,
    grossUnitPrice: allocation.grossAmount,
    vat: allocation.vat,
  }))
}

function negated(items: readonly PaymentDocumentItem[]): PaymentDocumentItem[] {
  return items.map((item) => ({ ...item, quantity: -Math.abs(item.quantity ?? 1) }))
}

function grossOf(items: readonly PaymentDocumentItem[]): number {
  return roundMoney(
    items.reduce(
      (sum, item) => sum + Math.abs(item.quantity ?? 1) * (item.grossUnitPrice ?? Number.NaN),
      0,
    ),
    2,
  )
}

async function correctionItems(
  refund: PaymentRefund,
  details: InvoiceDetails,
  items: readonly RefundableItem[],
  options: IssueForPaymentOptions,
): Promise<PaymentDocumentItem[]> {
  const custom = await options.refundItems?.({
    refund,
    invoiceNumber: details.header.number,
    items,
  })
  if (custom && custom.length > 0) {
    const gross = grossOf(custom)
    if (!(Math.abs(gross - refund.amount.value) <= AMOUNT_TOLERANCE)) {
      throw validation(
        `A refundItems tételeinek bruttó összege (${gross}) eltér a(z) ${refund.id} visszatérítés összegétől (${refund.amount.value}).`,
        'A refundItems a visszatérített tételeket pozitív bruttó egységárral (grossUnitPrice) adja vissza; a kassza fordítja negatívba.',
      )
    }
    return negated(custom)
  }
  return allocationItems(
    allocateRefund(items, refund.amount.value, {
      decimals: decimalsFor(details.header.currency),
      refundedBefore: refund.refundedBefore,
    }),
  )
}

async function issueCorrection(
  api: PaymentDocumentsApi,
  payment: PaymentEvent,
  orderNumber: string,
  details: InvoiceDetails,
  refund: PaymentRefund,
  items: PaymentDocumentItem[],
  options: IssueForPaymentOptions,
): Promise<IssuedRefundCorrection> {
  const buyer = options.buyer ?? buyerOf(details)
  if (!buyer) {
    throw validation(
      `A(z) ${details.header.number} számla vevőjének címe nem olvasható ki, így a helyesbítő számla nem állítható ki.`,
      'Add meg a vevőt a buyer opcióban.',
    )
  }
  const externalId = await correctionExternalId(orderNumber, refund.id)
  const header = details.header
  const foreign = !isHuf(header.currency)
  const extra = options.invoice ?? {}
  const invoice = await api.invoices.createOnce(
    {
      ...extra,
      type: 'corrective',
      correctedInvoiceNumber: header.number,
      paid: true,
      paymentMethod: extra.paymentMethod ?? header.paymentMethod ?? payment.method,
      currency: header.currency,
      exchangeRate: foreign ? header.exchangeRate : undefined,
      exchangeBank: foreign ? header.exchangeBank : undefined,
      orderNumber,
      externalId,
      buyer,
      items,
      comment: extra.comment ?? `Részleges visszatérítés (${payment.provider}: ${refund.id}).`,
    },
    {
      signal: options.signal,
      recoveryDelayMs: options.recoveryDelayMs,
      matchOrderNumber: false,
    },
  )
  return {
    refundId: refund.id,
    externalId,
    number: invoice.number,
    created: invoice.created,
    grossTotal: -refund.amount.value,
    invoice,
  }
}

function mixedVatReason(rates: ReadonlySet<string>): string {
  return `Az eredeti számlán több áfakulcs van (${[...rates].join(', ')}), ezért a kassza nem tudja, melyik tétel került visszatérítésre. Add meg a refundItems opciót, vagy ha arányos szétosztás a helyes (például százalékos kedvezmény), a partialRefund: 'proportional' beállítást.`
}

async function correctInvoice(
  api: PaymentDocumentsApi,
  payment: PaymentEvent,
  orderNumber: string,
  details: InvoiceDetails,
  refunds: readonly PaymentRefund[],
  options: IssueForPaymentOptions,
): Promise<IssuedCorrection | IssuedRefundProposal | SkippedPayment> {
  const header = details.header
  if (header.type === 'reversal' || header.reversed === true) {
    return skipped(
      orderNumber,
      `A(z) ${header.number} számlát már sztornózták, ezért nem készül helyesbítő számla.`,
    )
  }
  const items = refundableItems(details)
  if (!items) {
    throw validation(
      `A(z) ${header.number} számla tételei nem olvashatók ki egyértelműen (áfakulcs vagy negatív tétel), így a helyesbítés nem számolható.`,
      'Állítsd ki a helyesbítő számlát kézzel.',
    )
  }
  assertRefunds(refunds, header.currency, header.number)
  const rates = new Set(items.map((item) => String(item.vat)))
  const mode = options.partialRefund ?? 'auto'
  if (rates.size > 1 && mode === 'auto' && !options.refundItems) {
    return proposal(
      orderNumber,
      'invoice',
      header.number,
      items,
      refunds,
      header.currency,
      mixedVatReason(rates),
    )
  }
  const corrections: IssuedRefundCorrection[] = []
  for (const refund of refunds) {
    const correction = await issueCorrection(
      api,
      payment,
      orderNumber,
      details,
      refund,
      await correctionItems(refund, details, items, options),
      options,
    )
    corrections.push(correction)
  }
  return {
    kind: 'correction',
    orderNumber,
    correctedNumber: header.number,
    created: corrections.some((correction) => correction.created),
    corrections,
  }
}

const RECEIPT_PROPOSAL_REASON =
  'Nyugtánál a részleges visszatérítés jogi menete nem egyértelmű (sztornó és új nyugta a megmaradó tételekről), ezért a kassza nem állít ki automatikusan bizonylatot. A javasolt tételbontást egyeztesd a könyvelőddel.'

export async function issueForPartialRefund(
  api: PaymentDocumentsApi,
  payment: PaymentEvent,
  orderNumber: string,
  options: IssueForPaymentOptions,
): Promise<IssuedCorrection | IssuedRefundProposal | SkippedPayment> {
  if (options.partialRefund === 'skip') {
    return skipped(
      orderNumber,
      'Részleges visszatérítés: a partialRefund: skip beállítás miatt nem készül bizonylat.',
    )
  }
  const refunds = payment.refunds ?? []
  if (refunds.length === 0) {
    return skipped(
      orderNumber,
      `Részleges visszatérítés: a(z) ${payment.provider} esemény nem adta át tételesen a visszatérítéseket (azonosító és összeg), ezért a kassza nem tud idempotens helyesbítést kiállítani. Állítsd ki kézzel, vagy kapcsold be a szolgáltató részletes lekérdezését.`,
    )
  }
  const find = (externalId: string): Promise<InvoiceDetails | null> =>
    api.invoices.find({ externalId }, { includePdf: false }, { signal: options.signal })
  const invoice = await find(orderNumber)
  if (invoice) return correctInvoice(api, payment, orderNumber, invoice, refunds, options)
  const receipt = await api.receipts.find(
    { orderNumber, downloadPdf: false },
    { signal: options.signal },
  )
  if (!receipt) {
    return skipped(
      orderNumber,
      `A(z) ${payment.provider} részleges visszatérítéshez (${payment.id}) nem található kiállított bizonylat.`,
    )
  }
  const original =
    receipt.type === 'reversal' ? (receipt.reversedReceiptNumber ?? receipt.number) : receipt.number
  if (receipt.type === 'reversal' || receipt.isReversed) {
    const converted = await find(conversionExternalId(original))
    if (converted) return correctInvoice(api, payment, orderNumber, converted, refunds, options)
    return skipped(orderNumber, `A(z) ${original} nyugtát már sztornózták.`)
  }
  assertRefunds(refunds, receipt.currency, receipt.number)
  return proposal(
    orderNumber,
    'receipt',
    receipt.number,
    receiptItems(receipt),
    refunds,
    receipt.currency,
    RECEIPT_PROPOSAL_REASON,
  )
}
