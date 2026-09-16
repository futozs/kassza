import { describe, expect, test, vi } from 'vitest'
import { SESSION_TTL_SECONDS } from '../core/session'
import { CLOUDFLARE_KV_MIN_TTL_SECONDS, cloudflareKvCookieStore } from './cloudflare-kv'
import { customCookieStore } from './custom'
import { memoryCookieStore } from './index'
import { ioredisCookieStore } from './ioredis'
import { nodeRedisCookieStore } from './node-redis'
import { upstashRedisCookieStore } from './upstash'

class FakeUpstashRedis {
  readonly data = new Map<string, unknown>()
  readonly calls: unknown[][] = []

  async get<TData>(key: string): Promise<TData | null> {
    this.calls.push(['get', key])
    return (this.data.get(key) as TData | undefined) ?? null
  }

  async set<TData>(key: string, value: TData, opts?: { ex: number }): Promise<'OK' | TData | null> {
    this.calls.push(['set', key, value, opts])
    this.data.set(key, value)
    return 'OK'
  }

  async del(...keys: string[]): Promise<number> {
    this.calls.push(['del', ...keys])
    return keys.filter((key) => this.data.delete(key)).length
  }
}

class FakeIoRedis {
  readonly data = new Map<string, string>()
  readonly calls: unknown[][] = []

  async get(key: string): Promise<string | null> {
    this.calls.push(['get', key])
    return this.data.get(key) ?? null
  }

  async set(key: string, value: string | number, secondsToken: 'EX', seconds: number | string) {
    this.calls.push(['set', key, value, secondsToken, seconds])
    this.data.set(key, String(value))
    return 'OK' as const
  }

  async del(...keys: string[]): Promise<number> {
    this.calls.push(['del', ...keys])
    return keys.filter((key) => this.data.delete(key)).length
  }
}

class FakeNodeRedis {
  readonly data = new Map<string, string | Uint8Array>()
  readonly calls: unknown[][] = []

  async get(key: string): Promise<string | Uint8Array | null> {
    this.calls.push(['get', key])
    return this.data.get(key) ?? null
  }

  async set(key: string, value: string | number, options?: { EX?: number }) {
    this.calls.push(['set', key, value, options])
    this.data.set(key, String(value))
    return 'OK' as const
  }

  async del(keys: string | string[]): Promise<number> {
    this.calls.push(['del', keys])
    return [keys].flat().filter((key) => this.data.delete(key)).length
  }
}

class FakeKvNamespace {
  readonly data = new Map<string, string>()
  readonly calls: unknown[][] = []

  async get(key: string, options?: { cacheTtl?: number }): Promise<string | null> {
    this.calls.push(['get', key, options])
    return this.data.get(key) ?? null
  }

  async put(
    key: string,
    value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
    options?: { expiration?: number; expirationTtl?: number },
  ): Promise<void> {
    this.calls.push(['put', key, value, options])
    this.data.set(key, String(value))
  }

  async delete(key: string): Promise<void> {
    this.calls.push(['delete', key])
    this.data.delete(key)
  }
}

const COOKIE = 'JSESSIONID=abc123; other=1'

describe('upstashRedisCookieStore', () => {
  test('set(key, value, { ex }) hívással ír, get/del a pontos kulccsal', async () => {
    const redis = new FakeUpstashRedis()
    const store = upstashRedisCookieStore(redis)

    await store.set('szamlazz:session:1', COOKIE, SESSION_TTL_SECONDS)
    expect(await store.get('szamlazz:session:1')).toBe(COOKIE)
    await store.delete('szamlazz:session:1')

    expect(redis.calls).toEqual([
      ['set', 'szamlazz:session:1', COOKIE, { ex: 5100 }],
      ['get', 'szamlazz:session:1'],
      ['del', 'szamlazz:session:1'],
    ])
    expect(await store.get('szamlazz:session:1')).toBeUndefined()
  })

  test('a prefixet a kulcs elé teszi, a tört TTL-t felfelé kerekíti', async () => {
    const redis = new FakeUpstashRedis()
    const store = upstashRedisCookieStore(redis, { prefix: 'app1:' })

    await store.set('k', COOKIE, 0.2)

    expect(redis.calls[0]).toEqual(['set', 'app1:k', COOKIE, { ex: 1 }])
  })

  test('az automatikusan deszerializált nem string értéket stringgé alakítja', async () => {
    const redis = new FakeUpstashRedis()
    redis.data.set('szam', 12345)
    redis.data.set('bool', true)
    redis.data.set('obj', { a: 1 })
    redis.data.set('ures', '')
    const store = upstashRedisCookieStore(redis)

    expect(await store.get('szam')).toBe('12345')
    expect(await store.get('bool')).toBe('true')
    expect(await store.get('obj')).toBeUndefined()
    expect(await store.get('ures')).toBeUndefined()
  })

  test('alapból hibatűrő, resilient: false esetén dob', async () => {
    const broken = {
      get: () => Promise.reject(new Error('down')),
      set: () => Promise.reject(new Error('down')),
      del: () => Promise.reject(new Error('down')),
    }
    const onError = vi.fn()

    const tolerant = upstashRedisCookieStore(broken, { onError })
    await expect(tolerant.get('k')).resolves.toBeUndefined()
    await expect(tolerant.set('k', 'v', 1)).resolves.toBeUndefined()
    expect(onError).toHaveBeenCalledTimes(2)

    const strict = upstashRedisCookieStore(broken, { resilient: false })
    await expect(strict.get('k')).rejects.toThrow('down')
  })
})

