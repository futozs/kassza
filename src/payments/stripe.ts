import { hmacHex, timingSafeEqual } from '../core/crypto'
import { fromMinorUnits, normalizeCurrency } from './amounts'
import { parseJsonObject, plainResponse, readRawBody } from './body'
import { PaymentProviderError, WebhookVerificationError } from './errors'
import { type JsonRecord, numeric, path, record, records, text } from './json'
import type {
  PaymentCustomer,
  PaymentEvent,
  PaymentEventKind,
  PaymentLineItem,
  PaymentRefund,
  PaymentWebhookBaseOptions,
} from './types'
import { deliverPayment, respondToWebhook, type WebhookHandler } from './webhook'

export const STRIPE_DEFAULT_TOLERANCE_SECONDS = 300
export const STRIPE_API_URL = 'https://api.stripe.com'
export const STRIPE_DEFAULT_METHOD = 'bankkártya'
export const STRIPE_SHIPPING_ITEM_NAME = 'Szállítási díj'

const PAGE_SIZE = 100
const ORDER_REF_KEYS = ['orderRef', 'order_ref', 'orderId', 'order_id', 'orderNumber', 'order']
const INACTIVE_REFUND_STATUSES: ReadonlySet<string> = new Set(['failed', 'canceled'])

export interface StripeSignatureHeader {
  readonly timestamp: number
  readonly signatures: readonly string[]
}

export function parseStripeSignatureHeader(header: string): StripeSignatureHeader | undefined {
  let timestamp: number | undefined
  const signatures: string[] = []
  for (const part of header.split(',')) {
    const separator = part.indexOf('=')
    if (separator <= 0) continue
    const key = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (key === 't' && /^\d+$/.test(value)) timestamp = Number(value)
    else if (key === 'v1' && value !== '') signatures.push(value)
  }
  if (timestamp === undefined || signatures.length === 0) return undefined
  return { timestamp, signatures }
}

export interface VerifyStripeSignatureOptions {
  readonly toleranceSeconds?: number | undefined
  readonly now?: (() => number) | undefined
}

function secretsOf(secret: string | readonly string[]): string[] {
  const list = (typeof secret === 'string' ? [secret] : [...secret]).map((value) => value.trim())
  if (list.length === 0 || list.some((value) => value === '')) {
    throw new TypeError('Add meg a Stripe webhook titkát (whsec_...).')
  }
  return list
}

export async function verifyStripeSignature(
  payload: string,
  header: string | null | undefined,
  secret: string | readonly string[],
  options: VerifyStripeSignatureOptions = {},
): Promise<void> {
  const secrets = secretsOf(secret)
  if (!header) {
    throw new WebhookVerificationError(
      'stripe',
      'missing_signature',
      'Hiányzik a Stripe-Signature fejléc.',
    )
  }
  const parsed = parseStripeSignatureHeader(header)
  if (!parsed) {
    throw new WebhookVerificationError(
      'stripe',
      'invalid_signature',
      'A Stripe-Signature fejléc formátuma hibás.',
    )
  }
  const tolerance = options.toleranceSeconds ?? STRIPE_DEFAULT_TOLERANCE_SECONDS
  const nowSeconds = Math.floor((options.now?.() ?? Date.now()) / 1000)
  if (tolerance > 0 && nowSeconds - parsed.timestamp > tolerance) {
    throw new WebhookVerificationError(
      'stripe',
      'timestamp_out_of_range',
      `A Stripe esemény időbélyege régebbi ${tolerance} másodpercnél.`,
    )
  }
  for (const key of secrets) {
    const expected = await hmacHex('SHA-256', key, `${parsed.timestamp}.${payload}`)
    if (parsed.signatures.some((signature) => timingSafeEqual(signature, expected))) return
  }
  throw new WebhookVerificationError('stripe', 'invalid_signature', 'A Stripe aláírás nem egyezik.')
}

export interface StripeEvent {
  readonly id: string
  readonly type: string
  readonly created?: number | undefined
  readonly livemode?: boolean | undefined
  readonly object: JsonRecord
  readonly previousAttributes?: JsonRecord | undefined
}

