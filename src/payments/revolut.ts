import { hmacHex, timingSafeEqual } from '../core/crypto'
import { fromMinorUnits, normalizeCurrency } from './amounts'
import { parseJsonObject, readRawBody } from './body'
import { PaymentProviderError, WebhookVerificationError } from './errors'
import { type JsonRecord, numeric, path, record, records, text } from './json'
import type {
  PaymentAddress,
  PaymentAmount,
  PaymentCustomer,
  PaymentEvent,
  PaymentEventKind,
  PaymentLineItem,
  PaymentRefund,
  PaymentWebhookBaseOptions,
} from './types'
import { deliverPayment, respondToWebhook, type WebhookHandler } from './webhook'

export const REVOLUT_LIVE_API_URL = 'https://merchant.revolut.com'
export const REVOLUT_SANDBOX_API_URL = 'https://sandbox-merchant.revolut.com'
export const REVOLUT_API_VERSION = '2026-08-17'
export const REVOLUT_DEFAULT_TOLERANCE_MS = 300_000
export const REVOLUT_CARD_METHOD = 'bankkártya'
export const REVOLUT_ACCOUNT_METHOD = 'Revolut Pay'
export const REVOLUT_DIRECT_DEBIT_METHOD = 'csoportos beszedés'

const SIGNATURE_VERSION = 'v1'
const ORDER_EVENTS: ReadonlySet<string> = new Set(['ORDER_COMPLETED'])
const FAILED_EVENTS: ReadonlySet<string> = new Set([
  'ORDER_CANCELLED',
  'ORDER_FAILED',
  'ORDER_PAYMENT_DECLINED',
  'ORDER_PAYMENT_FAILED',
])
const OTHER_EVENTS: ReadonlySet<string> = new Set(['ORDER_AUTHORISED'])
const SALE_ORDER_TYPES: ReadonlySet<string> = new Set(['payment', 'payment_request'])

export interface VerifyRevolutSignatureOptions {
  readonly toleranceMs?: number | undefined
  readonly now?: (() => number) | undefined
}

function secretsOf(secret: string | readonly string[]): string[] {
  const list = (typeof secret === 'string' ? [secret] : [...secret]).map((value) => value.trim())
  if (list.length === 0 || list.some((value) => value === '')) {
    throw new TypeError('Add meg a Revolut webhook aláíró titkát (wsk_...).')
  }
  return list
}

