import { describe, expect, test, vi } from 'vitest'
import { jsonResponse, routedFetch, webhookRequest } from '../../tests/payment-fetch'
import { hmacHex } from '../core/crypto'
import { PaymentProviderError, WebhookVerificationError } from './errors'
import {
  fetchRevolutOrder,
  parseRevolutEvent,
  REVOLUT_API_VERSION,
  REVOLUT_SANDBOX_API_URL,
  revolutPaymentEvent,
  revolutWebhook,
  verifyRevolutSignature,
} from './revolut'

const DOC_SECRET = 'wsk_r59a4HfWVAKycbCaNO1RvgCJec02gRd8'
const DOC_TIMESTAMP = '1683650202360'
const DOC_PAYLOAD =
  '{"event": "ORDER_COMPLETED","order_id": "9fc01989-3f61-4484-a5d9-ffe768531be9","merchant_order_ext_ref": "Test #3928"}'
const DOC_SIGNATURE = 'v1=281b1f1aebe9357b7b128fd6a3aae0fe202c901add4ce75e6d038e498871d7fd'

const SECRET = 'wsk_teszt'
const API_KEY = 'sk_teszt'
const ORDER_ID = '6634c172-3398-ac93-aee9-50de0282e3ac'
const REFUND_ID = '7744c172-3398-ac93-aee9-50de0282e3ad'
const NOW = 1_790_000_000_000

async function signed(payload: string, secret = SECRET, timestamp = String(NOW)) {
  return {
    'revolut-signature': `v1=${await hmacHex('SHA-256', secret, `v1.${timestamp}.${payload}`)}`,
    'revolut-request-timestamp': timestamp,
  }
}

function saleOrder(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ORDER_ID,
    token: 'tok',
    type: 'payment',
    state: 'completed',
    created_at: '2026-10-02T08:00:00Z',
    updated_at: '2026-10-02T08:00:09Z',
    amount: 302_300,
    currency: 'HUF',
    customer: { full_name: 'Kovács Éva', email: 'eva@example.hu', phone: '+36301234567' },
    merchant_order_data: { reference: 'WEB-1001' },
    line_items: [
      {
        name: 'Kávé',
        type: 'physical',
        quantity: { value: 2, unit: 'db' },
        unit_price_amount: 89_000,
        total_amount: 178_000,
        external_id: 'KAVE',
      },
      {
        name: 'Kifli',
        type: 'physical',
        quantity: { value: 1 },
        unit_price_amount: 124_300,
        total_amount: 124_300,
      },
    ],
    payments: [
      {
        id: 'pay-1',
        state: 'completed',
        payment_method: { type: 'card' },
        billing_address: {
          street_line_1: 'Fő utca 1.',
          city: 'Budapest',
          country_code: 'HU',
          postcode: '1111',
        },
      },
    ],
    ...overrides,
  }
}

function refundOrder(
  amount: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: REFUND_ID,
    type: 'refund',
    state: 'completed',
    amount,
    currency: 'HUF',
    related_order_id: ORDER_ID,
    updated_at: '2026-10-03T08:00:00Z',
    ...overrides,
  }
}

function completedEvent(orderId = ORDER_ID): string {
  return JSON.stringify({
    event: 'ORDER_COMPLETED',
    order_id: orderId,
    merchant_order_ext_ref: 'EXT-1',
  })
}

