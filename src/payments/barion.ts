import { roundMoney } from '../money/rounding'
import { normalizeCurrency } from './amounts'
import { plainResponse, readRawBody } from './body'
import { PaymentProviderError, WebhookVerificationError } from './errors'
import { type JsonRecord, numeric, record, records, text } from './json'
import type {
  PaymentCustomer,
  PaymentEvent,
  PaymentEventKind,
  PaymentLineItem,
  PaymentRefund,
  PaymentWebhookBaseOptions,
} from './types'
import { deliverPayment, respondToWebhook, type WebhookHandler } from './webhook'

export const BARION_LIVE_API_URL = 'https://api.barion.com'
export const BARION_SANDBOX_API_URL = 'https://api.test.barion.com'
export const BARION_CARD_METHOD = 'bankkártya'
export const BARION_WALLET_METHOD = 'Barion'
export const BARION_TRANSFER_METHOD = 'átutalás'

const PAYMENT_ID_PATTERN = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i
const AMOUNT_TOLERANCE = 0.005
const SUCCEEDED = 'Succeeded'
const REFUND_TYPES: ReadonlySet<string> = new Set([
  'Refund',
  'RefundToBankCard',
  'RefundToBankAccount',
])
const NON_SALE_TYPES: ReadonlySet<string> = new Set([
  'Commission',
  'Storno',
  'StornoReserve',
  'TransferBack',
  'StornoUnSuccessfulRefundToBankCard',
  'StornoUnSuccessfulRefundToBankAccount',
  'UnderReview',
  'ReleaseReview',
])
const FAILED_STATUSES: ReadonlySet<string> = new Set(['Canceled', 'Failed', 'Expired'])
const CARD_SOURCES: ReadonlySet<string> = new Set(['Bankcard', 'ApplePay', 'GooglePay'])

export interface BarionApiOptions {
  readonly posKey: string
  readonly sandbox?: boolean | undefined
  readonly apiUrl?: string | undefined
  readonly fetch?: typeof globalThis.fetch | undefined
}

function apiBase(options: Pick<BarionApiOptions, 'sandbox' | 'apiUrl'>): string {
  const base = options.apiUrl ?? (options.sandbox ? BARION_SANDBOX_API_URL : BARION_LIVE_API_URL)
  return base.replace(/\/+$/, '')
}

function barionErrors(json: JsonRecord | undefined): string[] {
  return records(json?.Errors).map(
    (error) =>
      [text(error.ErrorCode), text(error.Title), text(error.Description)]
        .filter(Boolean)
        .join(': ') || 'ismeretlen hiba',
  )
}

export async function fetchBarionPaymentState(
  paymentId: string,
  options: BarionApiOptions,
): Promise<JsonRecord> {
  const fetchImpl = options.fetch ?? globalThis.fetch
  const url = `${apiBase(options)}/v4/Payment/${encodeURIComponent(paymentId)}/PaymentState`
  let response: Response
  try {
    response = await fetchImpl(url, {
      headers: { 'x-pos-key': options.posKey, accept: 'application/json' },
    })
  } catch (error) {
    throw new PaymentProviderError(
      'barion',
      'A Barion PaymentState lekérése nem sikerült.',
      undefined,
      error,
    )
  }
  const json = record(await response.json().catch(() => undefined))
  const errors = barionErrors(json)
  if (!response.ok || errors.length > 0 || !json) {
    const detail = errors.length > 0 ? `: ${errors.join('; ')}` : ''
    throw new PaymentProviderError(
      'barion',
      `A Barion PaymentState lekérése nem sikerült (HTTP ${response.status})${detail}.`,
      response.status,
    )
  }
  return json
}

function paymentIdFromBody(body: string, contentType: string | null): string | undefined {
  const trimmed = body.trim()
  if (trimmed === '') return undefined
  if (contentType?.includes('json') || trimmed.startsWith('{')) {
    try {
      const json = record(JSON.parse(trimmed))
      return text(json?.paymentId) ?? text(json?.PaymentId)
    } catch {
      return undefined
    }
  }
  const form = new URLSearchParams(trimmed)
  return text(form.get('paymentId')) ?? text(form.get('PaymentId'))
}

