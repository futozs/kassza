import {
  type CreateInvoiceInput,
  INVOICE_LANGUAGES,
  type InvoiceBuyer,
  type InvoiceItemInput,
} from '../invoices/create-types'
import type { CreateReceiptInput, ReceiptItemInput, ReceiptPaymentInput } from '../receipts/types'
import {
  assertKnownKeys,
  invoiceVat,
  objectArg,
  optionalArray,
  optionalBoolean,
  optionalDate,
  optionalEnum,
  optionalNumber,
  optionalString,
  receiptVat,
  requiredArray,
  requiredString,
  ToolInputError,
} from './arguments'
import type { JsonObject } from './protocol'

export const MCP_INVOICE_TYPES = ['invoice', 'proforma'] as const

export const MAX_TOOL_ITEMS = 100

const BUYER_KEYS = [
  'name',
  'zip',
  'city',
  'address',
  'country',
  'email',
  'taxNumber',
  'euTaxNumber',
]
const ITEM_KEYS = ['name', 'quantity', 'unit', 'netUnitPrice', 'grossUnitPrice', 'vat', 'comment']
const PAYMENT_KEYS = ['method', 'amount', 'description']

export const INVOICE_INPUT_KEYS: readonly string[] = [
  'type',
  'buyer',
  'items',
  'paymentMethod',
  'currency',
  'exchangeRate',
  'exchangeBank',
  'language',
  'issueDate',
  'fulfillmentDate',
  'dueDate',
  'comment',
  'orderNumber',
  'externalId',
  'prefix',
  'paid',
  'eInvoice',
  'sendEmail',
]

export const RECEIPT_INPUT_KEYS: readonly string[] = [
  'items',
  'payments',
  'paymentMethod',
  'currency',
  'exchangeRate',
  'exchangeBank',
  'comment',
  'orderNumber',
  'prefix',
]

interface UnitPrice {
  readonly netUnitPrice?: number
  readonly grossUnitPrice?: number
  readonly quantity?: number
}

function unitPriceOf(item: JsonObject, path: string): UnitPrice {
  const net = optionalNumber(item, 'netUnitPrice', path)
  const gross = optionalNumber(item, 'grossUnitPrice', path)
  const quantity = optionalNumber(item, 'quantity', path)
  if ((net === undefined) === (gross === undefined)) {
    throw new ToolInputError(
      `A(z) ${path} tételnél pontosan az egyiket add meg: netUnitPrice (nettó egységár) vagy grossUnitPrice (bruttó egységár).`,
    )
  }
  return {
    ...(net === undefined ? {} : { netUnitPrice: net }),
    ...(gross === undefined ? {} : { grossUnitPrice: gross }),
    ...(quantity === undefined ? {} : { quantity }),
  }
}

function itemObject(
  value: unknown,
  index: number,
): { readonly item: JsonObject; readonly path: string } {
  const path = `items[${index}]`
  const item = objectArg(value, path)
  assertKnownKeys(item, ITEM_KEYS, path)
  return { item, path }
}

function invoiceItemOf(value: unknown, index: number): InvoiceItemInput {
  const { item, path } = itemObject(value, index)
  return {
    name: requiredString(item, 'name', path),
    unit: optionalString(item, 'unit', path),
    comment: optionalString(item, 'comment', path),
    vat: invoiceVat(item.vat, `${path}.vat`),
    ...unitPriceOf(item, path),
  }
}

function receiptItemOf(value: unknown, index: number): ReceiptItemInput {
  const { item, path } = itemObject(value, index)
  return {
    name: requiredString(item, 'name', path),
    unit: optionalString(item, 'unit', path),
    comment: optionalString(item, 'comment', path),
    vat: receiptVat(item.vat, `${path}.vat`),
    ...unitPriceOf(item, path),
  }
}

function buyerOf(value: unknown, sendEmail: boolean): InvoiceBuyer {
  const buyer = objectArg(value, 'buyer')
  assertKnownKeys(buyer, BUYER_KEYS, 'buyer')
  return {
    name: requiredString(buyer, 'name', 'buyer'),
    zip: requiredString(buyer, 'zip', 'buyer'),
    city: requiredString(buyer, 'city', 'buyer'),
    address: requiredString(buyer, 'address', 'buyer'),
    country: optionalString(buyer, 'country', 'buyer'),
    email: optionalString(buyer, 'email', 'buyer'),
    taxNumber: optionalString(buyer, 'taxNumber', 'buyer'),
    euTaxNumber: optionalString(buyer, 'euTaxNumber', 'buyer'),
    sendEmail,
  }
}

function paymentOf(value: unknown, index: number): ReceiptPaymentInput {
  const path = `payments[${index}]`
  const payment = objectArg(value, path)
  assertKnownKeys(payment, PAYMENT_KEYS, path)
  const amount = optionalNumber(payment, 'amount', path)
  if (amount === undefined) throw new ToolInputError(`A(z) ${path}.amount mező kötelező.`)
  return {
    method: requiredString(payment, 'method', path),
    amount,
    description: optionalString(payment, 'description', path),
  }
}

export function invoiceInputOf(
  args: JsonObject,
  extraKeys: readonly string[] = [],
): CreateInvoiceInput {
  assertKnownKeys(args, [...INVOICE_INPUT_KEYS, ...extraKeys], '')
  return {
    type: optionalEnum(args, 'type', '', MCP_INVOICE_TYPES),
    buyer: buyerOf(args.buyer, optionalBoolean(args, 'sendEmail', '') ?? false),
    items: requiredArray(args, 'items', '', { min: 1, max: MAX_TOOL_ITEMS }).map(invoiceItemOf),
    paymentMethod: optionalString(args, 'paymentMethod', ''),
    currency: optionalString(args, 'currency', ''),
    exchangeRate: optionalNumber(args, 'exchangeRate', ''),
    exchangeBank: optionalString(args, 'exchangeBank', ''),
    language: optionalEnum(args, 'language', '', INVOICE_LANGUAGES),
    issueDate: optionalDate(args, 'issueDate', ''),
    fulfillmentDate: optionalDate(args, 'fulfillmentDate', ''),
    dueDate: optionalDate(args, 'dueDate', ''),
    comment: optionalString(args, 'comment', ''),
    orderNumber: optionalString(args, 'orderNumber', ''),
    externalId: optionalString(args, 'externalId', ''),
    prefix: optionalString(args, 'prefix', ''),
    paid: optionalBoolean(args, 'paid', ''),
    eInvoice: optionalBoolean(args, 'eInvoice', ''),
    downloadPdf: false,
  }
}

export function receiptInputOf(
  args: JsonObject,
  extraKeys: readonly string[] = [],
): CreateReceiptInput {
  assertKnownKeys(args, [...RECEIPT_INPUT_KEYS, ...extraKeys], '')
  return {
    items: requiredArray(args, 'items', '', { min: 1, max: MAX_TOOL_ITEMS }).map(receiptItemOf),
    payments: optionalArray(args, 'payments', '')?.map(paymentOf),
    paymentMethod: optionalString(args, 'paymentMethod', ''),
    currency: optionalString(args, 'currency', ''),
    exchangeRate: optionalNumber(args, 'exchangeRate', ''),
    exchangeBank: optionalString(args, 'exchangeBank', ''),
    comment: optionalString(args, 'comment', ''),
    orderNumber: optionalString(args, 'orderNumber', ''),
    prefix: optionalString(args, 'prefix', ''),
    downloadPdf: false,
  }
}