describe('verifyRevolutSignature', () => {
  test('a Revolut dokumentáció példájára a függetlenül számolt aláírást fogadja el', async () => {
    await expect(
      verifyRevolutSignature(DOC_PAYLOAD, DOC_SIGNATURE, DOC_TIMESTAMP, DOC_SECRET, {
        now: () => Number(DOC_TIMESTAMP),
      }),
    ).resolves.toBeUndefined()
  })

  test('kulcsváltáskor a több aláírás közül bármelyiket elfogadja', async () => {
    const header = `v1=${'0'.repeat(64)}, ${DOC_SIGNATURE}`
    await expect(
      verifyRevolutSignature(DOC_PAYLOAD, header, DOC_TIMESTAMP, ['wsk_masik', DOC_SECRET], {
        now: () => Number(DOC_TIMESTAMP),
      }),
    ).resolves.toBeUndefined()
  })

  test('módosított törzsre invalid_signature hibát dob', async () => {
    await expect(
      verifyRevolutSignature(`${DOC_PAYLOAD} `, DOC_SIGNATURE, DOC_TIMESTAMP, DOC_SECRET, {
        now: () => Number(DOC_TIMESTAMP),
      }),
    ).rejects.toMatchObject({ reason: 'invalid_signature', provider: 'revolut' })
  })

  test('5 percnél régebbi vagy újabb időbélyeget elutasít, a 0 tolerancia kikapcsolja', async () => {
    const options = { now: () => Number(DOC_TIMESTAMP) + 300_001 }
    await expect(
      verifyRevolutSignature(DOC_PAYLOAD, DOC_SIGNATURE, DOC_TIMESTAMP, DOC_SECRET, options),
    ).rejects.toMatchObject({ reason: 'timestamp_out_of_range' })
    await expect(
      verifyRevolutSignature(DOC_PAYLOAD, DOC_SIGNATURE, DOC_TIMESTAMP, DOC_SECRET, {
        now: () => Number(DOC_TIMESTAMP) - 300_001,
      }),
    ).rejects.toMatchObject({ reason: 'timestamp_out_of_range' })
    await expect(
      verifyRevolutSignature(DOC_PAYLOAD, DOC_SIGNATURE, DOC_TIMESTAMP, DOC_SECRET, {
        ...options,
        toleranceMs: 0,
      }),
    ).resolves.toBeUndefined()
  })

  test('hiányzó fejlécre, hibás időbélyegre és üres titokra hibát dob', async () => {
    await expect(
      verifyRevolutSignature(DOC_PAYLOAD, null, DOC_TIMESTAMP, DOC_SECRET),
    ).rejects.toMatchObject({ reason: 'missing_signature' })
    await expect(
      verifyRevolutSignature(DOC_PAYLOAD, 'v2=abc', DOC_TIMESTAMP, DOC_SECRET),
    ).rejects.toMatchObject({ reason: 'missing_signature' })
    await expect(
      verifyRevolutSignature(DOC_PAYLOAD, DOC_SIGNATURE, undefined, DOC_SECRET),
    ).rejects.toMatchObject({ reason: 'missing_signature' })
    await expect(
      verifyRevolutSignature(DOC_PAYLOAD, DOC_SIGNATURE, '2026-10-02', DOC_SECRET),
    ).rejects.toMatchObject({ reason: 'invalid_signature' })
    await expect(
      verifyRevolutSignature(DOC_PAYLOAD, DOC_SIGNATURE, DOC_TIMESTAMP, ''),
    ).rejects.toBeInstanceOf(TypeError)
  })

  test('alapértelmezésben a valós órát használja', async () => {
    const timestamp = String(Date.now())
    const headers = await signed(DOC_PAYLOAD, SECRET, timestamp)
    await expect(
      verifyRevolutSignature(DOC_PAYLOAD, headers['revolut-signature'], timestamp, SECRET),
    ).resolves.toBeUndefined()
  })
})

describe('parseRevolutEvent', () => {
  test('kiolvassa az eseményt és a rendelés azonosítóját', () => {
    expect(parseRevolutEvent(DOC_PAYLOAD)).toMatchObject({
      event: 'ORDER_COMPLETED',
      orderId: '9fc01989-3f61-4484-a5d9-ffe768531be9',
      merchantOrderRef: 'Test #3928',
    })
  })

  test('event mező nélkül invalid_payload hibát dob', () => {
    expect(() => parseRevolutEvent('{"order_id":"x"}')).toThrow(WebhookVerificationError)
  })
})