export function barionPaymentId(
  url: string | URL,
  body = '',
  contentType: string | null = null,
): string | undefined {
  const params = new URL(url).searchParams
  return (
    text(params.get('paymentId')) ??
    text(params.get('PaymentId')) ??
    paymentIdFromBody(body, contentType)
  )
}

function normalizeId(value: string): string {
  return value.replace(/-/g, '').toLowerCase()
}

function isSaleTransaction(transaction: JsonRecord): boolean {
  const type = text(transaction.TransactionType) ?? ''
  return (
    text(transaction.POSTransactionId) !== undefined &&
    !REFUND_TYPES.has(type) &&
    !NON_SALE_TYPES.has(type) &&
    !type.includes('Fee')
  )
}

function isSucceededRefund(transaction: JsonRecord): boolean {
  return (
    REFUND_TYPES.has(text(transaction.TransactionType) ?? '') &&
    text(transaction.Status) === SUCCEEDED
  )
}

function itemsOf(sales: readonly JsonRecord[]): PaymentLineItem[] | undefined {
  const items = sales.flatMap((transaction) =>
    records(transaction.Items).map((item) => {
      const total = numeric(item.ItemTotal)
      if (total === undefined) {
        throw new PaymentProviderError('barion', 'A Barion tételből hiányzik az ItemTotal.')
      }
      return {
        name: text(item.Name) ?? text(item.Description) ?? 'Tétel',
        quantity: numeric(item.Quantity) ?? 1,
        totalGross: total,
        unit: text(item.Unit),
        sku: text(item.SKU),
      }
    }),
  )
  return items.length > 0 ? items : undefined
}

function payerName(payer: JsonRecord | undefined): string | undefined {
  const name = record(payer?.Name)
  const organization = text(name?.OrganizationName)
  if (organization) return organization
  const parts = [text(name?.LastName), text(name?.FirstName)].filter(Boolean)
  return parts.length > 0 ? parts.join(' ') : text(name?.LoginName)
}

function customerOf(transactions: readonly JsonRecord[]): PaymentCustomer | undefined {
  const payer = transactions.map((transaction) => record(transaction.Payer)).find(Boolean)
  if (!payer) return undefined
  const organization = text(record(payer.Name)?.OrganizationName)
  return {
    name: payerName(payer),
    email: text(payer.Email),
    phone: text(payer.PhoneNumber),
    isBusiness: organization ? true : undefined,
  }
}

function methodOf(state: JsonRecord, configured: string | undefined): string {
  if (configured) return configured
  const source = text(state.FundingSource) ?? ''
  if (CARD_SOURCES.has(source)) return BARION_CARD_METHOD
  if (source === 'BankTransfer') return BARION_TRANSFER_METHOD
  return BARION_WALLET_METHOD
}

function sum(values: readonly number[]): number {
  return roundMoney(
    values.reduce((total, value) => total + value, 0),
    2,
  )
}

function kindOf(
  status: string | undefined,
  paidTotal: number | undefined,
  refunds: readonly JsonRecord[],
): PaymentEventKind {
  if (refunds.length > 0) {
    const refunded = sum(refunds.map((refund) => Math.abs(numeric(refund.Total) ?? 0)))
    const complete = paidTotal !== undefined && Math.abs(refunded - paidTotal) <= AMOUNT_TOLERANCE
    return refunds.length === 1 && complete ? 'refunded' : 'partially-refunded'
  }
  if (status === SUCCEEDED) return 'paid'
  if (status && FAILED_STATUSES.has(status)) return 'failed'
  return 'other'
}

