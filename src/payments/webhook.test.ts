import { afterEach, describe, expect, test, vi } from 'vitest'
import { hmacHex } from '../core/crypto'
import { memoryStore } from '../core/store'
import type { KasszaWarning } from '../core/warnings'
import { plainResponse } from './body'
import { PaymentProviderError, WebhookVerificationError } from './errors'
import { stripeWebhook } from './stripe'
import type { PaymentEvent } from './types'
import {
  DEFAULT_DEDUPE_TTL_SECONDS,
  deliverPayment,
  respondToWebhook,
  WEBHOOK_DEDUPE_KEY_PREFIX,
  webhookDedupeKey,
} from './webhook'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('respondToWebhook', () => {
  test('sikeres futásnál a futtatott válaszát adja vissza', async () => {
    const response = await respondToWebhook({}, async () => plainResponse(200, 'OK'))
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('OK')
  })

  test('hitelesítési hibára 400-at ad, és nem hívja az onError-t', async () => {
    const onError = vi.fn()
    const response = await respondToWebhook({ onError }, async () => {
      throw new WebhookVerificationError('stripe', 'invalid_signature', 'Rossz aláírás.')
    })
    expect(response.status).toBe(400)
    expect(await response.text()).toBe('Rossz aláírás.')
    expect(onError).not.toHaveBeenCalled()
  })

  test('más hibára 500-at ad, és átadja a hibát az onError-nak', async () => {
    const onError = vi.fn()
    const failure = new PaymentProviderError('barion', 'Nem érhető el.')
    const response = await respondToWebhook({ onError }, async () => {
      throw failure
    })
    expect(response.status).toBe(500)
    expect(onError).toHaveBeenCalledWith(failure)
    expect(await response.text()).not.toContain('Nem érhető el.')
  })

  test('onError nélkül a konzolra naplóz', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const failure = new Error('váratlan')
    const response = await respondToWebhook({}, async () => {
      throw failure
    })
    expect(response.status).toBe(500)
    expect(consoleError).toHaveBeenCalledWith(
      '[kassza] A fizetési webhook feldolgozása nem sikerült.',
      failure,
    )
  })

  test('ha az onError maga dob, akkor is 500-at ad', async () => {
    const response = await respondToWebhook(
      {
        onError: () => {
          throw new Error('a naplózó is hibás')
        },
      },
      async () => {
        throw new Error('eredeti hiba')
      },
    )
    expect(response.status).toBe(500)
  })
})

describe('isWebhookVerificationError', () => {
  test('csak a WebhookVerificationError példányokra igaz', async () => {
    const { isWebhookVerificationError } = await import('./errors')
    expect(
      isWebhookVerificationError(new WebhookVerificationError('paypal', 'missing_signature', 'x')),
    ).toBe(true)
    expect(isWebhookVerificationError(new Error('x'))).toBe(false)
  })

  test('a PaymentProviderError megőrzi a státuszt és az okot', () => {
    const cause = new TypeError('fetch failed')
    const error = new PaymentProviderError('paypal', 'Hiba.', 503, cause)
    expect(error.status).toBe(503)
    expect(error.cause).toBe(cause)
    expect(error.provider).toBe('paypal')
    expect(new PaymentProviderError('paypal', 'Hiba.').cause).toBeUndefined()
  })
})

