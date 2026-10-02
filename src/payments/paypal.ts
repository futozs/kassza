import { bytesToBase64, encodeUtf8 } from '../core/binary'
import { roundMoney } from '../money/rounding'
import { normalizeCurrency, parseDecimalAmount } from './amounts'
import { parseJsonObject, plainResponse, readRawBody } from './body'
import { PaymentProviderError, WebhookVerificationError } from './errors'
import { type JsonRecord, numeric, path, record, records, text } from './json'
import type {
  PaymentAddress,
  PaymentAmount,
  PaymentCustomer,
  PaymentEvent,
  PaymentEventKind,
  PaymentLineItem,
  PaymentWebhookBaseOptions,
} from './types'
import { respondToWebhook, type WebhookHandler } from './webhook'

export const PAYPAL_LIVE_API_URL = 'https://api-m.paypal.com'
export const PAYPAL_SANDBOX_API_URL = 'https://api-m.sandbox.paypal.com'
export const PAYPAL_METHOD = 'PayPal'
export const PAYPAL_SHIPPING_ITEM_NAME = 'Szállítási díj'
export const PAYPAL_HANDLING_ITEM_NAME = 'Kezelési díj'
export const PAYPAL_INSURANCE_ITEM_NAME = 'Biztosítás'

const TOKEN_REFRESH_MARGIN_MS = 60_000
const AMOUNT_TOLERANCE = 0.005
const UNAUTHORIZED = 401
const TRANSMISSION_HEADERS = {
  authAlgo: 'paypal-auth-algo',
  certUrl: 'paypal-cert-url',
  transmissionId: 'paypal-transmission-id',
  transmissionSig: 'paypal-transmission-sig',
  transmissionTime: 'paypal-transmission-time',
} as const

export interface PayPalApiOptions {
  readonly clientId: string
  readonly clientSecret: string
  readonly sandbox?: boolean | undefined
  readonly apiUrl?: string | undefined
  readonly fetch?: typeof globalThis.fetch | undefined
  readonly now?: (() => number) | undefined
}

export interface PayPalApi {
  get(pathname: string): Promise<JsonRecord>
  post(pathname: string, body: string): Promise<JsonRecord>
}

interface CachedToken {
  readonly value: string
  readonly expiresAt: number
}

function apiBase(options: Pick<PayPalApiOptions, 'sandbox' | 'apiUrl'>): string {
  const base = options.apiUrl ?? (options.sandbox ? PAYPAL_SANDBOX_API_URL : PAYPAL_LIVE_API_URL)
  return base.replace(/\/+$/, '')
}

async function readJson(response: Response, what: string): Promise<JsonRecord> {
  const json = record(await response.json().catch(() => undefined))
  if (!response.ok || !json) {
    const detail = text(json?.message) ?? text(json?.error_description) ?? text(json?.name)
    throw new PaymentProviderError(
      'paypal',
      `A PayPal ${what} nem sikerült (HTTP ${response.status})${detail ? `: ${detail}` : ''}.`,
      response.status,
    )
  }
  return json
}