export function parseStripeEvent(payload: string): StripeEvent {
  const json = parseJsonObject('stripe', payload)
  const id = text(json.id)
  const type = text(json.type)
  const object = record(path(json, 'data', 'object'))
  if (!id || !type || !object) {
    throw new WebhookVerificationError(
      'stripe',
      'invalid_payload',
      'A Stripe eseményből hiányzik az id, a type vagy a data.object.',
    )
  }
  return {
    id,
    type,
    created: numeric(json.created),
    livemode: typeof json.livemode === 'boolean' ? json.livemode : undefined,
    object,
    previousAttributes: record(path(json, 'data', 'previous_attributes')),
  }
}

function orderRefOf(object: JsonRecord): string | undefined {
  const metadata = record(object.metadata)
  const fromMetadata = ORDER_REF_KEYS.map((key) => text(metadata?.[key])).find(Boolean)
  return text(object.client_reference_id) ?? fromMetadata
}

function amountOf(object: JsonRecord, key: string): PaymentEvent['amount'] {
  const minor = numeric(object[key])
  const currency = text(object.currency)
  if (minor === undefined || !currency) return undefined
  return {
    value: fromMinorUnits(minor, currency, 'stripe'),
    currency: normalizeCurrency(currency),
  }
}

function customerOf(details: JsonRecord | undefined): PaymentCustomer | undefined {
  if (!details) return undefined
  const address = record(details.address)
  const taxIds = records(details.tax_ids)
  const businessName = text(details.business_name)
  return {
    name: businessName ?? text(details.individual_name) ?? text(details.name),
    email: text(details.email),
    phone: text(details.phone),
    taxNumber: text(taxIds.find((entry) => entry.type === 'hu_tin')?.value),
    euTaxNumber: text(taxIds.find((entry) => entry.type === 'eu_vat')?.value),
    isBusiness: businessName !== undefined || taxIds.length > 0 ? true : undefined,
    address: address && {
      country: text(address.country),
      zip: text(address.postal_code),
      city: text(address.city),
      line1: text(address.line1),
      line2: text(address.line2),
    },
  }
}

function paidAtOf(event: StripeEvent): string | undefined {
  return event.created === undefined ? undefined : new Date(event.created * 1000).toISOString()
}

export interface StripePaymentOptions {
  readonly method?: string | undefined
}

function fromCheckoutSession(
  event: StripeEvent,
  session: JsonRecord,
  kind: PaymentEventKind,
  options: StripePaymentOptions,
): PaymentEvent {
  const paymentIntent = text(session.payment_intent) ?? text(path(session, 'payment_intent', 'id'))
  return {
    provider: 'stripe',
    kind,
    id: paymentIntent ?? text(session.id) ?? event.id,
    eventId: event.id,
    eventType: event.type,
    orderRef: orderRefOf(session),
    amount: amountOf(session, 'amount_total'),
    paidAt: paidAtOf(event),
    method: options.method ?? STRIPE_DEFAULT_METHOD,
    customer: customerOf(record(session.customer_details)),
    raw: event,
  }
}

function fromPaymentIntent(
  event: StripeEvent,
  kind: PaymentEventKind,
  options: StripePaymentOptions,
): PaymentEvent {
  const intent = event.object
  const email = text(intent.receipt_email)
  return {
    provider: 'stripe',
    kind,
    id: text(intent.id) ?? event.id,
    eventId: event.id,
    eventType: event.type,
    orderRef: orderRefOf(intent),
    amount: amountOf(intent, kind === 'paid' ? 'amount_received' : 'amount'),
    paidAt: paidAtOf(event),
    method: options.method ?? STRIPE_DEFAULT_METHOD,
    customer: email ? { email } : undefined,
    raw: event,
  }
}

function refundKind(event: StripeEvent): PaymentEventKind {
  const charge = event.object
  const amount = numeric(charge.amount) ?? 0
  const refunded = numeric(charge.amount_refunded) ?? 0
  const previouslyRefunded = numeric(event.previousAttributes?.amount_refunded) ?? 0
  const fullyRefunded = charge.refunded === true || (amount > 0 && refunded >= amount)
  return fullyRefunded && previouslyRefunded === 0 ? 'refunded' : 'partially-refunded'
}

function refundsOf(event: StripeEvent): PaymentRefund[] | undefined {
  const charge = event.object
  const currency = text(charge.currency)
  const refunded = numeric(charge.amount_refunded)
  const previous = numeric(event.previousAttributes?.amount_refunded)
  if (!currency || refunded === undefined || previous === undefined || refunded <= previous) {
    return undefined
  }
  return [
    {
      id: event.id,
      amount: {
        value: fromMinorUnits(refunded - previous, currency, 'stripe'),
        currency: normalizeCurrency(currency),
      },
      refundedBefore: fromMinorUnits(previous, currency, 'stripe'),
      createdAt: paidAtOf(event),
    },
  ]
}

