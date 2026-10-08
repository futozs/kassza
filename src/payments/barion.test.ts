import { describe, expect, test, vi } from 'vitest'
import { jsonResponse, routedFetch, webhookRequest } from '../../tests/payment-fetch'
import {
  BARION_SANDBOX_API_URL,
  barionPaymentEvent,
  barionPaymentId,
  barionWebhook,
  fetchBarionPaymentState,
} from './barion'
import { PaymentProviderError } from './errors'

const POS_KEY = 'barion-pos-kulcs'
const PAYMENT_ID = 'b6e8c5a0c8a5ed11bc2b001dd8b71cc5'

function shopTransaction(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    TransactionId: 'tr-shop-1',
    POSTransactionId: 'WEB-1001-1',
    TransactionTime: '2026-10-02T10:00:05',
    Total: 3023,
    Currency: 'HUF',
    Payer: {
      Name: { LoginName: 'eva@example.hu', FirstName: 'Éva', LastName: 'Kovács' },
      Email: 'eva@example.hu',
    },
    Payee: { Name: { LoginName: 'bolt@example.hu' }, Email: 'bolt@example.hu' },
    Status: 'Succeeded',
    TransactionType: 'CardPayment',
    Items: [
      {
        Name: 'Kávé',
        Description: 'Pörkölt kávé',
        Quantity: 2,
        Unit: 'db',
        UnitPrice: 890,
        ItemTotal: 1780,
        SKU: 'KAVE',
      },
      { Name: 'Kifli', Quantity: 1, Unit: 'db', UnitPrice: 253, ItemTotal: 1243 },
    ],
    ...overrides,
  }
}

function paymentState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    PaymentId: PAYMENT_ID,
    PaymentRequestId: 'REQ-1001',
    OrderNumber: 'WEB-1001',
    POSId: 'pos-1',
    Status: 'Succeeded',
    PaymentType: 'Immediate',
    FundingSource: 'Bankcard',
    CompletedAt: '2026-10-02T10:00:07',
    Total: 3023,
    Currency: 'HUF',
    Transactions: [
      shopTransaction(),
      {
        TransactionId: 'tr-fee',
        POSTransactionId: 'WEB-1001-1',
        Total: 45,
        Currency: 'HUF',
        Status: 'Succeeded',
        TransactionType: 'CardProcessingFee',
        Items: [{ Name: 'Díj', Quantity: 1, ItemTotal: 45 }],
      },
    ],
    Errors: [],
    ...overrides,
  }
}

function refund(total: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    TransactionId: `tr-refund-${total}`,
    POSTransactionId: 'WEB-1001-1',
    Total: -total,
    Currency: 'HUF',
    Status: 'Succeeded',
    TransactionType: 'RefundToBankCard',
    RelatedId: 'tr-shop-1',
    Items: [],
    ...overrides,
  }
}

describe('barionPaymentId', () => {
  test('a query stringből, a form és a JSON törzsből is kiolvassa', () => {
    expect(barionPaymentId(`https://bolt.example.hu/barion?paymentId=${PAYMENT_ID}`)).toBe(
      PAYMENT_ID,
    )
    expect(barionPaymentId(`https://bolt.example.hu/barion?PaymentId=${PAYMENT_ID}`)).toBe(
      PAYMENT_ID,
    )
    expect(
      barionPaymentId(
        'https://bolt.example.hu/barion',
        `paymentId=${PAYMENT_ID}`,
        'application/x-www-form-urlencoded',
      ),
    ).toBe(PAYMENT_ID)
    expect(
      barionPaymentId('https://bolt.example.hu/barion', `{"PaymentId":"${PAYMENT_ID}"}`, null),
    ).toBe(PAYMENT_ID)
  })

  test('hiányzó vagy hibás törzsnél undefined-ot ad', () => {
    expect(barionPaymentId('https://bolt.example.hu/barion')).toBeUndefined()
    expect(
      barionPaymentId('https://bolt.example.hu/barion', '{nem json', 'application/json'),
    ).toBeUndefined()
    expect(barionPaymentId('https://bolt.example.hu/barion', 'masik=1')).toBeUndefined()
  })
})

