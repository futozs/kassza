import { describe, expect, test, vi } from 'vitest'
import { jsonResponse, routedFetch, webhookRequest } from '../../tests/payment-fetch'
import { hmacHex } from '../core/crypto'
import { PaymentProviderError, WebhookVerificationError } from './errors'
import {
  countStripeRefunds,
  fetchStripeLineItems,
  findStripeCheckoutSession,
  parseStripeEvent,
  parseStripeSignatureHeader,
  type StripeEvent,
  stripePaymentEvent,
  stripeWebhook,
  verifyStripeSignature,
} from './stripe'
import type { PaymentEvent } from './types'

const SECRET = 'whsec_teszt_titok'
const API_KEY = 'sk_test_kassza'
const NOW_SECONDS = 1_790_000_000
const now = (): number => NOW_SECONDS * 1000

async function signature(
  payload: string,
  secret = SECRET,
  timestamp = NOW_SECONDS,
): Promise<string> {
  return `t=${timestamp},v1=${await hmacHex('SHA-256', secret, `${timestamp}.${payload}`)}`
}

function event(
  type: string,
  object: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): string {
  return JSON.stringify({
    id: 'evt_1',
    object: 'event',
    type,
    created: NOW_SECONDS,
    livemode: false,
    data: { object, ...extra },
  })
}

const SESSION = {
  id: 'cs_test_1',
  object: 'checkout.session',
  payment_intent: 'pi_1',
  payment_status: 'paid',
  amount_total: 302_300,
  currency: 'huf',
  client_reference_id: 'WEB-1001',
  customer_details: {
    name: 'Kovács Éva',
    email: 'eva@example.hu',
    phone: '+36301234567',
    address: {
      country: 'HU',
      postal_code: '1111',
      city: 'Budapest',
      line1: 'Fő utca 1.',
      line2: null,
    },
    tax_ids: [],
  },
  shipping_cost: { amount_total: 99_000 },
  metadata: { orderId: '1001' },
}

function parsed(
  type: string,
  object: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): StripeEvent {
  return parseStripeEvent(event(type, object, extra))
}

describe('parseStripeSignatureHeader', () => {
  test('kiolvassa az időbélyeget és az összes v1 aláírást', () => {
    expect(parseStripeSignatureHeader('t=123,v1=aa,v0=bb, v1=cc')).toEqual({
      timestamp: 123,
      signatures: ['aa', 'cc'],
    })
  })

  test('hiányzó időbélyegnél vagy aláírásnál undefined-ot ad', () => {
    expect(parseStripeSignatureHeader('v1=aa')).toBeUndefined()
    expect(parseStripeSignatureHeader('t=123')).toBeUndefined()
    expect(parseStripeSignatureHeader('t=abc,v1=aa')).toBeUndefined()
    expect(parseStripeSignatureHeader('szemét')).toBeUndefined()
  })
})

describe('verifyStripeSignature', () => {
  const payload = '{"id":"evt_1"}'

  test('a helyes aláírást elfogadja', async () => {
    await expect(
      verifyStripeSignature(payload, await signature(payload), SECRET, { now }),
    ).resolves.toBeUndefined()
  })

  test('kulcsváltáskor bármelyik titokkal és bármelyik v1 aláírással elfogad', async () => {
    const header = `${await signature(payload, 'whsec_regi')},v1=${'0'.repeat(64)}`
    await expect(
      verifyStripeSignature(payload, header, ['whsec_uj', 'whsec_regi'], { now }),
    ).resolves.toBeUndefined()
  })

  test('módosított törzsnél invalid_signature hibát dob', async () => {
    await expect(
      verifyStripeSignature('{"id":"evt_2"}', await signature(payload), SECRET, { now }),
    ).rejects.toMatchObject({ reason: 'invalid_signature', provider: 'stripe' })
  })

  test('hiányzó és hibás fejlécre hibát dob', async () => {
    await expect(verifyStripeSignature(payload, null, SECRET, { now })).rejects.toMatchObject({
      reason: 'missing_signature',
    })
    await expect(verifyStripeSignature(payload, 'v1=aa', SECRET, { now })).rejects.toMatchObject({
      reason: 'invalid_signature',
    })
  })

  test('a túl régi időbélyeget elutasítja, a 0 tolerancia kikapcsolja az ellenőrzést', async () => {
    const old = await signature(payload, SECRET, NOW_SECONDS - 301)
    await expect(verifyStripeSignature(payload, old, SECRET, { now })).rejects.toMatchObject({
      reason: 'timestamp_out_of_range',
    })
    await expect(
      verifyStripeSignature(payload, old, SECRET, { now, toleranceSeconds: 0 }),
    ).resolves.toBeUndefined()
  })

  test('üres titokra TypeError-t dob', async () => {
    await expect(verifyStripeSignature(payload, 't=1,v1=a', ' ')).rejects.toBeInstanceOf(TypeError)
    await expect(verifyStripeSignature(payload, 't=1,v1=a', [])).rejects.toBeInstanceOf(TypeError)
  })

  test('alapértelmezésben a valós órát használja', async () => {
    const fresh = await signature(payload, SECRET, Math.floor(Date.now() / 1000))
    await expect(verifyStripeSignature(payload, fresh, SECRET)).resolves.toBeUndefined()
  })
})