describe('fetchRevolutOrder', () => {
  test('Bearer kulccsal és API-verzió fejléccel kéri le a rendelést', async () => {
    const api = routedFetch([[/\/api\/orders\//, () => jsonResponse(saleOrder())]])
    await fetchRevolutOrder(ORDER_ID, { apiKey: API_KEY, fetch: api.fetch })
    const request = api.requests[0]
    expect(request?.url).toBe(`https://merchant.revolut.com/api/orders/${ORDER_ID}`)
    expect(request?.headers.get('authorization')).toBe(`Bearer ${API_KEY}`)
    expect(request?.headers.get('revolut-api-version')).toBe(REVOLUT_API_VERSION)
  })

  test('a sandbox URL-t és egyedi API-verziót is kezeli', async () => {
    const api = routedFetch([[/./, () => jsonResponse(saleOrder())]])
    await fetchRevolutOrder(ORDER_ID, {
      apiKey: API_KEY,
      sandbox: true,
      apiVersion: '2024-09-01',
      fetch: api.fetch,
    })
    expect(api.requests[0]?.url).toBe(`${REVOLUT_SANDBOX_API_URL}/api/orders/${ORDER_ID}`)
    expect(api.requests[0]?.headers.get('revolut-api-version')).toBe('2024-09-01')
  })

  test('HTTP hibára, értelmezhetetlen válaszra és hálózati hibára hibát dob', async () => {
    const httpError = routedFetch([[/./, () => jsonResponse({ message: 'nincs' }, 404)]])
    await expect(
      fetchRevolutOrder(ORDER_ID, { apiKey: API_KEY, fetch: httpError.fetch }),
    ).rejects.toMatchObject({ status: 404 })
    const noId = routedFetch([[/./, () => jsonResponse({ state: 'completed' })]])
    await expect(
      fetchRevolutOrder(ORDER_ID, { apiKey: API_KEY, fetch: noId.fetch }),
    ).rejects.toBeInstanceOf(PaymentProviderError)
    const offline = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    await expect(
      fetchRevolutOrder(ORDER_ID, { apiKey: API_KEY, fetch: offline }),
    ).rejects.toBeInstanceOf(PaymentProviderError)
  })
})

describe('revolutPaymentEvent', () => {
  const completed = parseRevolutEvent(completedEvent())

  test('a teljesült rendelésből tételes fizetést készít ISO minor unitokkal', () => {
    expect(revolutPaymentEvent(completed, { order: saleOrder() })).toMatchObject({
      provider: 'revolut',
      kind: 'paid',
      id: ORDER_ID,
      eventId: `ORDER_COMPLETED:${ORDER_ID}`,
      orderRef: 'WEB-1001',
      amount: { value: 3023, currency: 'HUF' },
      paidAt: '2026-10-02T08:00:09Z',
      method: 'bankkártya',
      customer: {
        name: 'Kovács Éva',
        email: 'eva@example.hu',
        phone: '+36301234567',
        address: { country: 'HU', zip: '1111', city: 'Budapest', line1: 'Fő utca 1.' },
      },
      items: [
        { name: 'Kávé', quantity: 2, totalGross: 1780, unit: 'db', sku: 'KAVE' },
        { name: 'Kifli', quantity: 1, totalGross: 1243, unit: undefined, sku: undefined },
      ],
    })
  })

  test('számlázási cím híján a szállítási címet és kapcsolatot használja', () => {
    const order = saleOrder({
      customer: undefined,
      payments: [
        { id: 'pay-1', state: 'captured', payment_method: { type: 'revolut_pay_account' } },
      ],
      shipping: {
        address: {
          street_line_1: 'Kossuth tér 1.',
          city: 'Szeged',
          country_code: 'HU',
          postcode: '6720',
        },
        contact: { name: 'Nagy Péter', email: 'peter@example.hu' },
      },
      merchant_order_data: undefined,
      line_items: [],
    })
    expect(revolutPaymentEvent(completed, { order })).toMatchObject({
      orderRef: 'EXT-1',
      method: 'Revolut Pay',
      customer: {
        name: 'Nagy Péter',
        email: 'peter@example.hu',
        address: { city: 'Szeged', zip: '6720' },
      },
      items: undefined,
    })
  })

  test('a SEPA beszedést és a megadott módot is kezeli, adat nélkül nincs vevő', () => {
    const sepa = saleOrder({
      customer: undefined,
      payments: [{ id: 'p', state: 'completed', payment_method: { type: 'sepa_direct_debit' } }],
    })
    expect(revolutPaymentEvent(completed, { order: sepa })).toMatchObject({
      method: 'csoportos beszedés',
    })
    expect(revolutPaymentEvent(completed, { order: sepa })?.customer).toBeUndefined()
    const bare = saleOrder({ customer: undefined, payments: [] })
    expect(revolutPaymentEvent(completed, { order: bare, method: 'Revolut' })).toMatchObject({
      method: 'Revolut',
      customer: undefined,
    })
  })

  test('nem completed állapotú rendelésnél hibát dob, hogy a Revolut újraküldje', () => {
    expect(() =>
      revolutPaymentEvent(completed, { order: saleOrder({ state: 'processing' }) }),
    ).toThrow(PaymentProviderError)
  })

  test('egyetlen teljes visszatérítésből refunded eseményt ad az eredeti rendelésre', () => {
    const event = parseRevolutEvent(completedEvent(REFUND_ID))
    expect(
      revolutPaymentEvent(event, {
        order: refundOrder(302_300),
        originalOrder: saleOrder({ refunded_amount: 302_300 }),
      }),
    ).toMatchObject({
      kind: 'refunded',
      id: ORDER_ID,
      amount: { value: 3023, currency: 'HUF' },
      refundedAmount: { value: 3023, currency: 'HUF' },
      paidAt: '2026-10-03T08:00:00Z',
    })
  })

  test('részleges vagy előzményes visszatérítést részlegesnek jelöl', () => {
    const event = parseRevolutEvent(completedEvent(REFUND_ID))
    expect(
      revolutPaymentEvent(event, {
        order: refundOrder(100_000),
        originalOrder: saleOrder({ refunded_amount: 100_000 }),
      })?.kind,
    ).toBe('partially-refunded')
    expect(
      revolutPaymentEvent(event, {
        order: refundOrder(302_300),
        originalOrder: saleOrder({ refunded_amount: 402_300 }),
      })?.kind,
    ).toBe('partially-refunded')
    expect(
      revolutPaymentEvent(event, {
        order: refundOrder(202_300),
        originalOrder: saleOrder({ refunded_amount: undefined }),
      }),
    ).toMatchObject({ kind: 'partially-refunded', refundedAmount: { value: 2023 } })
  })

  test('a visszatérítési rendelést tételes visszatérítésként adja, a korábbi összeggel', () => {
    const event = parseRevolutEvent(completedEvent(REFUND_ID))
    expect(
      revolutPaymentEvent(event, {
        order: refundOrder(100_000),
        originalOrder: saleOrder({ refunded_amount: 250_000 }),
      })?.refunds,
    ).toEqual([
      {
        id: REFUND_ID,
        amount: { value: 1000, currency: 'HUF' },
        refundedBefore: 1500,
        createdAt: '2026-10-03T08:00:00Z',
      },
    ])
    expect(
      revolutPaymentEvent(event, {
        order: refundOrder(100_000),
        originalOrder: saleOrder({ refunded_amount: undefined }),
      })?.refunds?.[0]?.refundedBefore,
    ).toBeUndefined()
    expect(
      revolutPaymentEvent(event, {
        order: refundOrder(100_000),
        originalOrder: saleOrder({ refunded_amount: 50_000 }),
      })?.refunds?.[0]?.refundedBefore,
    ).toBeUndefined()
  })

  test('az eredeti rendelés nélkül vagy befejezetlen visszatérítésnél hibát dob', () => {
    const event = parseRevolutEvent(completedEvent(REFUND_ID))
    expect(() => revolutPaymentEvent(event, { order: refundOrder(302_300) })).toThrow(
      PaymentProviderError,
    )
    expect(() =>
      revolutPaymentEvent(event, {
        order: refundOrder(302_300, { state: 'pending' }),
        originalOrder: saleOrder(),
      }),
    ).toThrow(PaymentProviderError)
  })

  test('a hiányzó vagy más rendelésre PaymentProviderError-t dob', () => {
    expect(() => revolutPaymentEvent(completed)).toThrow(PaymentProviderError)
    expect(() => revolutPaymentEvent(completed, { order: saleOrder({ id: 'masik' }) })).toThrow(
      PaymentProviderError,
    )
  })

  test('a sikertelen és az engedélyezett eseményeket rendeléslekérés nélkül jelöli', () => {
    for (const name of [
      'ORDER_CANCELLED',
      'ORDER_FAILED',
      'ORDER_PAYMENT_DECLINED',
      'ORDER_PAYMENT_FAILED',
    ]) {
      const event = parseRevolutEvent(JSON.stringify({ event: name, order_id: ORDER_ID }))
      expect(revolutPaymentEvent(event)).toMatchObject({ kind: 'failed', id: ORDER_ID })
    }
    const authorised = parseRevolutEvent(
      JSON.stringify({
        event: 'ORDER_AUTHORISED',
        order_id: ORDER_ID,
        merchant_order_ext_ref: 'R',
      }),
    )
    expect(revolutPaymentEvent(authorised)).toMatchObject({ kind: 'other', orderRef: 'R' })
  })

  test('a visszaterhelés típusú rendelést other-ként, a többi eseményt figyelmen kívül hagyja', () => {
    expect(revolutPaymentEvent(completed, { order: saleOrder({ type: 'chargeback' }) })?.kind).toBe(
      'other',
    )
    const payout = parseRevolutEvent(JSON.stringify({ event: 'PAYOUT_COMPLETED', payout_id: 'p' }))
    expect(revolutPaymentEvent(payout)).toBeUndefined()
    const unknown = parseRevolutEvent(
      JSON.stringify({ event: 'ORDER_PAYMENT_AUTHENTICATED', order_id: ORDER_ID }),
    )
    expect(revolutPaymentEvent(unknown)).toBeUndefined()
  })
})

describe('revolutWebhook', () => {
  function revolutApi(orders: Readonly<Record<string, Record<string, unknown>>>) {
    return routedFetch([
      [
        /\/api\/orders\//,
        (request) => {
          const id = decodeURIComponent(request.url.split('/').pop() ?? '')
          const order = orders[id]
          return order ? jsonResponse(order) : jsonResponse({ message: 'nincs' }, 404)
        },
      ],
    ])
  }

  test('ellenőrzött ORDER_COMPLETED eseménynél lekéri a rendelést, és 204-et ad', async () => {
    const api = revolutApi({ [ORDER_ID]: saleOrder() })
    const onPayment = vi.fn()
    const handler = revolutWebhook({
      secret: SECRET,
      apiKey: API_KEY,
      fetch: api.fetch,
      now: () => NOW,
      onPayment,
    })
    const payload = completedEvent()

    const response = await handler(webhookRequest(payload, await signed(payload)))

    expect(response.status).toBe(204)
    expect(onPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'paid',
        id: ORDER_ID,
        amount: { value: 3023, currency: 'HUF' },
      }),
    )
  })

  test('a visszatérítési rendelésnél az eredetit is lekéri', async () => {
    const api = revolutApi({
      [REFUND_ID]: refundOrder(302_300),
      [ORDER_ID]: saleOrder({ refunded_amount: 302_300 }),
    })
    const onPayment = vi.fn()
    const handler = revolutWebhook({
      secret: SECRET,
      apiKey: API_KEY,
      fetch: api.fetch,
      now: () => NOW,
      onPayment,
    })
    const payload = completedEvent(REFUND_ID)

    await handler(webhookRequest(payload, await signed(payload)))

    expect(api.requests.map((request) => request.url.split('/').pop())).toEqual([
      REFUND_ID,
      ORDER_ID,
    ])
    expect(onPayment).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'refunded', id: ORDER_ID }),
    )
  })

  test('nem rendeléses eseménynél nem kér le semmit', async () => {
    const api = revolutApi({})
    const onPayment = vi.fn()
    const handler = revolutWebhook({
      secret: SECRET,
      apiKey: API_KEY,
      fetch: api.fetch,
      now: () => NOW,
      onPayment,
    })
    const payload = JSON.stringify({ event: 'ORDER_FAILED', order_id: ORDER_ID })
    expect((await handler(webhookRequest(payload, await signed(payload)))).status).toBe(204)
    const payout = JSON.stringify({ event: 'PAYOUT_COMPLETED', payout_id: 'p' })
    expect((await handler(webhookRequest(payout, await signed(payout)))).status).toBe(204)
    expect(api.requests).toHaveLength(0)
    expect(onPayment).toHaveBeenCalledTimes(1)
  })

  test('hibás aláírásra 400-at, a rendelés lekérési hibájára 500-at ad', async () => {
    const api = revolutApi({})
    const onError = vi.fn()
    const handler = revolutWebhook({
      secret: SECRET,
      apiKey: API_KEY,
      fetch: api.fetch,
      now: () => NOW,
      onError,
      onPayment: vi.fn(),
    })
    const payload = completedEvent()
    const forged = { ...(await signed(payload)), 'revolut-signature': `v1=${'f'.repeat(64)}` }
    expect((await handler(webhookRequest(payload, forged))).status).toBe(400)
    expect((await handler(webhookRequest(payload, await signed(payload)))).status).toBe(500)
    expect(onError).toHaveBeenCalledTimes(1)
  })

  test('API-kulcs vagy titok nélkül létrehozáskor TypeError-t dob', () => {
    expect(() => revolutWebhook({ secret: SECRET, apiKey: '', onPayment: vi.fn() })).toThrow(
      TypeError,
    )
    expect(() => revolutWebhook({ secret: [], apiKey: API_KEY, onPayment: vi.fn() })).toThrow(
      TypeError,
    )
  })
})