describe('fetchBarionPaymentState', () => {
  test('a v4 PaymentState végpontot hívja x-pos-key fejléccel', async () => {
    const api = routedFetch([[/PaymentState$/, () => jsonResponse(paymentState())]])
    const state = await fetchBarionPaymentState(PAYMENT_ID, { posKey: POS_KEY, fetch: api.fetch })
    expect(state.PaymentId).toBe(PAYMENT_ID)
    expect(api.requests[0]?.url).toBe(
      `https://api.barion.com/v4/Payment/${PAYMENT_ID}/PaymentState`,
    )
    expect(api.requests[0]?.headers.get('x-pos-key')).toBe(POS_KEY)
    expect(api.requests[0]?.method).toBe('GET')
  })

  test('a teszt környezetet és az egyedi URL-t is kezeli', async () => {
    const api = routedFetch([[/./, () => jsonResponse(paymentState())]])
    await fetchBarionPaymentState(PAYMENT_ID, { posKey: POS_KEY, sandbox: true, fetch: api.fetch })
    await fetchBarionPaymentState(PAYMENT_ID, {
      posKey: POS_KEY,
      apiUrl: 'http://localhost:9000/',
      fetch: api.fetch,
    })
    expect(api.requests.map((request) => request.url)).toEqual([
      `${BARION_SANDBOX_API_URL}/v4/Payment/${PAYMENT_ID}/PaymentState`,
      `http://localhost:9000/v4/Payment/${PAYMENT_ID}/PaymentState`,
    ])
  })

  test('a Barion Errors listáját a hibaüzenetbe teszi', async () => {
    const api = routedFetch([
      [
        /./,
        () =>
          jsonResponse(
            {
              Errors: [
                { ErrorCode: 'AuthenticationFailed', Title: 'Hibás POSKey', Description: 'x' },
              ],
            },
            400,
          ),
      ],
    ])
    await expect(
      fetchBarionPaymentState(PAYMENT_ID, { posKey: POS_KEY, fetch: api.fetch }),
    ).rejects.toMatchObject({
      name: 'PaymentProviderError',
      status: 400,
      message: expect.stringContaining('AuthenticationFailed: Hibás POSKey: x'),
    })
  })

  test('200-as válasz hibalistával, nem JSON válasz és hálózati hiba is hibát dob', async () => {
    const withErrors = routedFetch([[/./, () => jsonResponse({ Errors: [{}] })]])
    await expect(
      fetchBarionPaymentState(PAYMENT_ID, { posKey: POS_KEY, fetch: withErrors.fetch }),
    ).rejects.toMatchObject({ message: expect.stringContaining('ismeretlen hiba') })
    const notJson = routedFetch([[/./, () => new Response('<html>')]])
    await expect(
      fetchBarionPaymentState(PAYMENT_ID, { posKey: POS_KEY, fetch: notJson.fetch }),
    ).rejects.toBeInstanceOf(PaymentProviderError)
    const offline = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    await expect(
      fetchBarionPaymentState(PAYMENT_ID, { posKey: POS_KEY, fetch: offline }),
    ).rejects.toBeInstanceOf(PaymentProviderError)
  })
})