describe('parseStripeEvent', () => {
  test('hiányzó data.object esetén invalid_payload hibát dob', () => {
    expect(() => parseStripeEvent('{"id":"evt_1","type":"x"}')).toThrow(WebhookVerificationError)
  })

  test('megőrzi a previous_attributes mezőt', () => {
    expect(
      parsed('charge.refunded', { id: 'ch_1' }, { previous_attributes: { amount_refunded: 0 } })
        .previousAttributes,
    ).toEqual({ amount_refunded: 0 })
  })
})

describe('stripePaymentEvent', () => {
  test('a fizetett Checkout munkamenetből fizetést készít, a HUF-ot kétdecimálisként kezeli', () => {
    const payment = stripePaymentEvent(parsed('checkout.session.completed', SESSION))
    expect(payment).toMatchObject({
      provider: 'stripe',
      kind: 'paid',
      id: 'pi_1',
      eventId: 'evt_1',
      eventType: 'checkout.session.completed',
      orderRef: 'WEB-1001',
      amount: { value: 3023, currency: 'HUF' },
      method: 'bankkártya',
      paidAt: new Date(NOW_SECONDS * 1000).toISOString(),
      customer: {
        name: 'Kovács Éva',
        email: 'eva@example.hu',
        address: { country: 'HU', zip: '1111', city: 'Budapest', line1: 'Fő utca 1.' },
      },
    })
    expect(payment?.customer?.isBusiness).toBeUndefined()
  })

  test('a metadata rendelésszámát használja, ha nincs client_reference_id', () => {
    const payment = stripePaymentEvent(
      parsed('checkout.session.completed', { ...SESSION, client_reference_id: null }),
    )
    expect(payment?.orderRef).toBe('1001')
  })

  test('a céges vevő adószámait és cégnevét felismeri', () => {
    const payment = stripePaymentEvent(
      parsed('checkout.session.completed', {
        ...SESSION,
        customer_details: {
          ...SESSION.customer_details,
          business_name: 'Példa Kft.',
          tax_ids: [
            { type: 'hu_tin', value: '12345678-2-42' },
            { type: 'eu_vat', value: 'HU12345678' },
          ],
        },
      }),
    )
    expect(payment?.customer).toMatchObject({
      name: 'Példa Kft.',
      taxNumber: '12345678-2-42',
      euTaxNumber: 'HU12345678',
      isBusiness: true,
    })
  })

  test('a még nem fizetett munkamenetet figyelmen kívül hagyja, a fizetés nélkülit other-ként adja', () => {
    expect(
      stripePaymentEvent(
        parsed('checkout.session.completed', { ...SESSION, payment_status: 'unpaid' }),
      ),
    ).toBeUndefined()
    expect(
      stripePaymentEvent(
        parsed('checkout.session.completed', {
          ...SESSION,
          payment_status: 'no_payment_required',
          payment_intent: null,
        }),
      ),
    ).toMatchObject({ kind: 'other', id: 'cs_test_1' })
  })

  test('az aszinkron fizetés sikerét és kudarcát is kezeli', () => {
    expect(
      stripePaymentEvent(parsed('checkout.session.async_payment_succeeded', SESSION))?.kind,
    ).toBe('paid')
    expect(stripePaymentEvent(parsed('checkout.session.async_payment_failed', SESSION))?.kind).toBe(
      'failed',
    )
  })

  test('a PaymentIntent eseményekből fizetést és hibát készít', () => {
    const intent = {
      id: 'pi_2',
      object: 'payment_intent',
      amount: 500_000,
      amount_received: 500_000,
      currency: 'huf',
      receipt_email: 'vevo@example.hu',
      metadata: { order_id: 'R-77' },
    }
    expect(
      stripePaymentEvent(parsed('payment_intent.succeeded', intent), { method: 'Stripe' }),
    ).toMatchObject({
      kind: 'paid',
      id: 'pi_2',
      orderRef: 'R-77',
      amount: { value: 5000, currency: 'HUF' },
      method: 'Stripe',
      customer: { email: 'vevo@example.hu' },
    })
    expect(
      stripePaymentEvent(
        parsed('payment_intent.payment_failed', { ...intent, receipt_email: null }),
      ),
    ).toMatchObject({ kind: 'failed', amount: { value: 5000 }, customer: undefined })
  })

  test('a JPY összeget nem osztja százzal', () => {
    const payment = stripePaymentEvent(
      parsed('payment_intent.succeeded', {
        id: 'pi_3',
        object: 'payment_intent',
        amount_received: 1500,
        currency: 'jpy',
      }),
    )
    expect(payment?.amount).toEqual({ value: 1500, currency: 'JPY' })
  })

  test('egyszeri teljes visszatérítésből refunded eseményt ad', () => {
    const payment = stripePaymentEvent(
      parsed(
        'charge.refunded',
        {
          id: 'ch_1',
          object: 'charge',
          payment_intent: 'pi_1',
          amount: 302_300,
          amount_refunded: 302_300,
          refunded: true,
          currency: 'huf',
          billing_details: { name: 'Kovács Éva', email: 'eva@example.hu', address: null },
        },
        { previous_attributes: { amount_refunded: 0, refunded: false } },
      ),
    )
    expect(payment).toMatchObject({
      kind: 'refunded',
      id: 'pi_1',
      amount: { value: 3023, currency: 'HUF' },
      refundedAmount: { value: 3023, currency: 'HUF' },
    })
  })

  test('részleges, illetve részletekben teljessé váló visszatérítést részlegesnek jelöl', () => {
    const charge = {
      id: 'ch_1',
      object: 'charge',
      payment_intent: 'pi_1',
      amount: 302_300,
      currency: 'huf',
    }
    expect(
      stripePaymentEvent(
        parsed('charge.refunded', { ...charge, amount_refunded: 100_000, refunded: false }),
      )?.kind,
    ).toBe('partially-refunded')
    expect(
      stripePaymentEvent(
        parsed(
          'charge.refunded',
          { ...charge, amount_refunded: 302_300, refunded: true },
          { previous_attributes: { amount_refunded: 100_000 } },
        ),
      )?.kind,
    ).toBe('partially-refunded')
  })

  test('payment_intent nélküli terhelésnél a terhelés azonosítóját használja', () => {
    expect(
      stripePaymentEvent(
        parsed('charge.refunded', {
          id: 'ch_9',
          amount: 1000,
          amount_refunded: 1000,
          currency: 'eur',
        }),
      ),
    ).toMatchObject({ id: 'ch_9', kind: 'refunded' })
  })

  test('az ismeretlen eseménytípust figyelmen kívül hagyja', () => {
    expect(stripePaymentEvent(parsed('customer.created', { id: 'cus_1' }))).toBeUndefined()
  })
})