function fromRefundedCharge(event: StripeEvent, options: StripePaymentOptions): PaymentEvent {
  const charge = event.object
  return {
    provider: 'stripe',
    kind: refundKind(event),
    id: text(charge.payment_intent) ?? text(charge.id) ?? event.id,
    eventId: event.id,
    eventType: event.type,
    orderRef: orderRefOf(charge),
    amount: amountOf(charge, 'amount'),
    refundedAmount: amountOf(charge, 'amount_refunded'),
    refunds: refundsOf(event),
    paidAt: paidAtOf(event),
    method: options.method ?? STRIPE_DEFAULT_METHOD,
    customer: customerOf(record(charge.billing_details)),
    raw: event,
  }
}

export function stripePaymentEvent(
  event: StripeEvent,
  options: StripePaymentOptions = {},
): PaymentEvent | undefined {
  switch (event.type) {
    case 'checkout.session.completed': {
      const status = text(event.object.payment_status)
      if (status === 'paid') return fromCheckoutSession(event, event.object, 'paid', options)
      if (status === 'no_payment_required') {
        return fromCheckoutSession(event, event.object, 'other', options)
      }
      return undefined
    }
    case 'checkout.session.async_payment_succeeded':
      return fromCheckoutSession(event, event.object, 'paid', options)
    case 'checkout.session.async_payment_failed':
      return fromCheckoutSession(event, event.object, 'failed', options)
    case 'payment_intent.succeeded':
      return fromPaymentIntent(event, 'paid', options)
    case 'payment_intent.payment_failed':
      return fromPaymentIntent(event, 'failed', options)
    case 'charge.refunded':
      return fromRefundedCharge(event, options)
    default:
      return undefined
  }
}

export interface StripeApiOptions {
  readonly apiKey: string
  readonly apiUrl?: string | undefined
  readonly fetch?: typeof globalThis.fetch | undefined
}

async function stripeGet(url: URL, options: StripeApiOptions, what: string): Promise<JsonRecord> {
  const fetchImpl = options.fetch ?? globalThis.fetch
  let response: Response
  try {
    response = await fetchImpl(url, { headers: { authorization: `Bearer ${options.apiKey}` } })
  } catch (error) {
    throw new PaymentProviderError(
      'stripe',
      `A Stripe ${what} lekérése nem sikerült.`,
      undefined,
      error,
    )
  }
  if (!response.ok) {
    throw new PaymentProviderError(
      'stripe',
      `A Stripe ${what} lekérése nem sikerült (HTTP ${response.status}).`,
      response.status,
    )
  }
  const body = record(await response.json().catch(() => undefined))
  if (!body) {
    throw new PaymentProviderError('stripe', `A Stripe ${what} válasza nem JSON objektum.`)
  }
  return body
}

function apiUrl(options: StripeApiOptions, pathname: string): URL {
  return new URL(`${(options.apiUrl ?? STRIPE_API_URL).replace(/\/+$/, '')}${pathname}`)
}

export async function fetchStripeLineItems(
  sessionId: string,
  options: StripeApiOptions,
): Promise<PaymentLineItem[]> {
  const items: PaymentLineItem[] = []
  let startingAfter: string | undefined
  for (;;) {
    const url = apiUrl(options, `/v1/checkout/sessions/${encodeURIComponent(sessionId)}/line_items`)
    url.searchParams.set('limit', String(PAGE_SIZE))
    if (startingAfter) url.searchParams.set('starting_after', startingAfter)
    const page = await stripeGet(url, options, 'tételek')
    const data = records(page.data)
    for (const entry of data) {
      const currency = text(entry.currency)
      const total = numeric(entry.amount_total)
      if (!currency || total === undefined) {
        throw new PaymentProviderError(
          'stripe',
          'A Stripe tételből hiányzik az összeg vagy a pénznem.',
        )
      }
      items.push({
        name: text(entry.description) ?? 'Tétel',
        quantity: numeric(entry.quantity) ?? 1,
        totalGross: fromMinorUnits(total, currency, 'stripe'),
        sku: text(path(entry, 'price', 'product')),
      })
    }
    startingAfter = text(data.at(-1)?.id)
    if (page.has_more !== true || !startingAfter) return items
  }
}