describe('barionPaymentEvent', () => {
  test('a sikeres fizetésből tételes fizetést készít, a díjtranzakciót kihagyja', () => {
    expect(barionPaymentEvent(paymentState())).toEqual({
      provider: 'barion',
      kind: 'paid',
      id: PAYMENT_ID,
      eventId: `${PAYMENT_ID}:Succeeded:0`,
      eventType: 'Succeeded',
      orderRef: 'WEB-1001',
      amount: { value: 3023, currency: 'HUF' },
      refundedAmount: undefined,
      paidAt: '2026-10-02T10:00:07',
      method: 'bankkártya',
      customer: {
        name: 'Kovács Éva',
        email: 'eva@example.hu',
        phone: undefined,
        isBusiness: undefined,
      },
      items: [
        { name: 'Kávé', quantity: 2, totalGross: 1780, unit: 'db', sku: 'KAVE' },
        { name: 'Kifli', quantity: 1, totalGross: 1243, unit: 'db', sku: undefined },
      ],
      raw: paymentState(),
    })
  })

  test('cégnévnél a cég nevét és az isBusiness jelzést adja', () => {
    const state = paymentState({
      Transactions: [
        shopTransaction({
          Payer: { Name: { OrganizationName: 'Példa Kft.' }, Email: 'x@pelda.hu' },
        }),
      ],
    })
    expect(barionPaymentEvent(state).customer).toMatchObject({
      name: 'Példa Kft.',
      isBusiness: true,
    })
  })

  test('egyetlen teljes visszatérítésből refunded eseményt ad', () => {
    const state = paymentState({ Transactions: [shopTransaction(), refund(3023)] })
    expect(barionPaymentEvent(state)).toMatchObject({
      kind: 'refunded',
      refundedAmount: { value: 3023, currency: 'HUF' },
      eventId: `${PAYMENT_ID}:Succeeded:1`,
    })
  })

  test('a részleges és a több részletben teljes visszatérítést részlegesnek jelöli', () => {
    expect(
      barionPaymentEvent(paymentState({ Transactions: [shopTransaction(), refund(1000)] })).kind,
    ).toBe('partially-refunded')
    expect(
      barionPaymentEvent(
        paymentState({ Transactions: [shopTransaction(), refund(1000), refund(2023)] }),
      ).kind,
    ).toBe('partially-refunded')
  })

  test('a visszatérítéseket időrendben, a korábbi összeggel tételesen átadja', () => {
    const state = paymentState({
      Transactions: [
        shopTransaction(),
        refund(2023, { TransactionTime: '2026-10-04T10:00:00Z' }),
        refund(1000, { TransactionTime: '2026-10-03T10:00:00Z' }),
      ],
    })
    expect(barionPaymentEvent(state).refunds).toEqual([
      {
        id: 'tr-refund-1000',
        amount: { value: 1000, currency: 'HUF' },
        refundedBefore: 0,
        createdAt: '2026-10-03T10:00:00Z',
      },
      {
        id: 'tr-refund-2023',
        amount: { value: 2023, currency: 'HUF' },
        refundedBefore: 1000,
        createdAt: '2026-10-04T10:00:00Z',
      },
    ])
  })

  test('azonosító nélküli visszatérítésnél nem ad tételes listát', () => {
    const state = paymentState({
      Transactions: [
        shopTransaction(),
        refund(1000, { TransactionId: undefined, POSTransactionId: undefined }),
      ],
    })
    expect(barionPaymentEvent(state).refunds).toBeUndefined()
    expect(barionPaymentEvent(paymentState()).refunds).toBeUndefined()
  })

  test('a nem sikeres visszatérítést nem veszi figyelembe', () => {
    const state = paymentState({
      Transactions: [shopTransaction(), refund(3023, { Status: 'Rejected' })],
    })
    expect(barionPaymentEvent(state).kind).toBe('paid')
  })

  test('a sikertelen és a folyamatban lévő állapotokat felismeri', () => {
    for (const status of ['Canceled', 'Failed', 'Expired']) {
      expect(barionPaymentEvent(paymentState({ Status: status, Transactions: [] })).kind).toBe(
        'failed',
      )
    }
    for (const status of ['Prepared', 'Started', 'InProgress', 'Reserved', 'PartiallySucceeded']) {
      expect(barionPaymentEvent(paymentState({ Status: status })).kind).toBe('other')
    }
    expect(barionPaymentEvent(paymentState({ Status: undefined })).kind).toBe('other')
  })

  test('saját tranzakció nélkül a fizetés teljes összegét használja', () => {
    const state = paymentState({ Transactions: [], Total: 5000 })
    expect(barionPaymentEvent(state)).toMatchObject({ amount: { value: 5000 }, items: undefined })
  })

  test('a finanszírozási forrásból fizetési módot választ, az opció felülírja', () => {
    expect(barionPaymentEvent(paymentState({ FundingSource: 'GooglePay' })).method).toBe(
      'bankkártya',
    )
    expect(barionPaymentEvent(paymentState({ FundingSource: 'BankTransfer' })).method).toBe(
      'átutalás',
    )
    expect(barionPaymentEvent(paymentState({ FundingSource: 'Balance' })).method).toBe('Barion')
    expect(barionPaymentEvent(paymentState(), { method: 'Barion kártya' }).method).toBe(
      'Barion kártya',
    )
  })

  test('hiányzó PaymentId-ra és ItemTotal-ra PaymentProviderError-t dob', () => {
    expect(() => barionPaymentEvent(paymentState({ PaymentId: '' }))).toThrow(PaymentProviderError)
    const state = paymentState({ Transactions: [shopTransaction({ Items: [{ Name: 'X' }] })] })
    expect(() => barionPaymentEvent(state)).toThrow(PaymentProviderError)
  })
})

