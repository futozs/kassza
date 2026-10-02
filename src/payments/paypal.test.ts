import { describe, expect, test, vi } from 'vitest'
import {
  jsonResponse,
  type RecordedRequest,
  routedFetch,
  webhookRequest,
} from '../../tests/payment-fetch'
import { PaymentProviderError, WebhookVerificationError } from './errors'
import {
  PAYPAL_SANDBOX_API_URL,
  parsePayPalEvent,
  payPalApi,
  payPalCaptureIdOfRefund,
  payPalOrderIdOfCapture,
  payPalPaymentEvent,
  payPalTransmission,
  payPalWebhook,
  verifyPayPalWebhook,
} from './paypal'

const CLIENT_ID = 'paypal-kliens'
const CLIENT_SECRET = 'paypal-titok'
const WEBHOOK_ID = '8PT597110X687430LKGECATA'
const CAPTURE_ID = '2GG279541U471931P'
const ORDER_ID = '5O190127TN364715T'

const TRANSMISSION = {
  'paypal-auth-algo': 'SHA256withRSA',
  'paypal-cert-url': 'https://api.paypal.com/v1/notifications/certs/CERT-360caa42',
  'paypal-transmission-id': '69cd13f0-d67a-11e5-baa3-778b53f4ae55',
  'paypal-transmission-sig':
    'lmI95Jx3Y9nhR5SJWlHVIWpg4AgFk7n9bCHSRxbrd8A9zrhdu2rMyFrmz+Zjh3s3boXB07VXCXUZy/UFzUlnGJn0wDugt7FlSvdKeIJenLRemUxYCPVoEZzg9VFNqOa48gMkvF+XTpxBeUx/kWy6B5cp7GkT2+pOowfRK7OaynuxUoKW3JcMWw272VKjLTtTAShncla7tGF+55rxyt2KNZIIqxNMJ48RDZheGU5w1npu9dZHnPgTXB9iomeVRoD8O/jhRpnKsGrDschyNdkeh81BJJMH4Ctc6lnCCquoP/GzCzz33MMsNdid7vL/NIWaCsekQpW26FpWPi/tfj8nLA==',
  'paypal-transmission-time': '2026-10-02T08:30:00Z',
}

function captureResource(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: CAPTURE_ID,
    status: 'COMPLETED',
    amount: { currency_code: 'HUF', value: '3023' },
    final_capture: true,
    custom_id: 'WEB-1001',
    create_time: '2026-10-02T08:29:55Z',
    supplementary_data: { related_ids: { order_id: ORDER_ID } },
    links: [
      {
        href: `https://api.paypal.com/v2/payments/captures/${CAPTURE_ID}`,
        rel: 'self',
        method: 'GET',
      },
    ],
    ...overrides,
  }
}

function refundResource(
  value: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: '1JU08902781691411',
    status: 'COMPLETED',
    amount: { currency_code: 'HUF', value },
    seller_payable_breakdown: { total_refunded_amount: { currency_code: 'HUF', value } },
    create_time: '2026-10-03T08:00:00Z',
    links: [
      {
        href: 'https://api.paypal.com/v2/payments/refunds/1JU08902781691411',
        rel: 'self',
        method: 'GET',
      },
      {
        href: `https://api.paypal.com/v2/payments/captures/${CAPTURE_ID}`,
        rel: 'up',
        method: 'GET',
      },
    ],
    ...overrides,
  }
}

function eventPayload(eventType: string, resource: Record<string, unknown>): string {
  return JSON.stringify({
    id: 'WH-58D329510W468432D-8HN650336L201105X',
    event_version: '1.0',
    create_time: '2026-10-02T08:30:00.000Z',
    resource_type: eventType.includes('REFUNDED') ? 'refund' : 'capture',
    event_type: eventType,
    summary: 'Esemény',
    resource,
  })
}