function signaturesOf(header: string): string[] {
  return header
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${SIGNATURE_VERSION}=`))
}

export async function verifyRevolutSignature(
  payload: string,
  signatureHeader: string | null | undefined,
  timestampHeader: string | null | undefined,
  secret: string | readonly string[],
  options: VerifyRevolutSignatureOptions = {},
): Promise<void> {
  const secrets = secretsOf(secret)
  const signatures = signatureHeader ? signaturesOf(signatureHeader) : []
  const timestamp = timestampHeader?.trim()
  if (signatures.length === 0 || !timestamp) {
    throw new WebhookVerificationError(
      'revolut',
      'missing_signature',
      'Hiányzik a Revolut-Signature vagy a Revolut-Request-Timestamp fejléc.',
    )
  }
  if (!/^\d+$/.test(timestamp)) {
    throw new WebhookVerificationError(
      'revolut',
      'invalid_signature',
      'A Revolut-Request-Timestamp fejléc nem ezredmásodperces UNIX időbélyeg.',
    )
  }
  const tolerance = options.toleranceMs ?? REVOLUT_DEFAULT_TOLERANCE_MS
  const now = options.now?.() ?? Date.now()
  if (tolerance > 0 && Math.abs(now - Number(timestamp)) > tolerance) {
    throw new WebhookVerificationError(
      'revolut',
      'timestamp_out_of_range',
      `A Revolut esemény időbélyege több mint ${Math.round(tolerance / 1000)} másodperccel eltér.`,
    )
  }
  const message = `${SIGNATURE_VERSION}.${timestamp}.${payload}`
  for (const key of secrets) {
    const expected = `${SIGNATURE_VERSION}=${await hmacHex('SHA-256', key, message)}`
    if (signatures.some((signature) => timingSafeEqual(signature, expected))) return
  }
  throw new WebhookVerificationError(
    'revolut',
    'invalid_signature',
    'A Revolut aláírás nem egyezik.',
  )
}

export interface RevolutEvent {
  readonly event: string
  readonly orderId?: string | undefined
  readonly merchantOrderRef?: string | undefined
  readonly raw: JsonRecord
}

export function parseRevolutEvent(payload: string): RevolutEvent {
  const json = parseJsonObject('revolut', payload)
  const event = text(json.event)
  if (!event) {
    throw new WebhookVerificationError(
      'revolut',
      'invalid_payload',
      'A Revolut eseményből hiányzik az event mező.',
    )
  }
  return {
    event,
    orderId: text(json.order_id),
    merchantOrderRef: text(json.merchant_order_ext_ref),
    raw: json,
  }
}

export interface RevolutApiOptions {
  readonly apiKey: string
  readonly sandbox?: boolean | undefined
  readonly apiUrl?: string | undefined
  readonly apiVersion?: string | undefined
  readonly fetch?: typeof globalThis.fetch | undefined
}

function apiBase(options: Pick<RevolutApiOptions, 'sandbox' | 'apiUrl'>): string {
  const base = options.apiUrl ?? (options.sandbox ? REVOLUT_SANDBOX_API_URL : REVOLUT_LIVE_API_URL)
  return base.replace(/\/+$/, '')
}

export async function fetchRevolutOrder(
  orderId: string,
  options: RevolutApiOptions,
): Promise<JsonRecord> {
  const fetchImpl = options.fetch ?? globalThis.fetch
  let response: Response
  try {
    response = await fetchImpl(`${apiBase(options)}/api/orders/${encodeURIComponent(orderId)}`, {
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        'revolut-api-version': options.apiVersion ?? REVOLUT_API_VERSION,
        accept: 'application/json',
      },
    })
  } catch (error) {
    throw new PaymentProviderError(
      'revolut',
      'A Revolut rendelés lekérése nem sikerült.',
      undefined,
      error,
    )
  }
  if (!response.ok) {
    throw new PaymentProviderError(
      'revolut',
      `A Revolut rendelés lekérése nem sikerült (HTTP ${response.status}).`,
      response.status,
    )
  }
  const order = record(await response.json().catch(() => undefined))
  if (!order || text(order.id) === undefined) {
    throw new PaymentProviderError('revolut', 'A Revolut rendelés válasza nem értelmezhető.')
  }
  return order
}

function amountOf(order: JsonRecord, key: string): PaymentAmount | undefined {
  const minor = numeric(order[key])
  const currency = text(order.currency)
  if (minor === undefined || !currency) return undefined
  return {
    value: fromMinorUnits(minor, currency, 'iso4217'),
    currency: normalizeCurrency(currency),
  }
}

function addressOf(address: JsonRecord | undefined): PaymentAddress | undefined {
  if (!address) return undefined
  return {
    country: text(address.country_code),
    zip: text(address.postcode),
    city: text(address.city),
    line1: text(address.street_line_1),
    line2: text(address.street_line_2),
  }
}

function completedPayment(order: JsonRecord): JsonRecord | undefined {
  const payments = records(order.payments)
  return (
    payments.find((payment) => ['completed', 'captured'].includes(text(payment.state) ?? '')) ??
    payments.at(-1)
  )
}

function customerOf(order: JsonRecord): PaymentCustomer | undefined {
  const customer = record(order.customer)
  const payment = completedPayment(order)
  const shipping = record(order.shipping)
  const contact = record(shipping?.contact)
  const address =
    addressOf(record(payment?.billing_address)) ?? addressOf(record(shipping?.address))
  const name = text(customer?.full_name) ?? text(contact?.name)
  const email = text(customer?.email) ?? text(contact?.email)
  if (!name && !email && !address) return undefined
  return {
    name,
    email,
    phone: text(customer?.phone) ?? text(contact?.phone),
    address,
  }
}

function itemsOf(order: JsonRecord): PaymentLineItem[] | undefined {
  const currency = text(order.currency)
  if (!currency) return undefined
  const items = records(order.line_items).map((item) => {
    const total = numeric(item.total_amount)
    if (total === undefined) {
      throw new PaymentProviderError('revolut', 'A Revolut tételből hiányzik a total_amount.')
    }
    return {
      name: text(item.name) ?? 'Tétel',
      quantity: numeric(path(item, 'quantity', 'value')) ?? 1,
      totalGross: fromMinorUnits(total, currency, 'iso4217'),
      unit: text(path(item, 'quantity', 'unit')),
      sku: text(item.external_id),
    }
  })
  return items.length > 0 ? items : undefined
}

function methodOf(order: JsonRecord, configured: string | undefined): string {
  if (configured) return configured
  const type = text(path(completedPayment(order), 'payment_method', 'type'))
  if (type === 'revolut_pay_account' || type === 'revolut_pay') return REVOLUT_ACCOUNT_METHOD
  if (type === 'sepa_direct_debit') return REVOLUT_DIRECT_DEBIT_METHOD
  return REVOLUT_CARD_METHOD
}

function orderRefOf(order: JsonRecord, event: RevolutEvent): string | undefined {
  return text(path(order, 'merchant_order_data', 'reference')) ?? event.merchantOrderRef
}

export interface RevolutPaymentOptions {
  readonly method?: string | undefined
  readonly order?: JsonRecord | undefined
  readonly originalOrder?: JsonRecord | undefined
}

function eventBase(
  event: RevolutEvent,
  kind: PaymentEventKind,
  id: string,
  method: string,
): Pick<PaymentEvent, 'provider' | 'kind' | 'id' | 'eventId' | 'eventType' | 'method' | 'raw'> {
  return {
    provider: 'revolut' as const,
    kind,
    id,
    eventId: `${event.event}:${event.orderId ?? id}`,
    eventType: event.event,
    method,
    raw: event.raw,
  }
}

function fromSaleOrder(
  event: RevolutEvent,
  order: JsonRecord,
  options: RevolutPaymentOptions,
): PaymentEvent {
  const id = text(order.id) ?? event.orderId ?? ''
  assertCompleted(order)
  return {
    ...eventBase(event, 'paid', id, methodOf(order, options.method)),
    orderRef: orderRefOf(order, event),
    amount: amountOf(order, 'amount'),
    paidAt: text(order.updated_at),
    customer: customerOf(order),
    items: itemsOf(order),
  }
}

function assertCompleted(order: JsonRecord): void {
  const state = text(order.state)
  if (state !== 'completed') {
    throw new PaymentProviderError(
      'revolut',
      `A(z) ${text(order.id) ?? '?'} Revolut rendelés állapota ${state ?? 'ismeretlen'}, nem completed; a webhook újraküldésekor újra megnézzük.`,
    )
  }
}

function refundKind(refund: JsonRecord, original: JsonRecord): PaymentEventKind {
  const refundAmount = numeric(refund.amount)
  const originalAmount = numeric(original.amount)
  const refundedTotal = numeric(original.refunded_amount)
  const single =
    refundAmount !== undefined && refundAmount === originalAmount && refundedTotal === refundAmount
  return single ? 'refunded' : 'partially-refunded'
}

function revolutRefunds(refund: JsonRecord, original: JsonRecord): PaymentRefund[] | undefined {
  const id = text(refund.id)
  const amount = amountOf(refund, 'amount')
  if (!id || !amount || amount.value <= 0) return undefined
  const total = amountOf(original, 'refunded_amount')
  const before =
    total && total.currency === amount.currency
      ? Math.round((total.value - amount.value) * 100) / 100
      : undefined
  return [
    {
      id,
      amount,
      refundedBefore: before !== undefined && before >= 0 ? before : undefined,
      createdAt: text(refund.updated_at) ?? text(refund.created_at),
    },
  ]
}

function fromRefundOrder(
  event: RevolutEvent,
  refund: JsonRecord,
  options: RevolutPaymentOptions,
): PaymentEvent {
  const original = options.originalOrder
  const originalId = text(refund.related_order_id)
  if (!original || !originalId || text(original.id) !== originalId) {
    throw new PaymentProviderError(
      'revolut',
      'A Revolut visszatérítéshez nem található az eredeti rendelés.',
    )
  }
  assertCompleted(refund)
  return {
    ...eventBase(
      event,
      refundKind(refund, original),
      originalId,
      methodOf(original, options.method),
    ),
    orderRef: orderRefOf(original, event),
    amount: amountOf(original, 'amount'),
    refundedAmount: amountOf(original, 'refunded_amount') ?? amountOf(refund, 'amount'),
    refunds: revolutRefunds(refund, original),
    paidAt: text(refund.updated_at),
    customer: customerOf(original),
  }
}

export function revolutPaymentEvent(
  event: RevolutEvent,
  options: RevolutPaymentOptions = {},
): PaymentEvent | undefined {
  const orderId = event.orderId
  if (!orderId) return undefined
  if (FAILED_EVENTS.has(event.event)) {
    return {
      ...eventBase(event, 'failed', orderId, options.method ?? REVOLUT_CARD_METHOD),
      orderRef: event.merchantOrderRef,
    }
  }
  if (OTHER_EVENTS.has(event.event)) {
    return {
      ...eventBase(event, 'other', orderId, options.method ?? REVOLUT_CARD_METHOD),
      orderRef: event.merchantOrderRef,
    }
  }
  if (!ORDER_EVENTS.has(event.event)) return undefined
  const order = options.order
  if (!order || text(order.id) !== orderId) {
    throw new PaymentProviderError(
      'revolut',
      `A(z) ${event.event} eseményhez le kell kérni a(z) ${orderId} rendelést.`,
    )
  }
  const type = text(order.type) ?? 'payment'
  if (type === 'refund') return fromRefundOrder(event, order, options)
  if (SALE_ORDER_TYPES.has(type)) return fromSaleOrder(event, order, options)
  return {
    ...eventBase(event, 'other', orderId, methodOf(order, options.method)),
    orderRef: orderRefOf(order, event),
  }
}

export interface RevolutWebhookOptions extends PaymentWebhookBaseOptions {
  readonly secret: string | readonly string[]
  readonly apiKey: string
  readonly sandbox?: boolean | undefined
  readonly apiUrl?: string | undefined
  readonly apiVersion?: string | undefined
  readonly toleranceMs?: number | undefined
  readonly now?: (() => number) | undefined
}

async function loadOrders(
  event: RevolutEvent,
  api: RevolutApiOptions,
): Promise<Pick<RevolutPaymentOptions, 'order' | 'originalOrder'>> {
  if (!event.orderId || !ORDER_EVENTS.has(event.event)) return {}
  const order = await fetchRevolutOrder(event.orderId, api)
  const relatedId = text(order.type) === 'refund' ? text(order.related_order_id) : undefined
  if (!relatedId) return { order }
  return { order, originalOrder: await fetchRevolutOrder(relatedId, api) }
}

export function revolutWebhook(options: RevolutWebhookOptions): WebhookHandler {
  secretsOf(options.secret)
  const apiKey = options.apiKey?.trim()
  if (!apiKey) {
    throw new TypeError(
      'Add meg a Revolut titkos API-kulcsot (apiKey): a webhook csak a rendelés azonosítóját küldi.',
    )
  }
  const api: RevolutApiOptions = {
    apiKey,
    sandbox: options.sandbox,
    apiUrl: options.apiUrl,
    apiVersion: options.apiVersion,
    fetch: options.fetch,
  }
  return (request) =>
    respondToWebhook(options, async () => {
      const payload = await readRawBody(request, 'revolut', options.maxBodyBytes)
      await verifyRevolutSignature(
        payload,
        request.headers.get('revolut-signature'),
        request.headers.get('revolut-request-timestamp'),
        options.secret,
        { toleranceMs: options.toleranceMs, now: options.now },
      )
      const event = parseRevolutEvent(payload)
      const orders = await loadOrders(event, api)
      const payment = revolutPaymentEvent(event, { method: options.method, ...orders })
      if (payment) await deliverPayment(options, payment)
      return new Response(null, { status: 204 })
    })
}
