import { afterEach, describe, expect, test, vi } from 'vitest'
import { plainResponse } from './body'
import { PaymentProviderError, WebhookVerificationError } from './errors'
import { respondToWebhook } from './webhook'

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