function order(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: ORDER_ID,
    status: 'COMPLETED',
    payer: {
      name: { given_name: 'Éva', surname: 'Kovács' },
      email_address: 'eva@example.hu',
      address: { country_code: 'HU' },
    },
    purchase_units: [
      {
        reference_id: 'default',
        custom_id: 'WEB-1001',
        amount: {
          currency_code: 'HUF',
          value: '3023',
          breakdown: {
            item_total: { currency_code: 'HUF', value: '1633' },
            tax_total: { currency_code: 'HUF', value: '400' },
            shipping: { currency_code: 'HUF', value: '990' },
          },
        },
        items: [
          {
            name: 'Kávé',
            quantity: '2',
            unit_amount: { currency_code: 'HUF', value: '700' },
            tax: { currency_code: 'HUF', value: '190' },
            sku: 'KAVE',
          },
          {
            name: 'Kifli',
            quantity: '1',
            unit_amount: { currency_code: 'HUF', value: '233' },
            tax: { currency_code: 'HUF', value: '20' },
          },
        ],
        shipping: {
          name: { full_name: 'Kovács Éva' },
          address: {
            address_line_1: 'Fő utca 1.',
            admin_area_2: 'Budapest',
            postal_code: '1111',
            country_code: 'HU',
          },
        },
      },
    ],
    ...overrides,
  }
}