export async function findStripeCheckoutSession(
  paymentIntentId: string,
  options: StripeApiOptions,
): Promise<JsonRecord | undefined> {
  const url = apiUrl(options, '/v1/checkout/sessions')
  url.searchParams.set('payment_intent', paymentIntentId)
  url.searchParams.set('limit', '1')
  return records((await stripeGet(url, options, 'Checkout munkamenet')).data)[0]
}

export async function countStripeRefunds(
  chargeId: string,
  options: StripeApiOptions,
): Promise<number> {
  const url = apiUrl(options, '/v1/refunds')
  url.searchParams.set('charge', chargeId)
  url.searchParams.set('limit', String(PAGE_SIZE))
  const refunds = records((await stripeGet(url, options, 'visszatérítések')).data)
  return refunds.filter((refund) => !INACTIVE_REFUND_STATUSES.has(text(refund.status) ?? '')).length
}

function shippingItem(session: JsonRecord, name: string): PaymentLineItem | undefined {
  const minor = numeric(path(session, 'shipping_cost', 'amount_total'))
  const currency = text(session.currency)
  if (minor === undefined || minor <= 0 || !currency) return undefined
  return { name, quantity: 1, totalGross: fromMinorUnits(minor, currency, 'stripe') }
}

export interface StripeWebhookOptions extends PaymentWebhookBaseOptions {
  readonly secret: string | readonly string[]
  readonly apiKey?: string | undefined
  readonly apiUrl?: string | undefined
  readonly toleranceSeconds?: number | undefined
  readonly shippingItemName?: string | undefined
  readonly now?: (() => number) | undefined
}

function isCheckoutSession(object: JsonRecord): boolean {
  return text(object.object) === 'checkout.session'
}

async function withCheckoutDetails(
  payment: PaymentEvent,
  event: StripeEvent,
  api: StripeApiOptions,
  options: StripeWebhookOptions,
): Promise<PaymentEvent> {
  let session = isCheckoutSession(event.object) ? event.object : undefined
  let enriched = payment
  if (!session && text(event.object.object) === 'payment_intent') {
    session = await findStripeCheckoutSession(payment.id, api)
    if (session) {
      const fromSession = fromCheckoutSession(event, session, 'paid', { method: options.method })
      enriched = { ...fromSession, id: payment.id, amount: payment.amount ?? fromSession.amount }
    }
  }
  const sessionId = session && text(session.id)
  if (!session || !sessionId) return enriched
  const items = await fetchStripeLineItems(sessionId, api)
  const shipping = shippingItem(session, options.shippingItemName ?? STRIPE_SHIPPING_ITEM_NAME)
  return { ...enriched, items: shipping ? [...items, shipping] : items }
}

async function withRefundHistory(
  payment: PaymentEvent,
  event: StripeEvent,
  api: StripeApiOptions,
): Promise<PaymentEvent> {
  const chargeId = text(event.object.id)
  if (!chargeId) return payment
  const refunds = await countStripeRefunds(chargeId, api)
  return refunds > 1 ? { ...payment, kind: 'partially-refunded' } : payment
}

async function enrich(
  payment: PaymentEvent,
  event: StripeEvent,
  options: StripeWebhookOptions,
): Promise<PaymentEvent> {
  const apiKey = options.apiKey?.trim()
  if (!apiKey) return payment
  const api: StripeApiOptions = { apiKey, apiUrl: options.apiUrl, fetch: options.fetch }
  if (payment.kind === 'paid') return withCheckoutDetails(payment, event, api, options)
  if (payment.kind === 'refunded') return withRefundHistory(payment, event, api)
  return payment
}

export function stripeWebhook(options: StripeWebhookOptions): WebhookHandler {
  secretsOf(options.secret)
  return (request) =>
    respondToWebhook(options, async () => {
      const payload = await readRawBody(request, 'stripe', options.maxBodyBytes)
      await verifyStripeSignature(
        payload,
        request.headers.get('stripe-signature'),
        options.secret,
        {
          toleranceSeconds: options.toleranceSeconds,
          now: options.now,
        },
      )
      const event = parseStripeEvent(payload)
      const payment = stripePaymentEvent(event, { method: options.method })
      if (payment) await deliverPayment(options, payment, (value) => enrich(value, event, options))
      return plainResponse(200, 'OK')
    })
}