describe('Stripe API segédek', () => {
  test('a Checkout tételeket lapozva kéri le', async () => {
    const stripe = routedFetch([
      [
        /line_items\?limit=100&starting_after=li_1$/,
        () =>
          jsonResponse({
            data: [
              {
                id: 'li_2',
                description: 'Kifli',
                quantity: 1,
                amount_total: 25_000,
                currency: 'huf',
              },
            ],
            has_more: false,
          }),
      ],
      [
        /line_items\?limit=100$/,
        () =>
          jsonResponse({
            data: [
              {
                id: 'li_1',
                description: 'Kávé',
                quantity: 2,
                amount_total: 178_000,
                currency: 'huf',
                price: { product: 'prod_1' },
              },
            ],
            has_more: true,
          }),
      ],
    ])
    const items = await fetchStripeLineItems('cs_test_1', { apiKey: API_KEY, fetch: stripe.fetch })
    expect(items).toEqual([
      { name: 'Kávé', quantity: 2, totalGross: 1780, sku: 'prod_1' },
      { name: 'Kifli', quantity: 1, totalGross: 250, sku: undefined },
    ])
    expect(stripe.requests[0]?.url).toBe(
      'https://api.stripe.com/v1/checkout/sessions/cs_test_1/line_items?limit=100',
    )
    expect(stripe.requests[0]?.headers.get('authorization')).toBe(`Bearer ${API_KEY}`)
  })

  test('hibás válaszra és hiányos tételre PaymentProviderError-t dob', async () => {
    const failing = routedFetch([[/./, () => jsonResponse({ error: {} }, 401)]])
    await expect(
      fetchStripeLineItems('cs_1', { apiKey: API_KEY, fetch: failing.fetch }),
    ).rejects.toMatchObject({ name: 'PaymentProviderError', status: 401 })
    const incomplete = routedFetch([
      [/./, () => jsonResponse({ data: [{ id: 'li_1', description: 'X' }], has_more: false })],
    ])
    await expect(
      fetchStripeLineItems('cs_1', { apiKey: API_KEY, fetch: incomplete.fetch }),
    ).rejects.toBeInstanceOf(PaymentProviderError)
    const notJson = routedFetch([[/./, () => new Response('nem json')]])
    await expect(
      fetchStripeLineItems('cs_1', { apiKey: API_KEY, fetch: notJson.fetch }),
    ).rejects.toBeInstanceOf(PaymentProviderError)
    const offline = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    await expect(
      fetchStripeLineItems('cs_1', { apiKey: API_KEY, fetch: offline }),
    ).rejects.toBeInstanceOf(PaymentProviderError)
  })

  test('egyedi API URL-t is elfogad, a záró perjelet levágja', async () => {
    const stripe = routedFetch([[/./, () => jsonResponse({ data: [], has_more: false })]])
    await fetchStripeLineItems('cs 1', {
      apiKey: API_KEY,
      apiUrl: 'http://localhost:12111/',
      fetch: stripe.fetch,
    })
    expect(stripe.requests[0]?.url).toBe(
      'http://localhost:12111/v1/checkout/sessions/cs%201/line_items?limit=100',
    )
  })

  test('a PaymentIntent Checkout munkamenetét visszakeresi', async () => {
    const stripe = routedFetch([[/checkout\/sessions\?/, () => jsonResponse({ data: [SESSION] })]])
    expect(
      await findStripeCheckoutSession('pi_1', { apiKey: API_KEY, fetch: stripe.fetch }),
    ).toEqual(SESSION)
    expect(stripe.requests[0]?.url).toBe(
      'https://api.stripe.com/v1/checkout/sessions?payment_intent=pi_1&limit=1',
    )
  })

  test('csak az aktív visszatérítéseket számolja', async () => {
    const stripe = routedFetch([
      [
        /refunds\?charge=ch_1/,
        () =>
          jsonResponse({
            data: [
              { status: 'succeeded' },
              { status: 'failed' },
              { status: 'pending' },
              { status: 'canceled' },
            ],
          }),
      ],
    ])
    expect(await countStripeRefunds('ch_1', { apiKey: API_KEY, fetch: stripe.fetch })).toBe(2)
  })
})