describe('deliverPayment ismétlés-szűrővel', () => {
  const PAYMENT: PaymentEvent = {
    provider: 'stripe',
    kind: 'paid',
    id: 'cs_1',
    eventId: 'evt_1',
    method: 'bankkártya',
    raw: {},
  }

  test('tároló nélkül mindig feldolgoz', async () => {
    const onPayment = vi.fn()
    expect(await deliverPayment({ onPayment }, PAYMENT)).toBe(true)
    expect(await deliverPayment({ onPayment }, PAYMENT)).toBe(true)
    expect(onPayment).toHaveBeenCalledTimes(2)
  })

  test('a sikeresen feldolgozott eseményt az újraküldéskor átugorja', async () => {
    const dedupe = memoryStore()
    const onPayment = vi.fn()
    const prepare = vi.fn((payment: PaymentEvent) => payment)

    expect(await deliverPayment({ onPayment, dedupe }, PAYMENT, prepare)).toBe(true)
    expect(await deliverPayment({ onPayment, dedupe }, PAYMENT, prepare)).toBe(false)

    expect(onPayment).toHaveBeenCalledOnce()
    expect(prepare).toHaveBeenCalledOnce()
    expect(await dedupe.get(webhookDedupeKey(PAYMENT))).toBe('1')
    expect(webhookDedupeKey(PAYMENT)).toBe(`${WEBHOOK_DEDUPE_KEY_PREFIX}stripe:evt_1`)
  })

  test('ha a feldolgozás elbukik, nem jelöli meg, így az újraküldés újra próbálja', async () => {
    const dedupe = memoryStore()
    const onPayment = vi.fn().mockRejectedValueOnce(new Error('Agent hiba'))

    await expect(deliverPayment({ onPayment, dedupe }, PAYMENT)).rejects.toThrow('Agent hiba')
    expect(await deliverPayment({ onPayment, dedupe }, PAYMENT)).toBe(true)
    expect(onPayment).toHaveBeenCalledTimes(2)
  })

  test('eventId nélküli eseményt mindig feldolgoz', async () => {
    const dedupe = memoryStore()
    const onPayment = vi.fn()
    const payment = { ...PAYMENT, eventId: undefined }
    await deliverPayment({ onPayment, dedupe }, payment)
    await deliverPayment({ onPayment, dedupe }, payment)
    expect(onPayment).toHaveBeenCalledTimes(2)
  })

  test('a beállított TTL-lel jelöl, az alapértelmezett 7 nap', async () => {
    const dedupe = memoryStore()
    const set = vi.spyOn(dedupe, 'set')
    await deliverPayment({ onPayment: vi.fn(), dedupe }, PAYMENT)
    await deliverPayment(
      { onPayment: vi.fn(), dedupe, dedupeTtlSeconds: 60.5 },
      { ...PAYMENT, eventId: 'evt_2' },
    )
    expect(set.mock.calls.map((call) => call[2])).toEqual([DEFAULT_DEDUPE_TTL_SECONDS, 61])
    expect(DEFAULT_DEDUPE_TTL_SECONDS).toBe(604_800)
    await expect(
      deliverPayment({ onPayment: vi.fn(), dedupe, dedupeTtlSeconds: 0 }, PAYMENT),
    ).rejects.toThrow(TypeError)
  })

  test('a tároló hibája figyelmeztetés, a feldolgozás megtörténik', async () => {
    const warnings: KasszaWarning[] = []
    const broken = {
      get: () => Promise.reject(new Error('le')),
      set: () => Promise.reject(new Error('le')),
      delete: () => undefined,
    }
    const onPayment = vi.fn()
    expect(
      await deliverPayment(
        { onPayment, dedupe: broken, onWarning: (warning) => warnings.push(warning) },
        PAYMENT,
      ),
    ).toBe(true)
    expect(onPayment).toHaveBeenCalledOnce()
    expect(warnings.map((warning) => [warning.kind, warning.operation])).toEqual([
      ['dedupe', 'get'],
      ['dedupe', 'set'],
    ])
  })

  test('onWarning nélkül a tárolóhibát a konzolra írja', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await deliverPayment(
      {
        onPayment: vi.fn(),
        dedupe: { get: () => Promise.reject(new Error('le')), set: () => {}, delete: () => {} },
      },
      PAYMENT,
    )
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('stripeWebhook dedupe', () => {
  test('ugyanaz az esemény másodszor nem hívja az onPayment-et, de 200-at ad', async () => {
    const secret = 'whsec_dedupe'
    const nowSeconds = 1_790_000_000
    const payload = JSON.stringify({
      id: 'evt_dedupe',
      object: 'event',
      type: 'checkout.session.completed',
      created: nowSeconds,
      livemode: false,
      data: {
        object: {
          id: 'cs_dedupe',
          object: 'checkout.session',
          payment_status: 'paid',
          amount_total: 1000,
          currency: 'huf',
        },
      },
    })
    const signed = `t=${nowSeconds},v1=${await hmacHex('SHA-256', secret, `${nowSeconds}.${payload}`)}`
    const onPayment = vi.fn()
    const handler = stripeWebhook({
      secret,
      now: () => nowSeconds * 1000,
      onPayment,
      dedupe: memoryStore(),
    })
    const request = () =>
      new Request('https://shop.hu/webhook', {
        method: 'POST',
        body: payload,
        headers: { 'stripe-signature': signed },
      })

    expect((await handler(request())).status).toBe(200)
    expect((await handler(request())).status).toBe(200)
    expect(onPayment).toHaveBeenCalledOnce()
  })
})
