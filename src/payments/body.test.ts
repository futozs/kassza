import { describe, expect, test } from 'vitest'
import { DEFAULT_MAX_WEBHOOK_BYTES, parseJsonObject, plainResponse, readRawBody } from './body'
import { WebhookVerificationError } from './errors'

function streamOf(chunks: readonly string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

describe('readRawBody', () => {
  test('a nyers törzset változatlanul, UTF-8-ként adja vissza', async () => {
    const body = '{"név":"Kovács Éva","összeg":1000}'
    const request = new Request('https://example.hu/webhook', { method: 'POST', body })
    expect(await readRawBody(request, 'stripe')).toBe(body)
  })

  test('több darabban érkező törzset is összerak', async () => {
    const request = new Request('https://example.hu/webhook', {
      method: 'POST',
      body: streamOf(['{"a":', '1,"b"', ':"ő"}']),
      duplex: 'half',
    } as RequestInit)
    expect(await readRawBody(request, 'stripe')).toBe('{"a":1,"b":"ő"}')
  })

  test('üres törzsre üres stringet ad', async () => {
    const request = new Request('https://example.hu/webhook', { method: 'POST' })
    expect(await readRawBody(request, 'paypal')).toBe('')
  })

  test('a Content-Length alapján már olvasás előtt elutasítja a túl nagy törzset', async () => {
    const request = new Request('https://example.hu/webhook', {
      method: 'POST',
      body: 'x',
      headers: { 'content-length': String(DEFAULT_MAX_WEBHOOK_BYTES + 1) },
    })
    await expect(readRawBody(request, 'stripe')).rejects.toMatchObject({
      name: 'WebhookVerificationError',
      reason: 'payload_too_large',
      provider: 'stripe',
    })
  })

  test('olvasás közben is leállítja a megadott méretnél nagyobb törzset', async () => {
    const request = new Request('https://example.hu/webhook', {
      method: 'POST',
      body: streamOf(['12345', '67890']),
      duplex: 'half',
    } as RequestInit)
    await expect(readRawBody(request, 'barion', 8)).rejects.toBeInstanceOf(WebhookVerificationError)
  })

  test('a pontosan megengedett méretű törzset még elfogadja', async () => {
    const request = new Request('https://example.hu/webhook', { method: 'POST', body: '12345678' })
    expect(await readRawBody(request, 'barion', 8)).toBe('12345678')
  })
})

describe('parseJsonObject', () => {
  test('JSON objektumot ad vissza', () => {
    expect(parseJsonObject('stripe', '{"id":"evt_1"}')).toEqual({ id: 'evt_1' })
  })

  test('érvénytelen JSON-ra invalid_payload hibát dob', () => {
    expect(() => parseJsonObject('stripe', '{nem json')).toThrow(WebhookVerificationError)
    try {
      parseJsonObject('revolut', '{nem json')
    } catch (error) {
      expect(error).toMatchObject({ reason: 'invalid_payload', provider: 'revolut' })
    }
  })

  test('tömbre, nullra és primitívre is hibát dob', () => {
    for (const payload of ['[]', 'null', '42', '"szöveg"']) {
      expect(() => parseJsonObject('paypal', payload)).toThrow(WebhookVerificationError)
    }
  })
})

describe('plainResponse', () => {
  test('UTF-8 szöveges választ ad a megadott státusszal', async () => {
    const response = plainResponse(400, 'Hibás aláírás')
    expect(response.status).toBe(400)
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    expect(await response.text()).toBe('Hibás aláírás')
  })
})
