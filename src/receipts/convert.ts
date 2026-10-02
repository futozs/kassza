import type { RequestOptions } from '../core/context'
import { SzamlazzError } from '../core/errors'
import type { CreateOnceOptions } from '../core/once'
import {
  createInvoiceOnce,
  type InvoiceOnceApi,
  type InvoiceOnceResult,
} from '../invoices/create-once'
import type {
  InvoiceBuyer,
  InvoiceItemInput,
  InvoiceLanguage,
  InvoiceSeller,
  InvoiceTemplate,
} from '../invoices/create-types'
import { isHuf, type VatRate } from '../money/vat'
import {
  RECEIPT_ONLY_VAT_CODES,
  type Receipt,
  type ReceiptItem,
  type ReceiptOnlyVatCode,
  type ReverseReceiptInput,
} from './types'

export interface ConvertReceiptApi {
  readonly receipts: {
    get(
      input: { readonly receiptNumber: string; readonly downloadPdf?: boolean },
      options?: RequestOptions,
    ): Promise<Receipt>
    reverse(input: ReverseReceiptInput, options?: RequestOptions): Promise<Receipt>
  }
  readonly invoices: InvoiceOnceApi
}

export interface ConvertReceiptInput {
  readonly receiptNumber: string
  readonly buyer: InvoiceBuyer
  readonly orderNumber?: string | undefined
  readonly prefix?: string | undefined
  readonly comment?: string | undefined
  readonly language?: InvoiceLanguage | undefined
  readonly template?: InvoiceTemplate | undefined
  readonly seller?: InvoiceSeller | undefined
  readonly eInvoice?: boolean | undefined
  readonly downloadPdf?: boolean | undefined
  readonly vatMapping?: Readonly<Partial<Record<ReceiptOnlyVatCode, VatRate>>> | undefined
  readonly allowAlreadyReversed?: boolean | undefined
}

export interface ConvertedReceipt {
  readonly receipt: Receipt
  readonly reversal?: Receipt | undefined
  readonly invoice: InvoiceOnceResult
}

const receiptOnlyCodes: ReadonlySet<string> = new Set(RECEIPT_ONLY_VAT_CODES)

function validation(message: string, hint?: string): SzamlazzError {
  return new SzamlazzError(message, { category: 'validation', hint })
}

export function conversionExternalId(receiptNumber: string): string {
  return `CONV/${receiptNumber}`
}

function invoiceVat(item: ReceiptItem, mapping: ConvertReceiptInput['vatMapping']): VatRate {
  if (typeof item.vat === 'string' && receiptOnlyCodes.has(item.vat)) {
    const mapped = mapping?.[item.vat as ReceiptOnlyVatCode]
    if (mapped === undefined) {
      throw validation(
        `A(z) „${item.name}” tétel áfakódja (${item.vat}) csak nyugtán használható, számlán nincs automatikus megfelelője.`,
        'Add meg a számlán használandó áfakulcsot a vatMapping opcióban, a könyvelőddel egyeztetve.',
      )
    }
    return mapped
  }
  return item.vat as VatRate
}

export function receiptItemsToInvoiceItems(
  receipt: Receipt,
  mapping?: ConvertReceiptInput['vatMapping'],
): InvoiceItemInput[] {
  return receipt.items.map((item) => {
    if (!(item.quantity > 0)) {
      throw validation(
        `A(z) „${item.name}” tétel mennyisége nem pozitív, a nyugta nem alakítható számlává.`,
      )
    }
    return {
      name: item.name,
      identifier: item.identifier,
      quantity: item.quantity,
      unit: item.unit || undefined,
      grossUnitPrice: item.grossAmount / item.quantity,
      vat: invoiceVat(item, mapping),
    }
  })
}

function conversionComment(
  receipt: Receipt,
  reversal: Receipt | undefined,
  extra: string | undefined,
): string {
  const reversalPart = reversal ? `, sztornó: ${reversal.number}` : ''
  const base = `A(z) ${receipt.number} nyugta alapján kiállított számla (a nyugta sztornózva${reversalPart}).`
  return extra?.trim() ? `${base} ${extra.trim()}` : base
}

export async function convertReceiptToInvoice(
  api: ConvertReceiptApi,
  input: ConvertReceiptInput,
  options: CreateOnceOptions = {},
): Promise<ConvertedReceipt> {
  const receiptNumber = input.receiptNumber?.trim()
  if (!receiptNumber) throw validation('Add meg az átalakítandó nyugta számát (receiptNumber).')
  const receipt = await api.receipts.get({ receiptNumber, downloadPdf: false }, options)
  if (receipt.type !== 'receipt') {
    throw validation(`A(z) ${receiptNumber} sztornó nyugta, számlává nem alakítható.`)
  }
  const items = receiptItemsToInvoiceItems(receipt, input.vatMapping)
  const externalId = conversionExternalId(receipt.number)
  const orderNumber = input.orderNumber?.trim() || receipt.orderNumber || `CONV-${receipt.number}`

  const existing = await api.invoices.find({ externalId }, { includePdf: false }, options)
  if (existing) {
    return {
      receipt,
      invoice: { number: existing.header.number, created: false, externalId, details: existing },
    }
  }

  let reversal: Receipt | undefined
  if (receipt.isReversed) {
    if (input.allowAlreadyReversed !== true) {
      throw validation(
        `A(z) ${receipt.number} nyugta már sztornózva van, ezért nem állítok ki rá számlát.`,
        'Ha a sztornót egy korábbi, félbeszakadt átalakítás végezte, hívd újra allowAlreadyReversed: true beállítással.',
      )
    }
  } else {
    reversal = await api.receipts.reverse(
      { receiptNumber: receipt.number, callId: `CONV-${receipt.number}`, downloadPdf: false },
      options,
    )
  }

  const invoice = await createInvoiceOnce(
    api.invoices,
    {
      buyer: input.buyer,
      items,
      orderNumber,
      externalId,
      paid: true,
      paymentMethod: receipt.paymentMethod,
      currency: receipt.currency,
      ...(isHuf(receipt.currency)
        ? {}
        : { exchangeRate: receipt.exchangeRate, exchangeBank: receipt.exchangeBank }),
      fulfillmentDate: receipt.issueDate || undefined,
      prefix: input.prefix,
      language: input.language,
      template: input.template,
      seller: input.seller,
      eInvoice: input.eInvoice,
      downloadPdf: input.downloadPdf,
      comment: conversionComment(receipt, reversal, input.comment),
    },
    { ...options, lookupFirst: false, matchOrderNumber: false },
  )
  return { receipt, reversal, invoice }
}