function refundsOf(
  refunds: readonly JsonRecord[],
  currency: string | undefined,
): PaymentRefund[] | undefined {
  if (!currency || refunds.length === 0) return undefined
  const ordered = refunds
    .map((refund) => ({
      id: text(refund.TransactionId) ?? text(refund.POSTransactionId),
      value: Math.abs(numeric(refund.Total) ?? 0),
      createdAt: text(refund.TransactionTime),
    }))
    .filter((refund): refund is { id: string; value: number; createdAt: string | undefined } =>
      Boolean(refund.id),
    )
    .sort(
      (a, b) => (a.createdAt ?? '').localeCompare(b.createdAt ?? '') || a.id.localeCompare(b.id),
    )
  if (ordered.length !== refunds.length) return undefined
  let before = 0
  return ordered.map((refund) => {
    const entry: PaymentRefund = {
      id: refund.id,
      amount: { value: refund.value, currency: normalizeCurrency(currency) },
      refundedBefore: before,
      createdAt: refund.createdAt,
    }
    before = sum([before, refund.value])
    return entry
  })
}

export interface BarionPaymentOptions {
  readonly method?: string | undefined
}

export function barionPaymentEvent(
  state: JsonRecord,
  options: BarionPaymentOptions = {},
): PaymentEvent {
  const paymentId = text(state.PaymentId)
  if (!paymentId) {
    throw new PaymentProviderError(
      'barion',
      'A Barion PaymentState válaszából hiányzik a PaymentId.',
    )
  }
  const transactions = records(state.Transactions)
  const sales = transactions.filter(
    (transaction) => isSaleTransaction(transaction) && text(transaction.Status) === SUCCEEDED,
  )
  const refunds = transactions.filter(isSucceededRefund)
  const currency = text(state.Currency)
  const total =
    sales.length > 0 ? sum(sales.map((sale) => numeric(sale.Total) ?? 0)) : numeric(state.Total)
  const status = text(state.Status)
  const kind = kindOf(status, total, refunds)
  const refunded = sum(refunds.map((refund) => Math.abs(numeric(refund.Total) ?? 0)))
  return {
    provider: 'barion',
    kind,
    id: paymentId,
    eventId: `${paymentId}:${status ?? 'unknown'}:${refunds.length}`,
    eventType: status,
    orderRef: text(state.OrderNumber) ?? text(state.PaymentRequestId),
    amount:
      total !== undefined && currency
        ? { value: total, currency: normalizeCurrency(currency) }
        : undefined,
    refundedAmount:
      refunds.length > 0 && currency
        ? { value: refunded, currency: normalizeCurrency(currency) }
        : undefined,
    refunds: refundsOf(refunds, currency),
    paidAt: text(state.CompletedAt),
    method: methodOf(state, options.method),
    customer: customerOf(sales.length > 0 ? sales : transactions),
    items: itemsOf(sales),
    raw: state,
  }
}

export interface BarionWebhookOptions extends PaymentWebhookBaseOptions {
  readonly posKey: string
  readonly sandbox?: boolean | undefined
  readonly apiUrl?: string | undefined
}

export function barionWebhook(options: BarionWebhookOptions): WebhookHandler {
  const posKey = options.posKey?.trim()
  if (!posKey) throw new TypeError('Add meg a Barion POSKey-t (posKey).')
  return (request) =>
    respondToWebhook(options, async () => {
      const body = await readRawBody(request, 'barion', options.maxBodyBytes)
      const paymentId = barionPaymentId(request.url, body, request.headers.get('content-type'))
      if (!paymentId || !PAYMENT_ID_PATTERN.test(paymentId)) {
        throw new WebhookVerificationError(
          'barion',
          'invalid_payload',
          'A Barion callbackből hiányzik az érvényes paymentId.',
        )
      }
      const state = await fetchBarionPaymentState(paymentId, {
        posKey,
        sandbox: options.sandbox,
        apiUrl: options.apiUrl,
        fetch: options.fetch,
      })
      const returnedId = text(state.PaymentId)
      if (!returnedId || normalizeId(returnedId) !== normalizeId(paymentId)) {
        throw new PaymentProviderError(
          'barion',
          `A Barion más fizetést adott vissza (${returnedId ?? '?'}) a kért ${paymentId} helyett.`,
        )
      }
      await deliverPayment(options, barionPaymentEvent(state, { method: options.method }))
      return plainResponse(200, 'OK')
    })
}
