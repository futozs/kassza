import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { hmacHex } from '../core/crypto'
import { stripeWebhook } from '../payments/stripe'
import {
  NodeBodyError,
  type NodeRequestLike,
  type NodeResponseLike,
  toNodeHandler,
  toWebRequest,
  writeWebResponse,
} from './index'

type Listener = (request: IncomingMessage, response: ServerResponse) => void

const servers: { close(): void }[] = []

afterEach(() => {
  for (const server of servers.splice(0)) server.close()
  vi.restoreAllMocks()
})

async function serve(listener: Listener): Promise<string> {
  const server = createServer(listener)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

function fakeResponse(): NodeResponseLike & {
  readonly headers: Map<string, string | readonly string[]>
  body: Uint8Array | undefined
} {
  const headers = new Map<string, string | readonly string[]>()
  return {
    statusCode: 0,
    headers,
    body: undefined,
    setHeader(name, value) {
      headers.set(name, value)
    },
    end(chunk) {
      this.body = chunk
    },
  }
}

function fakeRequest(overrides: Partial<NodeRequestLike> & { chunks?: string[] }): NodeRequestLike {
  const chunks = overrides.chunks ?? []
  return {
    method: 'POST',
    url: '/hook',
    headers: { host: 'shop.hu' },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield new TextEncoder().encode(chunk)
    },
    ...overrides,
  }
}

describe('toNodeHandler valódi node:http szerverrel', () => {
  test('a nyers törzset, a fejléceket és a query-t változatlanul adja át, a választ visszaírja', async () => {
    const seen: { method: string; url: string; body: string; header: string | null }[] = []
    const url = await serve(
      toNodeHandler(async (request) => {
        seen.push({
          method: request.method,
          url: request.url,
          body: await request.text(),
          header: request.headers.get('x-signature'),
        })
        const headers = new Headers({ 'content-type': 'application/json', 'x-kassza': '1' })
        headers.append('set-cookie', 'a=1')
        headers.append('set-cookie', 'b=2')
        return new Response('{"ok":true}', { status: 201, headers })
      }),
    )

    const response = await fetch(`${url}/webhooks/barion?paymentId=abc123`, {
      method: 'POST',
      headers: { 'x-signature': 'aláírás', 'content-type': 'application/json' },
      body: '{"amount": 1000, "név": "Éva"}',
    })

    expect(response.status).toBe(201)
    expect(await response.text()).toBe('{"ok":true}')
    expect(response.headers.get('x-kassza')).toBe('1')
    expect(response.headers.getSetCookie()).toEqual(['a=1', 'b=2'])
    expect(seen).toEqual([
      {
        method: 'POST',
        url: expect.stringMatching(
          /^http:\/\/127\.0\.0\.1:\d+\/webhooks\/barion\?paymentId=abc123$/,
        ),
        body: '{"amount": 1000, "név": "Éva"}',
        header: 'aláírás',
      },
    ])
  })

  test('egy valódi, aláírt Stripe webhook a Node adapteren át is ellenőrizhető', async () => {
    const secret = 'whsec_node'
    const now = 1_790_000_000
    const payload = JSON.stringify({
      id: 'evt_node',
      object: 'event',
      type: 'checkout.session.completed',
      created: now,
      livemode: false,
      data: {
        object: {
          id: 'cs_node',
          object: 'checkout.session',
          payment_status: 'paid',
          amount_total: 1000,
          currency: 'huf',
        },
      },
    })
    const onPayment = vi.fn()
    const url = await serve(
      toNodeHandler(stripeWebhook({ secret, now: () => now * 1000, onPayment })),
    )
    const signature = `t=${now},v1=${await hmacHex('SHA-256', secret, `${now}.${payload}`)}`

    const ok = await fetch(url, {
      method: 'POST',
      headers: { 'stripe-signature': signature },
      body: payload,
    })
    const tampered = await fetch(url, {
      method: 'POST',
      headers: { 'stripe-signature': signature },
      body: `${payload} `,
    })

    expect(ok.status).toBe(200)
    expect(tampered.status).toBe(400)
    expect(onPayment).toHaveBeenCalledOnce()
  })

  test('a kezelő hibájára 500-at ad, és az onError-nak jelez', async () => {
    const onError = vi.fn()
    const url = await serve(
      toNodeHandler(
        async () => {
          throw new Error('váratlan')
        },
        { onError },
      ),
    )
    const response = await fetch(url, { method: 'POST', body: 'x' })
    expect(response.status).toBe(500)
    expect(await response.text()).toBe('A kérés feldolgozása nem sikerült.')
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'váratlan' }))
  })
})