describe('stripeWebhook', () => {
  function stripeApi(
    sessionLookup: unknown[] = [],
    refunds: unknown[] = [{ status: 'succeeded' }],
  ) {
    return routedFetch([
      [
        /line_items/,
        () =>
          jsonResponse({
            data: [
              {
                id: 'li_1',
                description: 'Kávé',
                quantity: 2,
                amount_total: 178_000,
                currency: 'huf',
              },
              {
                id: 'li_2',
                description: 'Kifli',
                quantity: 1,
                amount_total: 25_000,
                currency: 'huf',
              },
            ],
            has_more: false,
          }),
      ],
      [/checkout\/sessions\?payment_intent=/, () => jsonResponse({ data: sessionLookup })],
      [/refunds\?charge=/, () => jsonResponse({ data: refunds })],
    ])
  }

  async function deliver(
    handler: (request: Request) => Promise<Response>,
    payload: string,
    header?: string,
  ): Promise<Response> {
    return handler(
      webhookRequest(payload, { 'stripe-signature': header ?? (await signature(payload)) }),
    )
  }

  test('ellenőrzött Checkout eseménynél tételekkel és szállítással hívja az onPayment-et', async () => {
    const api = stripeApi()
    const payments: PaymentEvent[] = []
    const handler = stripeWebhook({
      secret: SECRET,
      apiKey: API_KEY,
      fetch: api.fetch,
      now,
      onPayment: (payment) => {
        payments.push(payment)
      },
    })

    const response = await deliver(handler, event('checkout.session.completed', SESSION))

    expect(response.status).toBe(200)
    expect(payments).toHaveLength(1)
    expect(payments[0]?.items).toEqual([
      { name: 'Kávé', quantity: 2, totalGross: 1780, sku: undefined },
      { name: 'Kifli', quantity: 1, totalGross: 250, sku: undefined },
      { name: 'Szállítási díj', quantity: 1, totalGross: 990 },
    ])
  })

  test('API-kulcs nélkül tételek nélkül adja tovább az eseményt', async () => {
    const onPayment = vi.fn()
    const handler = stripeWebhook({ secret: SECRET, now, onPayment })
    await deliver(handler, event('checkout.session.completed', SESSION))
    expect(onPayment).toHaveBeenCalledWith(expect.objectContaining({ kind: 'paid' }))
    expect(onPayment.mock.calls[0]?.[0]?.items).toBeUndefined()
  })

  test('PaymentIntent eseménynél a Checkout munkamenetből tölti be a tételeket és a vevőt', async () => {
    const api = stripeApi([SESSION])
    const onPayment = vi.fn()
    const handler = stripeWebhook({
      secret: SECRET,
      apiKey: API_KEY,
      fetch: api.fetch,
      now,
      onPayment,
    })
    await deliver(
      handler,
      event('payment_intent.succeeded', {
        id: 'pi_1',
        object: 'payment_intent',
        amount_received: 302_300,
        currency: 'huf',
      }),
    )
    expect(onPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'paid',
        id: 'pi_1',
        eventType: 'payment_intent.succeeded',
        orderRef: 'WEB-1001',
        customer: expect.objectContaining({ name: 'Kovács Éva' }),
        items: expect.arrayContaining([expect.objectContaining({ name: 'Szállítási díj' })]),
      }),
    )
  })

  test('Checkout nélküli PaymentIntent eseményt változatlanul ad tovább', async () => {
    const api = stripeApi([])
    const onPayment = vi.fn()
    const handler = stripeWebhook({
      secret: SECRET,
      apiKey: API_KEY,
      fetch: api.fetch,
      now,
      onPayment,
    })
    await deliver(
      handler,
      event('payment_intent.succeeded', {
        id: 'pi_7',
        object: 'payment_intent',
        amount_received: 100_000,
        currency: 'huf',
      }),
    )
    expect(onPayment).toHaveBeenCalledWith(expect.objectContaining({ id: 'pi_7' }))
    expect(onPayment.mock.calls[0]?.[0]?.items).toBeUndefined()
  })

  test('több visszatérítés után a teljes visszatérítést is részlegesnek jelöli', async () => {
    const api = stripeApi([], [{ status: 'succeeded' }, { status: 'succeeded' }])
    const onPayment = vi.fn()
    const handler = stripeWebhook({
      secret: SECRET,
      apiKey: API_KEY,
      fetch: api.fetch,
      now,
      onPayment,
    })
    await deliver(
      handler,
      event('charge.refunded', {
        id: 'ch_1',
        payment_intent: 'pi_1',
        amount: 302_300,
        amount_refunded: 302_300,
        refunded: true,
        currency: 'huf',
      }),
    )
    expect(onPayment).toHaveBeenCalledWith(expect.objectContaining({ kind: 'partially-refunded' }))
  })

  test('egyetlen teljes visszatérítésnél refunded marad', async () => {
    const api = stripeApi([], [{ status: 'succeeded' }])
    const onPayment = vi.fn()
    const handler = stripeWebhook({
      secret: SECRET,
      apiKey: API_KEY,
      fetch: api.fetch,
      now,
      onPayment,
    })
    await deliver(
      handler,
      event('charge.refunded', {
        id: 'ch_1',
        payment_intent: 'pi_1',
        amount: 302_300,
        amount_refunded: 302_300,
        refunded: true,
        currency: 'huf',
      }),
    )
    expect(onPayment).toHaveBeenCalledWith(expect.objectContaining({ kind: 'refunded' }))
  })

  test('nem releváns eseményre 200-at ad, onPayment nélkül', async () => {
    const onPayment = vi.fn()
    const handler = stripeWebhook({ secret: SECRET, now, onPayment })
    const response = await deliver(handler, event('customer.created', { id: 'cus_1' }))
    expect(response.status).toBe(200)
    expect(onPayment).not.toHaveBeenCalled()
  })

  test('hibás aláírásra 400-at ad, és nem hívja az onPayment-et', async () => {
    const onPayment = vi.fn()
    const handler = stripeWebhook({ secret: SECRET, now, onPayment })
    const response = await deliver(
      handler,
      event('checkout.session.completed', SESSION),
      't=1,v1=00',
    )
    expect(response.status).toBe(400)
    expect(onPayment).not.toHaveBeenCalled()
  })

  test('ha az onPayment dob, 500-at ad, hogy a Stripe újraküldje', async () => {
    const onError = vi.fn()
    const handler = stripeWebhook({
      secret: SECRET,
      now,
      onError,
      onPayment: () => {
        throw new Error('a számlázás nem sikerült')
      },
    })
    const response = await deliver(handler, event('checkout.session.completed', SESSION))
    expect(response.status).toBe(500)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  test('üres titokkal már létrehozáskor TypeError-t dob', () => {
    expect(() => stripeWebhook({ secret: '', onPayment: vi.fn() })).toThrow(TypeError)
  })
})