export function payPalApi(options: PayPalApiOptions): PayPalApi {
  const clientId = options.clientId?.trim()
  const clientSecret = options.clientSecret?.trim()
  if (!clientId || !clientSecret) {
    throw new TypeError('Add meg a PayPal REST alkalmazás clientId és clientSecret adatát.')
  }
  const fetchImpl = options.fetch ?? globalThis.fetch
  const base = apiBase(options)
  const now = options.now ?? Date.now
  let cached: CachedToken | undefined

  async function fetchOrThrow(url: string, init: RequestInit, what: string): Promise<Response> {
    try {
      return await fetchImpl(url, init)
    } catch (error) {
      throw new PaymentProviderError('paypal', `A PayPal ${what} nem sikerült.`, undefined, error)
    }
  }

  async function token(): Promise<string> {
    if (cached && cached.expiresAt > now()) return cached.value
    const credentials = bytesToBase64(encodeUtf8(`${clientId}:${clientSecret}`))
    const response = await fetchOrThrow(
      `${base}/v1/oauth2/token`,
      {
        method: 'POST',
        headers: {
          authorization: `Basic ${credentials}`,
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: 'grant_type=client_credentials',
      },
      'hozzáférési token kérése',
    )
    const json = await readJson(response, 'hozzáférési token kérése')
    const value = text(json.access_token)
    if (!value) {
      throw new PaymentProviderError(
        'paypal',
        'A PayPal token válaszából hiányzik az access_token.',
      )
    }
    const lifetimeMs = (numeric(json.expires_in) ?? 0) * 1000
    cached = { value, expiresAt: now() + Math.max(0, lifetimeMs - TOKEN_REFRESH_MARGIN_MS) }
    return value
  }

  async function send(
    method: 'GET' | 'POST',
    pathname: string,
    body?: string,
  ): Promise<JsonRecord> {
    const what = `${method} ${pathname} hívás`
    const attempt = async (): Promise<Response> =>
      fetchOrThrow(
        `${base}${pathname}`,
        {
          method,
          headers: {
            authorization: `Bearer ${await token()}`,
            accept: 'application/json',
            ...(body === undefined ? {} : { 'content-type': 'application/json' }),
          },
          ...(body === undefined ? {} : { body }),
        },
        what,
      )
    let response = await attempt()
    if (response.status === UNAUTHORIZED) {
      cached = undefined
      response = await attempt()
    }
    return readJson(response, what)
  }

  return {
    get: (pathname) => send('GET', pathname),
    post: (pathname, body) => send('POST', pathname, body),
  }
}

export interface PayPalTransmission {
  readonly authAlgo: string
  readonly certUrl: string
  readonly transmissionId: string
  readonly transmissionSig: string
  readonly transmissionTime: string
}

export function payPalTransmission(headers: Headers): PayPalTransmission | undefined {
  const authAlgo = headers.get(TRANSMISSION_HEADERS.authAlgo)?.trim()
  const certUrl = headers.get(TRANSMISSION_HEADERS.certUrl)?.trim()
  const transmissionId = headers.get(TRANSMISSION_HEADERS.transmissionId)?.trim()
  const transmissionSig = headers.get(TRANSMISSION_HEADERS.transmissionSig)?.trim()
  const transmissionTime = headers.get(TRANSMISSION_HEADERS.transmissionTime)?.trim()
  if (!authAlgo || !certUrl || !transmissionId || !transmissionSig || !transmissionTime) {
    return undefined
  }
  return { authAlgo, certUrl, transmissionId, transmissionSig, transmissionTime }
}

export async function verifyPayPalWebhook(
  payload: string,
  headers: Headers,
  webhookId: string,
  api: PayPalApi,
): Promise<void> {
  const transmission = payPalTransmission(headers)
  if (!transmission) {
    throw new WebhookVerificationError(
      'paypal',
      'missing_signature',
      'Hiányoznak a PayPal webhook PAYPAL-TRANSMISSION-* és PAYPAL-AUTH-ALGO fejlécei.',
    )
  }
  parseJsonObject('paypal', payload)
  const body = [
    `{"auth_algo":${JSON.stringify(transmission.authAlgo)}`,
    `"cert_url":${JSON.stringify(transmission.certUrl)}`,
    `"transmission_id":${JSON.stringify(transmission.transmissionId)}`,
    `"transmission_sig":${JSON.stringify(transmission.transmissionSig)}`,
    `"transmission_time":${JSON.stringify(transmission.transmissionTime)}`,
    `"webhook_id":${JSON.stringify(webhookId)}`,
    `"webhook_event":${payload.trim()}}`,
  ].join(',')
  const result = await api.post('/v1/notifications/verify-webhook-signature', body)
  if (text(result.verification_status) !== 'SUCCESS') {
    throw new WebhookVerificationError(
      'paypal',
      'invalid_signature',
      'A PayPal szerint a webhook aláírása érvénytelen.',
    )
  }
}

export interface PayPalEvent {
  readonly id: string
  readonly eventType: string
  readonly resourceType?: string | undefined
  readonly createTime?: string | undefined
  readonly resource: JsonRecord
  readonly raw: JsonRecord
}

export function parsePayPalEvent(payload: string): PayPalEvent {
  const json = parseJsonObject('paypal', payload)
  const id = text(json.id)
  const eventType = text(json.event_type)
  const resource = record(json.resource)
  if (!id || !eventType || !resource) {
    throw new WebhookVerificationError(
      'paypal',
      'invalid_payload',
      'A PayPal eseményből hiányzik az id, az event_type vagy a resource.',
    )
  }
  return {
    id,
    eventType,
    resourceType: text(json.resource_type),
    createTime: text(json.create_time),
    resource,
    raw: json,
  }
}

function moneyValue(value: unknown): number | undefined {
  const amount = text(record(value)?.value)
  return amount === undefined ? undefined : parseDecimalAmount(amount)
}

function moneyOf(value: unknown): PaymentAmount | undefined {
  const amount = moneyValue(value)
  const currency = text(record(value)?.currency_code)
  if (amount === undefined || !currency) return undefined
  return { value: amount, currency: normalizeCurrency(currency) }
}

export function payPalCaptureIdOfRefund(refund: JsonRecord): string | undefined {
  const up = records(refund.links).find((link) => text(link.rel) === 'up')
  const href = text(up?.href)
  if (!href) return undefined
  const match = /\/captures\/([^/?#]+)/.exec(href)
  return match?.[1] ? decodeURIComponent(match[1]) : undefined
}

export function payPalOrderIdOfCapture(capture: JsonRecord): string | undefined {
  return text(path(capture, 'supplementary_data', 'related_ids', 'order_id'))
}

function addressOf(address: JsonRecord | undefined): PaymentAddress | undefined {
  if (!address) return undefined
  return {
    country: text(address.country_code),
    zip: text(address.postal_code),
    city: text(address.admin_area_2),
    line1: text(address.address_line_1),
    line2: text(address.address_line_2),
  }
}

function personName(name: JsonRecord | undefined, country: string | undefined): string | undefined {
  const full = text(name?.full_name)
  if (full) return full
  const given = text(name?.given_name)
  const surname = text(name?.surname)
  const parts = country === 'HU' ? [surname, given] : [given, surname]
  const joined = parts.filter(Boolean).join(' ')
  return joined === '' ? undefined : joined
}

function customerOf(order: JsonRecord | undefined): PaymentCustomer | undefined {
  if (!order) return undefined
  const payer = record(order.payer)
  const shipping = record(records(order.purchase_units)[0]?.shipping)
  const payerAddress = addressOf(record(payer?.address))
  const shippingAddress = addressOf(record(shipping?.address))
  const address = payerAddress?.line1 ? payerAddress : (shippingAddress ?? payerAddress)
  const name =
    personName(record(payer?.name), address?.country) ?? text(path(shipping, 'name', 'full_name'))
  const email = text(payer?.email_address)
  if (!name && !email && !address) return undefined
  return {
    name,
    email,
    phone: text(path(payer, 'phone', 'phone_number', 'national_number')),
    address,
  }
}

function sameCurrency(values: readonly unknown[], currency: string): boolean {
  return values.every((value) => {
    const code = text(record(value)?.currency_code)
    return code === undefined || normalizeCurrency(code) === currency
  })
}

function extraItem(value: unknown, name: string): PaymentLineItem[] {
  const amount = moneyValue(value) ?? 0
  return amount > 0 ? [{ name, quantity: 1, totalGross: amount }] : []
}

function itemsOf(
  order: JsonRecord | undefined,
  currency: string | undefined,
): PaymentLineItem[] | undefined {
  const units = records(order?.purchase_units)
  const unit = units[0]
  if (!unit || units.length !== 1 || !currency) return undefined
  const breakdown = record(path(unit, 'amount', 'breakdown'))
  const discount =
    (moneyValue(breakdown?.discount) ?? 0) + (moneyValue(breakdown?.shipping_discount) ?? 0)
  const items = records(unit.items)
  if (discount > 0 || items.length === 0) return undefined
  const taxTotal = moneyValue(breakdown?.tax_total) ?? 0
  if (taxTotal > 0 && !items.every((item) => record(item.tax))) return undefined
  const moneys = [
    ...items.flatMap((item) => [item.unit_amount, item.tax]),
    breakdown?.shipping,
    breakdown?.handling,
    breakdown?.insurance,
  ]
  if (!sameCurrency(moneys, currency)) return undefined
  const lines = items.map((item) => {
    const quantity = numeric(item.quantity) ?? 1
    const unitGross = (moneyValue(item.unit_amount) ?? 0) + (moneyValue(item.tax) ?? 0)
    return {
      name: text(item.name) ?? 'Tétel',
      quantity,
      totalGross: roundMoney(unitGross * quantity, 2),
      sku: text(item.sku),
    }
  })
  return [
    ...lines,
    ...extraItem(breakdown?.shipping, PAYPAL_SHIPPING_ITEM_NAME),
    ...extraItem(breakdown?.handling, PAYPAL_HANDLING_ITEM_NAME),
    ...extraItem(breakdown?.insurance, PAYPAL_INSURANCE_ITEM_NAME),
  ]
}

function orderRefOf(resource: JsonRecord, order: JsonRecord | undefined): string | undefined {
  const unit = records(order?.purchase_units)[0]
  return (
    text(resource.custom_id) ??
    text(resource.invoice_id) ??
    text(unit?.custom_id) ??
    text(unit?.invoice_id) ??
    text(unit?.reference_id)
  )
}

export interface PayPalPaymentOptions {
  readonly method?: string | undefined
  readonly order?: JsonRecord | undefined
  readonly capture?: JsonRecord | undefined
}

function fromCapture(
  event: PayPalEvent,
  kind: PaymentEventKind,
  options: PayPalPaymentOptions,
): PaymentEvent {
  const capture = event.resource
  const id = text(capture.id)
  if (!id) throw new PaymentProviderError('paypal', 'A PayPal capture eseményből hiányzik az id.')
  const amount = moneyOf(capture.amount)
  const status = text(capture.status)
  return {
    provider: 'paypal',
    kind: kind === 'paid' && status !== undefined && status !== 'COMPLETED' ? 'other' : kind,
    id,
    eventId: event.id,
    eventType: event.eventType,
    orderRef: orderRefOf(capture, options.order),
    amount,
    paidAt: text(capture.create_time) ?? event.createTime,
    method: options.method ?? PAYPAL_METHOD,
    customer: customerOf(options.order),
    items: kind === 'paid' ? itemsOf(options.order, amount?.currency) : undefined,
    raw: event.raw,
  }
}

function refundKind(refund: JsonRecord, capture: JsonRecord | undefined): PaymentEventKind {
  if (text(refund.status) !== 'COMPLETED') return 'other'
  const refunded = moneyValue(refund.amount)
  const captured = moneyValue(capture?.amount)
  if (refunded === undefined || captured === undefined) return 'partially-refunded'
  return Math.abs(refunded - captured) <= AMOUNT_TOLERANCE ? 'refunded' : 'partially-refunded'
}

function fromRefund(event: PayPalEvent, options: PayPalPaymentOptions): PaymentEvent {
  const refund = event.resource
  const captureId = payPalCaptureIdOfRefund(refund)
  if (!captureId) {
    throw new PaymentProviderError(
      'paypal',
      'A PayPal visszatérítésből nem olvasható ki az eredeti capture azonosítója.',
    )
  }
  const capture =
    options.capture && text(options.capture.id) === captureId ? options.capture : undefined
  return {
    provider: 'paypal',
    kind: refundKind(refund, capture),
    id: captureId,
    eventId: event.id,
    eventType: event.eventType,
    orderRef:
      orderRefOf(refund, undefined) ?? (capture ? orderRefOf(capture, undefined) : undefined),
    amount: moneyOf(capture?.amount),
    refundedAmount:
      moneyOf(path(refund, 'seller_payable_breakdown', 'total_refunded_amount')) ??
      moneyOf(refund.amount),
    paidAt: text(refund.create_time) ?? event.createTime,
    method: options.method ?? PAYPAL_METHOD,
    raw: event.raw,
  }
}

export function payPalPaymentEvent(
  event: PayPalEvent,
  options: PayPalPaymentOptions = {},
): PaymentEvent | undefined {
  switch (event.eventType) {
    case 'PAYMENT.CAPTURE.COMPLETED':
      return fromCapture(event, 'paid', options)
    case 'PAYMENT.CAPTURE.DENIED':
    case 'PAYMENT.CAPTURE.DECLINED':
      return fromCapture(event, 'failed', options)
    case 'PAYMENT.CAPTURE.PENDING':
      return fromCapture(event, 'other', options)
    case 'PAYMENT.CAPTURE.REFUNDED':
      return fromRefund(event, options)
    default:
      return undefined
  }
}

export interface PayPalWebhookOptions extends PaymentWebhookBaseOptions {
  readonly webhookId: string
  readonly clientId: string
  readonly clientSecret: string
  readonly sandbox?: boolean | undefined
  readonly apiUrl?: string | undefined
  readonly fetchOrder?: boolean | undefined
}

async function loadExtras(
  event: PayPalEvent,
  api: PayPalApi,
  options: PayPalWebhookOptions,
): Promise<Pick<PayPalPaymentOptions, 'order' | 'capture'>> {
  if (event.eventType === 'PAYMENT.CAPTURE.REFUNDED') {
    const captureId = payPalCaptureIdOfRefund(event.resource)
    if (!captureId) return {}
    return { capture: await api.get(`/v2/payments/captures/${encodeURIComponent(captureId)}`) }
  }
  if (event.eventType !== 'PAYMENT.CAPTURE.COMPLETED' || options.fetchOrder === false) return {}
  const orderId = payPalOrderIdOfCapture(event.resource)
  if (!orderId) return {}
  return { order: await api.get(`/v2/checkout/orders/${encodeURIComponent(orderId)}`) }
}

export function payPalWebhook(options: PayPalWebhookOptions): WebhookHandler {
  const webhookId = options.webhookId?.trim()
  if (!webhookId) throw new TypeError('Add meg a PayPal webhook azonosítóját (webhookId).')
  const api = payPalApi({
    clientId: options.clientId,
    clientSecret: options.clientSecret,
    sandbox: options.sandbox,
    apiUrl: options.apiUrl,
    fetch: options.fetch,
  })
  return (request) =>
    respondToWebhook(options, async () => {
      const payload = await readRawBody(request, 'paypal', options.maxBodyBytes)
      await verifyPayPalWebhook(payload, request.headers, webhookId, api)
      const event = parsePayPalEvent(payload)
      const extras = await loadExtras(event, api, options)
      const payment = payPalPaymentEvent(event, { method: options.method, ...extras })
      if (payment) await options.onPayment(payment)
      return plainResponse(200, 'OK')
    })
}