describe('toWebRequest middleware-ek után', () => {
  test('az express.raw() Bufferét és a NestJS rawBody-t használja', async () => {
    const fromRaw = toWebRequest(fakeRequest({ body: new TextEncoder().encode('nyers') }))
    const fromNest = toWebRequest(fakeRequest({ body: { parsed: true }, rawBody: 'nest-nyers' }))
    const fromText = toWebRequest(fakeRequest({ body: 'szöveg' }))
    const fromArrayBuffer = toWebRequest(
      fakeRequest({ body: new TextEncoder().encode('ab').buffer }),
    )

    expect(await fromRaw.text()).toBe('nyers')
    expect(await fromNest.text()).toBe('nest-nyers')
    expect(await fromText.text()).toBe('szöveg')
    expect(await fromArrayBuffer.text()).toBe('ab')
  })

  test('az express.json() által feldolgozott törzsnél érthető hibát dob', () => {
    expect(() => toWebRequest(fakeRequest({ body: { amount: 1 } }))).toThrow(NodeBodyError)
    expect(() => toWebRequest(fakeRequest({ body: { amount: 1 } }))).toThrow('express.json()')
  })

  test('az Express 4 express.json() üres {} törzsénél a még olvasatlan streamet használja', async () => {
    const placeholder = toWebRequest(fakeRequest({ body: {}, chunks: ['{"nyers":', '1}'] }))
    const nullPrototype = toWebRequest(fakeRequest({ body: Object.create(null), chunks: ['x'] }))

    expect(await placeholder.text()).toBe('{"nyers":1}')
    expect(await nullPrototype.text()).toBe('x')
    expect(() => toWebRequest(fakeRequest({ body: {}, readableEnded: true }))).toThrow(
      NodeBodyError,
    )
    expect(() => toWebRequest(fakeRequest({ body: [] }))).toThrow(NodeBodyError)
  })

  test('a már elolvasott, továbbadás nélküli törzsnél hibát dob', () => {
    expect(() => toWebRequest(fakeRequest({ readableEnded: true }))).toThrow(NodeBodyError)
  })

  test('GET kérésnél nincs törzs, az URL a host fejlécből és az originalUrl-ből áll', async () => {
    const request = toWebRequest(
      fakeRequest({ method: 'GET', url: '/b', originalUrl: '/api/b?x=1', chunks: ['nem kell'] }),
    )
    expect(request.url).toBe('http://shop.hu/api/b?x=1')
    expect(request.body).toBeNull()
  })

  test('a továbbított protokollt és hostot csak trustProxy esetén veszi figyelembe', () => {
    const headers = {
      host: 'belso:3000',
      'x-forwarded-proto': 'https, http',
      'x-forwarded-host': 'shop.hu',
    }
    expect(toWebRequest(fakeRequest({ method: 'GET', headers })).url).toBe('http://belso:3000/hook')
    expect(toWebRequest(fakeRequest({ method: 'GET', headers }), { trustProxy: true }).url).toBe(
      'https://shop.hu/hook',
    )
    expect(
      toWebRequest(
        fakeRequest({ method: 'GET', headers: {}, url: 'relativ', socket: { encrypted: true } }),
      ).url,
    ).toBe('https://localhost/relativ')
  })

  test('a többértékű fejléceket mind átadja', () => {
    const request = toWebRequest(
      fakeRequest({
        method: 'GET',
        headers: { host: 'a', 'x-multi': ['1', '2'], 'x-none': undefined },
      }),
    )
    expect(request.headers.get('x-multi')).toBe('1, 2')
    expect(request.headers.has('x-none')).toBe(false)
  })

  test('a HTTP/2 pszeudo-fejléceket kihagyja, a hostot az :authority-ből veszi, ha nincs host', () => {
    const request = toWebRequest(
      fakeRequest({
        method: 'GET',
        headers: {
          ':method': 'GET',
          ':path': '/hook',
          ':authority': 'shop.hu:8443',
          ':scheme': 'https',
          'x-egyeb': 'igen',
        },
        socket: { encrypted: true },
      }),
    )
    const withHost = toWebRequest(
      fakeRequest({ method: 'GET', headers: { host: 'host.hu', ':authority': 'masik.hu' } }),
    )

    expect(request.url).toBe('https://shop.hu:8443/hook')
    expect(request.headers.get('x-egyeb')).toBe('igen')
    expect([...request.headers.keys()].some((name) => name.startsWith(':'))).toBe(false)
    expect(withHost.url).toBe('http://host.hu/hook')
  })

  test('sima objektumból (Fastify) is kérést épít, törzs nélkül üresen', async () => {
    const withBody = toWebRequest({
      method: 'POST',
      url: '/hook?x=1',
      headers: { host: 'shop.hu' },
      body: new TextEncoder().encode('fastify'),
    })
    const empty = toWebRequest({ method: 'POST', url: '/hook', headers: { host: 'shop.hu' } })
    expect(await withBody.text()).toBe('fastify')
    expect(withBody.url).toBe('http://shop.hu/hook?x=1')
    expect(await empty.text()).toBe('')
  })

  test('a stream törzset darabonként olvassa, a szöveges darabot is', async () => {
    const request = toWebRequest({
      method: 'POST',
      headers: { host: 'a' },
      async *[Symbol.asyncIterator]() {
        yield 'első,'
        yield new TextEncoder().encode('második')
      },
    })
    expect(await request.text()).toBe('első,második')
  })
})

describe('toNodeHandler next() és válaszírás', () => {
  test('Express next() esetén a hibát továbbadja, és nem ír választ', async () => {
    const next = vi.fn()
    const response = fakeResponse()
    await toNodeHandler(async () => new Response('x'))(
      fakeRequest({ body: { parsed: true } }),
      response,
      next,
    )
    expect(next).toHaveBeenCalledWith(expect.any(NodeBodyError))
    expect(response.statusCode).toBe(0)
  })

  test('ha a fejlécek már elmentek, nem ír újra', async () => {
    const response = { ...fakeResponse(), headersSent: true }
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await toNodeHandler(async () => {
      throw new Error('x')
    })(fakeRequest({}), response)
    expect(response.statusCode).toBe(0)
  })

  test('üres választ törzs nélkül zár le', async () => {
    const response = fakeResponse()
    await writeWebResponse(new Response(null, { status: 204 }), response)
    expect(response.statusCode).toBe(204)
    expect(response.body).toBeUndefined()
  })

  test('a dobó onError sem töri meg a választ', async () => {
    const response = fakeResponse()
    await toNodeHandler(
      async () => {
        throw new Error('x')
      },
      {
        onError: () => {
          throw new Error('rossz logger')
        },
      },
    )(fakeRequest({}), response)
    expect(response.statusCode).toBe(500)
  })
})