function paypalServer(
  options: {
    readonly verification?: string
    readonly order?: Record<string, unknown>
    readonly capture?: Record<string, unknown>
    readonly tokenStatus?: number
  } = {},
) {
  let tokens = 0
  return routedFetch([
    [
      /\/v1\/oauth2\/token$/,
      () => {
        tokens += 1
        return options.tokenStatus
          ? jsonResponse(
              { error: 'invalid_client', error_description: 'Rossz kliens' },
              options.tokenStatus,
            )
          : jsonResponse({
              access_token: `token-${tokens}`,
              expires_in: 32_400,
              token_type: 'Bearer',
            })
      },
    ],
    [
      /verify-webhook-signature$/,
      () => jsonResponse({ verification_status: options.verification ?? 'SUCCESS' }),
    ],
    [/\/v2\/checkout\/orders\//, () => jsonResponse(options.order ?? order())],
    [/\/v2\/payments\/captures\//, () => jsonResponse(options.capture ?? captureResource())],
  ])
}

function bodies(requests: readonly RecordedRequest[], pattern: RegExp): string[] {
  return requests.filter((request) => pattern.test(request.url)).map((request) => request.body)
}

describe('payPalApi', () => {
  test('client credentials tokent kér Basic hitelesítéssel, és gyorsítótárazza', async () => {
    const server = paypalServer()
    const api = payPalApi({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, fetch: server.fetch })
    await api.get(`/v2/checkout/orders/${ORDER_ID}`)
    await api.get(`/v2/payments/captures/${CAPTURE_ID}`)
    const tokenRequests = server.requests.filter((request) => request.url.endsWith('/oauth2/token'))
    expect(tokenRequests).toHaveLength(1)
    expect(tokenRequests[0]?.headers.get('authorization')).toBe(
      `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
    )
    expect(tokenRequests[0]?.body).toBe('grant_type=client_credentials')
    expect(server.requests[1]?.headers.get('authorization')).toBe('Bearer token-1')
    expect(server.requests[2]?.headers.get('authorization')).toBe('Bearer token-1')
  })

  test('lejárt tokennél újat kér', async () => {
    let clock = 0
    const server = paypalServer()
    const api = payPalApi({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      fetch: server.fetch,
      now: () => clock,
    })
    await api.get('/v2/checkout/orders/A')
    clock = 32_400_000
    await api.get('/v2/checkout/orders/B')
    expect(server.requests.filter((request) => request.url.endsWith('/oauth2/token'))).toHaveLength(
      2,
    )
  })

  test('401-es válasznál egyszer frissíti a tokent és megismétli a kérést', async () => {
    let calls = 0
    const server = routedFetch([
      [/oauth2\/token$/, () => jsonResponse({ access_token: `t${calls}`, expires_in: 3600 })],
      [
        /orders/,
        () => {
          calls += 1
          return calls === 1
            ? jsonResponse({ name: 'AUTHENTICATION_FAILURE' }, 401)
            : jsonResponse(order())
        },
      ],
    ])
    const api = payPalApi({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, fetch: server.fetch })
    await expect(api.get('/v2/checkout/orders/A')).resolves.toMatchObject({ id: ORDER_ID })
    expect(server.requests.filter((request) => request.url.endsWith('/oauth2/token'))).toHaveLength(
      2,
    )
  })

  test('a sandbox URL-t használja, és a hibák részleteit továbbadja', async () => {
    const server = paypalServer({ tokenStatus: 401 })
    const api = payPalApi({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      sandbox: true,
      fetch: server.fetch,
    })
    await expect(api.get('/v2/checkout/orders/A')).rejects.toMatchObject({
      name: 'PaymentProviderError',
      status: 401,
      message: expect.stringContaining('Rossz kliens'),
    })
    expect(server.requests[0]?.url).toBe(`${PAYPAL_SANDBOX_API_URL}/v1/oauth2/token`)
  })

  test('access_token nélküli válaszra és hálózati hibára PaymentProviderError-t dob', async () => {
    const noToken = routedFetch([[/./, () => jsonResponse({ expires_in: 3600 })]])
    await expect(
      payPalApi({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, fetch: noToken.fetch }).get(
        '/x',
      ),
    ).rejects.toBeInstanceOf(PaymentProviderError)
    const offline = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    await expect(
      payPalApi({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, fetch: offline }).get('/x'),
    ).rejects.toBeInstanceOf(PaymentProviderError)
  })

  test('hiányzó kliensadatokra TypeError-t dob', () => {
    expect(() => payPalApi({ clientId: '', clientSecret: CLIENT_SECRET })).toThrow(TypeError)
    expect(() => payPalApi({ clientId: CLIENT_ID, clientSecret: ' ' })).toThrow(TypeError)
  })
})

describe('verifyPayPalWebhook', () => {
  test('a nyers eseményt változatlanul ágyazza be az ellenőrző kérésbe', async () => {
    const server = paypalServer()
    const api = payPalApi({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, fetch: server.fetch })
    const payload =
      '{"id":"WH-1","event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"amount":{"value":"10.50"},"note":"\\u00e1rv\\u00edz"}}'

    await verifyPayPalWebhook(payload, new Headers(TRANSMISSION), WEBHOOK_ID, api)

    const [body] = bodies(server.requests, /verify-webhook-signature$/)
    expect(body).toContain(`"webhook_event":${payload}}`)
    expect(JSON.parse(body ?? '{}')).toMatchObject({
      auth_algo: 'SHA256withRSA',
      cert_url: TRANSMISSION['paypal-cert-url'],
      transmission_id: TRANSMISSION['paypal-transmission-id'],
      transmission_sig: TRANSMISSION['paypal-transmission-sig'],
      transmission_time: TRANSMISSION['paypal-transmission-time'],
      webhook_id: WEBHOOK_ID,
    })
  })

  test('FAILURE eredményre invalid_signature hibát dob', async () => {
    const server = paypalServer({ verification: 'FAILURE' })
    const api = payPalApi({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, fetch: server.fetch })
    await expect(
      verifyPayPalWebhook('{"id":"x"}', new Headers(TRANSMISSION), WEBHOOK_ID, api),
    ).rejects.toMatchObject({ reason: 'invalid_signature', provider: 'paypal' })
  })

  test('hiányzó fejlécekre és nem JSON törzsre hívás nélkül hibát dob', async () => {
    const server = paypalServer()
    const api = payPalApi({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, fetch: server.fetch })
    await expect(verifyPayPalWebhook('{}', new Headers(), WEBHOOK_ID, api)).rejects.toMatchObject({
      reason: 'missing_signature',
    })
    await expect(
      verifyPayPalWebhook('{"a":1}]', new Headers(TRANSMISSION), WEBHOOK_ID, api),
    ).rejects.toMatchObject({ reason: 'invalid_payload' })
    expect(server.requests).toHaveLength(0)
  })

  test('a fejlécek kiolvasása kis- és nagybetűtől független', () => {
    const upper = new Headers(
      Object.fromEntries(
        Object.entries(TRANSMISSION).map(([key, value]) => [key.toUpperCase(), value]),
      ),
    )
    expect(payPalTransmission(upper)?.authAlgo).toBe('SHA256withRSA')
    expect(payPalTransmission(new Headers({ 'paypal-auth-algo': 'x' }))).toBeUndefined()
  })
})

describe('parsePayPalEvent és azonosító segédek', () => {
  test('kiolvassa az eseményt, hiányos eseményre hibát dob', () => {
    const event = parsePayPalEvent(eventPayload('PAYMENT.CAPTURE.COMPLETED', captureResource()))
    expect(event).toMatchObject({
      eventType: 'PAYMENT.CAPTURE.COMPLETED',
      resourceType: 'capture',
      createTime: '2026-10-02T08:30:00.000Z',
    })
    expect(() => parsePayPalEvent('{"id":"x","event_type":"Y"}')).toThrow(WebhookVerificationError)
  })

  test('a visszatérítés up linkjéből a capture, a capture-ből a rendelés azonosítóját adja', () => {
    expect(payPalCaptureIdOfRefund(refundResource('3023'))).toBe(CAPTURE_ID)
    expect(payPalCaptureIdOfRefund({ links: [{ rel: 'self', href: 'x' }] })).toBeUndefined()
    expect(
      payPalCaptureIdOfRefund({ links: [{ rel: 'up', href: 'https://x/v2/other/1' }] }),
    ).toBeUndefined()
    expect(payPalOrderIdOfCapture(captureResource())).toBe(ORDER_ID)
  })
})

describe('payPalPaymentEvent', () => {
  const completed = parsePayPalEvent(eventPayload('PAYMENT.CAPTURE.COMPLETED', captureResource()))

  test('a teljesült capture-ből tételes, szállítási díjas fizetést készít', () => {
    expect(payPalPaymentEvent(completed, { order: order() })).toMatchObject({
      provider: 'paypal',
      kind: 'paid',
      id: CAPTURE_ID,
      eventId: 'WH-58D329510W468432D-8HN650336L201105X',
      orderRef: 'WEB-1001',
      amount: { value: 3023, currency: 'HUF' },
      paidAt: '2026-10-02T08:29:55Z',
      method: 'PayPal',
      customer: {
        name: 'Kovács Éva',
        email: 'eva@example.hu',
        address: { country: 'HU', zip: '1111', city: 'Budapest', line1: 'Fő utca 1.' },
      },
      items: [
        { name: 'Kávé', quantity: 2, totalGross: 1780, sku: 'KAVE' },
        { name: 'Kifli', quantity: 1, totalGross: 253, sku: undefined },
        { name: 'Szállítási díj', quantity: 1, totalGross: 990 },
      ],
    })
  })

  test('külföldi vevőnél keresztnév elöl, rendelés nélkül nincs tétel', () => {
    const foreign = order({
      payer: {
        name: { given_name: 'John', surname: 'Smith' },
        address: {
          country_code: 'GB',
          address_line_1: '1 Main St',
          admin_area_2: 'London',
          postal_code: 'N1',
        },
      },
    })
    expect(payPalPaymentEvent(completed, { order: foreign })?.customer?.name).toBe('John Smith')
    expect(payPalPaymentEvent(completed)).toMatchObject({ items: undefined, customer: undefined })
  })

  test('kedvezménynél, adó nélküli tételnél, több egységnél vagy más pénznemnél nem ad tételt', () => {
    const units = (order().purchase_units as Record<string, unknown>[])[0] ?? {}
    const amount = units.amount as Record<string, unknown>
    const breakdown = amount.breakdown as Record<string, unknown>
    const withDiscount = order({
      purchase_units: [
        {
          ...units,
          amount: {
            ...amount,
            breakdown: { ...breakdown, discount: { currency_code: 'HUF', value: '100' } },
          },
        },
      ],
    })
    expect(payPalPaymentEvent(completed, { order: withDiscount })?.items).toBeUndefined()
    const untaxed = order({
      purchase_units: [
        {
          ...units,
          items: [
            { name: 'X', quantity: '1', unit_amount: { currency_code: 'HUF', value: '1633' } },
          ],
        },
      ],
    })
    expect(payPalPaymentEvent(completed, { order: untaxed })?.items).toBeUndefined()
    expect(
      payPalPaymentEvent(completed, { order: order({ purchase_units: [units, units] }) })?.items,
    ).toBeUndefined()
    const otherCurrency = order({
      purchase_units: [
        {
          ...units,
          amount: {
            ...amount,
            breakdown: { ...breakdown, shipping: { currency_code: 'EUR', value: '2' } },
          },
        },
      ],
    })
    expect(payPalPaymentEvent(completed, { order: otherCurrency })?.items).toBeUndefined()
  })

  test('a nem COMPLETED capture-t other-ként, a sikertelent failed-ként jelöli', () => {
    const pendingInCompleted = parsePayPalEvent(
      eventPayload('PAYMENT.CAPTURE.COMPLETED', captureResource({ status: 'PENDING' })),
    )
    expect(payPalPaymentEvent(pendingInCompleted)?.kind).toBe('other')
    for (const type of ['PAYMENT.CAPTURE.DENIED', 'PAYMENT.CAPTURE.DECLINED']) {
      expect(
        payPalPaymentEvent(parsePayPalEvent(eventPayload(type, captureResource())))?.kind,
      ).toBe('failed')
    }
    expect(
      payPalPaymentEvent(
        parsePayPalEvent(eventPayload('PAYMENT.CAPTURE.PENDING', captureResource())),
      )?.kind,
    ).toBe('other')
  })

  test('egyetlen teljes visszatérítésből refunded eseményt ad', () => {
    const event = parsePayPalEvent(eventPayload('PAYMENT.CAPTURE.REFUNDED', refundResource('3023')))
    expect(payPalPaymentEvent(event, { capture: captureResource() })).toMatchObject({
      kind: 'refunded',
      id: CAPTURE_ID,
      amount: { value: 3023, currency: 'HUF' },
      refundedAmount: { value: 3023, currency: 'HUF' },
      orderRef: 'WEB-1001',
      paidAt: '2026-10-03T08:00:00Z',
    })
  })

  test('részleges, capture nélküli vagy függő visszatérítést nem jelöl teljesnek', () => {
    const partial = parsePayPalEvent(
      eventPayload('PAYMENT.CAPTURE.REFUNDED', refundResource('1000')),
    )
    expect(payPalPaymentEvent(partial, { capture: captureResource() })?.kind).toBe(
      'partially-refunded',
    )
    const full = parsePayPalEvent(eventPayload('PAYMENT.CAPTURE.REFUNDED', refundResource('3023')))
    expect(payPalPaymentEvent(full)?.kind).toBe('partially-refunded')
    expect(payPalPaymentEvent(full, { capture: captureResource({ id: 'MASIK' }) })?.kind).toBe(
      'partially-refunded',
    )
    const pending = parsePayPalEvent(
      eventPayload('PAYMENT.CAPTURE.REFUNDED', refundResource('3023', { status: 'PENDING' })),
    )
    expect(payPalPaymentEvent(pending, { capture: captureResource() })?.kind).toBe('other')
  })

  test('a visszatérítés összegét használja, ha nincs összesített visszatérített összeg', () => {
    const event = parsePayPalEvent(
      eventPayload(
        'PAYMENT.CAPTURE.REFUNDED',
        refundResource('500', { seller_payable_breakdown: undefined, custom_id: 'R-1' }),
      ),
    )
    expect(payPalPaymentEvent(event)).toMatchObject({
      refundedAmount: { value: 500, currency: 'HUF' },
      orderRef: 'R-1',
    })
  })

  test('capture azonosító nélküli eseményekre PaymentProviderError-t dob', () => {
    const noUp = parsePayPalEvent(
      eventPayload('PAYMENT.CAPTURE.REFUNDED', refundResource('1', { links: [] })),
    )
    expect(() => payPalPaymentEvent(noUp)).toThrow(PaymentProviderError)
    const noId = parsePayPalEvent(
      eventPayload('PAYMENT.CAPTURE.COMPLETED', captureResource({ id: undefined })),
    )
    expect(() => payPalPaymentEvent(noId)).toThrow(PaymentProviderError)
  })

  test('az ismeretlen eseményt figyelmen kívül hagyja', () => {
    expect(
      payPalPaymentEvent(
        parsePayPalEvent(eventPayload('CHECKOUT.ORDER.APPROVED', { id: ORDER_ID })),
      ),
    ).toBeUndefined()
  })
})

describe('payPalWebhook', () => {
  function handlerWith(
    server: ReturnType<typeof paypalServer>,
    extra: Record<string, unknown> = {},
  ) {
    const onPayment = vi.fn()
    const onError = vi.fn()
    const handler = payPalWebhook({
      webhookId: WEBHOOK_ID,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      fetch: server.fetch,
      onPayment,
      onError,
      ...extra,
    })
    return { handler, onPayment, onError }
  }

  test('ellenőrzés után a rendelést is lekéri, és 200-at ad', async () => {
    const server = paypalServer()
    const { handler, onPayment } = handlerWith(server)
    const response = await handler(
      webhookRequest(eventPayload('PAYMENT.CAPTURE.COMPLETED', captureResource()), TRANSMISSION),
    )
    expect(response.status).toBe(200)
    expect(onPayment).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'paid', items: expect.any(Array) }),
    )
    expect(
      server.requests.some((request) => request.url.endsWith(`/v2/checkout/orders/${ORDER_ID}`)),
    ).toBe(true)
  })

  test('fetchOrder: false mellett nem kéri le a rendelést', async () => {
    const server = paypalServer()
    const { handler, onPayment } = handlerWith(server, { fetchOrder: false })
    await handler(
      webhookRequest(eventPayload('PAYMENT.CAPTURE.COMPLETED', captureResource()), TRANSMISSION),
    )
    expect(server.requests.some((request) => request.url.includes('/v2/checkout/orders/'))).toBe(
      false,
    )
    expect(onPayment.mock.calls[0]?.[0]?.items).toBeUndefined()
  })

  test('rendelésazonosító nélküli capture-nél nem kér le rendelést', async () => {
    const server = paypalServer()
    const { handler } = handlerWith(server)
    await handler(
      webhookRequest(
        eventPayload(
          'PAYMENT.CAPTURE.COMPLETED',
          captureResource({ supplementary_data: undefined }),
        ),
        TRANSMISSION,
      ),
    )
    expect(server.requests.some((request) => request.url.includes('/v2/checkout/orders/'))).toBe(
      false,
    )
  })

  test('visszatérítésnél a capture-t kéri le a teljesség eldöntéséhez', async () => {
    const server = paypalServer()
    const { handler, onPayment } = handlerWith(server)
    await handler(
      webhookRequest(
        eventPayload('PAYMENT.CAPTURE.REFUNDED', refundResource('3023')),
        TRANSMISSION,
      ),
    )
    expect(
      server.requests.some((request) =>
        request.url.endsWith(`/v2/payments/captures/${CAPTURE_ID}`),
      ),
    ).toBe(true)
    expect(onPayment).toHaveBeenCalledWith(expect.objectContaining({ kind: 'refunded' }))
  })

  test('up link nélküli visszatérítésnél nem kér le capture-t, és 500-at ad', async () => {
    const server = paypalServer()
    const { handler, onError } = handlerWith(server)
    const response = await handler(
      webhookRequest(
        eventPayload('PAYMENT.CAPTURE.REFUNDED', refundResource('1', { links: [] })),
        TRANSMISSION,
      ),
    )
    expect(response.status).toBe(500)
    expect(onError).toHaveBeenCalledWith(expect.any(PaymentProviderError))
  })

  test('nem releváns eseményre 200-at ad onPayment nélkül, hamisra 400-at', async () => {
    const server = paypalServer()
    const { handler, onPayment } = handlerWith(server)
    expect(
      (
        await handler(
          webhookRequest(eventPayload('CHECKOUT.ORDER.APPROVED', { id: ORDER_ID }), TRANSMISSION),
        )
      ).status,
    ).toBe(200)
    const failing = handlerWith(paypalServer({ verification: 'FAILURE' }))
    expect(
      (
        await failing.handler(
          webhookRequest(
            eventPayload('PAYMENT.CAPTURE.COMPLETED', captureResource()),
            TRANSMISSION,
          ),
        )
      ).status,
    ).toBe(400)
    expect(onPayment).not.toHaveBeenCalled()
    expect(failing.onPayment).not.toHaveBeenCalled()
  })

  test('webhookId nélkül létrehozáskor TypeError-t dob', () => {
    expect(() =>
      payPalWebhook({
        webhookId: '',
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
        onPayment: vi.fn(),
      }),
    ).toThrow(TypeError)
  })
})