describe('ioredisCookieStore', () => {
  test("set(key, value, 'EX', ttl) hívással ír", async () => {
    const redis = new FakeIoRedis()
    const store = ioredisCookieStore(redis, { prefix: 'p:' })

    await store.set('k', COOKIE, SESSION_TTL_SECONDS)
    expect(await store.get('k')).toBe(COOKIE)
    await store.delete('k')
    expect(await store.get('k')).toBeUndefined()

    expect(redis.calls.slice(0, 3)).toEqual([
      ['set', 'p:k', COOKIE, 'EX', 5100],
      ['get', 'p:k'],
      ['del', 'p:k'],
    ])
  })

  test('nem véges TTL esetén 1 másodperc a minimum', async () => {
    const redis = new FakeIoRedis()
    await ioredisCookieStore(redis).set('k', COOKIE, Number.NaN)

    expect(redis.calls[0]).toEqual(['set', 'k', COOKIE, 'EX', 1])
  })

  test('hibánál session nélkül megy tovább', async () => {
    const onError = vi.fn()
    const store = ioredisCookieStore(
      {
        get: () => Promise.reject(new Error('ECONNREFUSED')),
        set: () => Promise.reject(new Error('ECONNREFUSED')),
        del: () => Promise.reject(new Error('ECONNREFUSED')),
      },
      { onError },
    )

    await expect(store.delete('k')).resolves.toBeUndefined()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ operation: 'delete', key: 'k' }))
  })
})

describe('nodeRedisCookieStore', () => {
  test('set(key, value, { EX: ttl }) és del(key) hívással dolgozik', async () => {
    const client = new FakeNodeRedis()
    const store = nodeRedisCookieStore(client, { prefix: 'szamla:' })

    await store.set('k', COOKIE, SESSION_TTL_SECONDS)
    expect(await store.get('k')).toBe(COOKIE)
    await store.delete('k')

    expect(client.calls).toEqual([
      ['set', 'szamla:k', COOKIE, { EX: 5100 }],
      ['get', 'szamla:k'],
      ['del', 'szamla:k'],
    ])
  })

  test('Buffer típusleképezésnél a bájtokat UTF-8 stringként olvassa', async () => {
    const client = new FakeNodeRedis()
    client.data.set('k', new TextEncoder().encode(COOKIE))

    expect(await nodeRedisCookieStore(client).get('k')).toBe(COOKIE)
  })
})

describe('cloudflareKvCookieStore', () => {
  test('put(key, value, { expirationTtl }) hívással ír', async () => {
    const kv = new FakeKvNamespace()
    const store = cloudflareKvCookieStore(kv, { prefix: 'sz:' })

    await store.set('k', COOKIE, SESSION_TTL_SECONDS)
    expect(await store.get('k')).toBe(COOKIE)
    await store.delete('k')

    expect(kv.calls).toEqual([
      ['put', 'sz:k', COOKIE, { expirationTtl: 5100 }],
      ['get', 'sz:k', undefined],
      ['delete', 'sz:k'],
    ])
  })

  test('a KV minimum 60 mp-es TTL-jére emeli a rövidebb lejáratot', async () => {
    const kv = new FakeKvNamespace()
    await cloudflareKvCookieStore(kv).set('k', COOKIE, 5)

    expect(CLOUDFLARE_KV_MIN_TTL_SECONDS).toBe(60)
    expect(kv.calls[0]).toEqual(['put', 'k', COOKIE, { expirationTtl: 60 }])
  })

  test('KV hiba esetén a get undefined', async () => {
    const onError = vi.fn()
    const store = cloudflareKvCookieStore(
      {
        get: () => Promise.reject(new Error('KV GET failed: 429')),
        put: () => Promise.resolve(),
        delete: () => Promise.resolve(),
      },
      { onError },
    )

    expect(await store.get('k')).toBeUndefined()
    expect(onError).toHaveBeenCalledOnce()
  })
})

describe('customCookieStore', () => {
  test('prefixszel továbbít a saját függvényekhez', async () => {
    const inner = memoryCookieStore()
    const store = customCookieStore(inner, { prefix: 'x:' })

    await store.set('k', COOKIE, 60)

    expect(await inner.get('x:k')).toBe(COOKIE)
    expect(await store.get('k')).toBe(COOKIE)
    await store.delete('k')
    expect(await inner.get('x:k')).toBeUndefined()
  })

  test('prefix nélkül a kulcs változatlan, és a hibát elnyeli', async () => {
    const onError = vi.fn()
    const store = customCookieStore(
      {
        get: (key) => (key === 'k' ? COOKIE : undefined),
        set: () => {
          throw new Error('írás tiltva')
        },
        delete: () => undefined,
      },
      { onError },
    )

    expect(await store.get('k')).toBe(COOKIE)
    await expect(store.set('k', COOKIE, 60)).resolves.toBeUndefined()
    expect(onError).toHaveBeenCalledOnce()
  })
})