describe('barionWebhook', () => {
  test('a callback után lekérdezi az állapotot, és 200-at ad', async () => {
    const api = routedFetch([[/PaymentState$/, () => jsonResponse(paymentState())]])
    const onPayment = vi.fn()
    const handler = barionWebhook({ posKey: POS_KEY, fetch: api.fetch, onPayment })

    const response = await handler(
      webhookRequest(`paymentId=${PAYMENT_ID}`, {
        'content-type': 'application/x-www-form-urlencoded',
      }),
    )

    expect(response.status).toBe(200)
    expect(onPayment).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'paid', id: PAYMENT_ID }),
    )
  })

  test('kötőjeles azonosítót is elfogad, ha a Barion ugyanazt adja vissza', async () => {
    const dashed = 'b6e8c5a0-c8a5-ed11-bc2b-001dd8b71cc5'
    const api = routedFetch([[/./, () => jsonResponse(paymentState())]])
    const handler = barionWebhook({ posKey: POS_KEY, fetch: api.fetch, onPayment: vi.fn() })
    const response = await handler(
      webhookRequest('', {}, `https://bolt.example.hu/barion?paymentId=${dashed}`),
    )
    expect(response.status).toBe(200)
  })

  test('hiányzó vagy érvénytelen paymentId-ra 400-at ad, lekérdezés nélkül', async () => {
    const api = routedFetch([[/./, () => jsonResponse(paymentState())]])
    const handler = barionWebhook({ posKey: POS_KEY, fetch: api.fetch, onPayment: vi.fn() })
    expect((await handler(webhookRequest(''))).status).toBe(400)
    expect((await handler(webhookRequest('paymentId=../../admin'))).status).toBe(400)
    expect(api.requests).toHaveLength(0)
  })

  test('ha a Barion más fizetést ad vissza, 500-at ad', async () => {
    const api = routedFetch([
      [/./, () => jsonResponse(paymentState({ PaymentId: '00000000000000000000000000000000' }))],
    ])
    const onPayment = vi.fn()
    const onError = vi.fn()
    const handler = barionWebhook({ posKey: POS_KEY, fetch: api.fetch, onPayment, onError })
    expect((await handler(webhookRequest(`paymentId=${PAYMENT_ID}`))).status).toBe(500)
    expect(onPayment).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(expect.any(PaymentProviderError))
  })

  test('POSKey nélkül létrehozáskor TypeError-t dob', () => {
    expect(() => barionWebhook({ posKey: ' ', onPayment: vi.fn() })).toThrow(TypeError)
  })
})
