import { afterEach, describe, expect, test, vi } from 'vitest'
import * as cookieStores from '../cookie-stores'
import {
  DELETE_IF_EQUALS_SCRIPT,
  INCREMENT_SCRIPT,
  SET_IF_ABSENT_SCRIPT,
  scriptNumber,
} from '../cookie-stores/scripts'
import {
  customStore,
  type DurableObjectStorageLike,
  type DurableObjectStoreEntry,
  durableObjectStore,
  handleDurableObjectStoreRequest,
  ioredisStore,
  type KeyValueStore,
  memoryStore,
  nodeRedisStore,
  resilientStore,
  storeCapabilities,
  upstashRedisStore,
} from './index'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

class FakeRedisScripts {
  readonly data = new Map<string, string>()
  readonly ttls = new Map<string, number>()
  readonly evals: unknown[][] = []

  run(script: string, key: string, args: readonly string[]): number {
    if (script === SET_IF_ABSENT_SCRIPT) {
      if (this.data.has(key)) return 0
      this.data.set(key, args[0] ?? '')
      this.ttls.set(key, Number(args[1]))
      return 1
    }
    if (script === INCREMENT_SCRIPT) {
      const next = Number(this.data.get(key) ?? '0') + 1
      this.data.set(key, String(next))
      this.ttls.set(key, Number(args[0]))
      return next
    }
    if (script === DELETE_IF_EQUALS_SCRIPT) {
      if (this.data.get(key) !== args[0]) return 0
      this.data.delete(key)
      return 1
    }
    throw new Error('ismeretlen szkript')
  }
}

class FakeIoRedis extends FakeRedisScripts {
  async get(key: string) {
    return this.data.get(key) ?? null
  }
  async set(key: string, value: string, _mode: 'EX', seconds: number) {
    this.data.set(key, value)
    this.ttls.set(key, seconds)
    return 'OK'
  }
  async del(key: string) {
    return this.data.delete(key) ? 1 : 0
  }
  async eval(script: string, numKeys: number, ...args: string[]) {
    this.evals.push([script, numKeys, ...args])
    return this.run(script, args[0] ?? '', args.slice(numKeys))
  }
}

class FakeNodeRedis extends FakeRedisScripts {
  async get(key: string) {
    return this.data.get(key) ?? null
  }
  async set(key: string, value: string, options: { EX: number }) {
    this.data.set(key, value)
    this.ttls.set(key, options.EX)
    return 'OK'
  }
  async del(key: string) {
    return this.data.delete(key) ? 1 : 0
  }
  async eval(script: string, options: { keys: string[]; arguments: string[] }) {
    this.evals.push([script, options])
    return String(this.run(script, options.keys[0] ?? '', options.arguments))
  }
}

class FakeUpstash extends FakeRedisScripts {
  async get(key: string) {
    return this.data.get(key) ?? null
  }
  async set(key: string, value: string, options: { ex: number }) {
    this.data.set(key, value)
    this.ttls.set(key, options.ex)
    return 'OK'
  }
  async del(key: string) {
    return this.data.delete(key) ? 1 : 0
  }
  async eval(script: string, keys: string[], args: string[]) {
    this.evals.push([script, keys, args])
    return this.run(script, keys[0] ?? '', args)
  }
}

async function exerciseAtomic(store: KeyValueStore, fake: FakeRedisScripts, prefix: string) {
  expect(storeCapabilities(store)).toEqual({
    setIfAbsent: true,
    increment: true,
    deleteIfEquals: true,
  })
  expect(await store.setIfAbsent?.('lock', 'token-1', 0.4)).toBe(true)
  expect(await store.setIfAbsent?.('lock', 'token-2', 60)).toBe(false)
  expect(fake.data.get(`${prefix}lock`)).toBe('token-1')
  expect(fake.ttls.get(`${prefix}lock`)).toBe(1)
  expect(await store.deleteIfEquals?.('lock', 'token-2')).toBe(false)
  expect(await store.deleteIfEquals?.('lock', 'token-1')).toBe(true)
  expect(fake.data.has(`${prefix}lock`)).toBe(false)
  expect(await store.increment?.('count', 86_400)).toBe(1)
  expect(await store.increment?.('count', 86_400)).toBe(2)
  expect(await store.get('count')).toBe('2')
  expect(fake.ttls.get(`${prefix}count`)).toBe(86_400)
}

describe('Redis adapterek atomikus műveletei', () => {
  test('ioredis: eval(script, 1, key, ...args)', async () => {
    const redis = new FakeIoRedis()
    await exerciseAtomic(ioredisStore(redis, { prefix: 'p:' }), redis, 'p:')
    expect(redis.evals[0]).toEqual([SET_IF_ABSENT_SCRIPT, 1, 'p:lock', 'token-1', '1'])
  })

  test('node-redis: eval(script, { keys, arguments }), string eredménnyel is', async () => {
    const client = new FakeNodeRedis()
    await exerciseAtomic(nodeRedisStore(client, { prefix: 'n:' }), client, 'n:')
    expect(client.evals[0]).toEqual([
      SET_IF_ABSENT_SCRIPT,
      { keys: ['n:lock'], arguments: ['token-1', '1'] },
    ])
  })

  test('Upstash: eval(script, keys, args)', async () => {
    const redis = new FakeUpstash()
    await exerciseAtomic(upstashRedisStore(redis), redis, '')
    expect(redis.evals[0]).toEqual([SET_IF_ABSENT_SCRIPT, ['lock'], ['token-1', '1']])
  })

  test('eval nélküli klienssel nincsenek atomikus műveletek', () => {
    const minimal = {
      get: async () => null,
      set: async () => 'OK',
      del: async () => 0,
    }
    for (const store of [
      ioredisStore(minimal),
      nodeRedisStore(minimal),
      upstashRedisStore(minimal),
    ]) {
      expect(storeCapabilities(store)).toEqual({
        setIfAbsent: false,
        increment: false,
        deleteIfEquals: false,
      })
    }
  })

  test('az atomikus műveletek hibáját a hibatűrő adapter jelenti és továbbdobja', async () => {
    const onError = vi.fn()
    const store = upstashRedisStore(
      {
        get: async () => null,
        set: async () => 'OK',
        del: async () => 0,
        eval: () => Promise.reject(new Error('NOSCRIPT')),
      },
      { onError },
    )
    await expect(store.setIfAbsent?.('k', 'v', 1)).rejects.toThrow('NOSCRIPT')
    await expect(store.increment?.('k', 1)).rejects.toThrow('NOSCRIPT')
    await expect(store.deleteIfEquals?.('k', 'v')).rejects.toThrow('NOSCRIPT')
    expect(onError.mock.calls.map(([event]) => event.operation)).toEqual([
      'setIfAbsent',
      'increment',
      'deleteIfEquals',
    ])
  })

  test('onError nélkül az atomikus hiba console.warn-t is ad', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const store = resilientStore({
      ...memoryStore(),
      increment: () => Promise.reject(new Error('x')),
    })
    await expect(store.increment?.('k', 1)).rejects.toThrow('x')
    expect(String(warn.mock.calls[0]?.[0])).toContain('a hibát a kassza kapja meg')
  })

  test('a nem szám szkript-eredmény hibát dob', () => {
    expect(scriptNumber('3')).toBe(3)
    expect(() => scriptNumber('OK')).toThrow(TypeError)
    expect(() => scriptNumber(null)).not.toThrow()
  })
})

describe('customStore', () => {
  test('a prefixet az atomikus műveletekre is alkalmazza', async () => {
    const inner = memoryStore()
    const store = customStore(inner, { prefix: 'app:' })

    expect(await store.setIfAbsent?.('k', 'v', 60)).toBe(true)
    expect(await inner.get('app:k')).toBe('v')
    expect(await store.increment?.('n', 60)).toBe(1)
    expect(await inner.get('app:n')).toBe('1')
    expect(await store.deleteIfEquals?.('k', 'v')).toBe(true)
    expect(await inner.get('app:k')).toBeUndefined()
  })

  test('atomikus műveletek nélküli tárolónál nem talál ki ilyet', () => {
    const store = customStore({ get: () => undefined, set: () => undefined, delete: () => {} })
    expect(storeCapabilities(store).setIfAbsent).toBe(false)
  })
})

describe('kassza/cookie-stores visszafelé kompatibilitás', () => {
  test('a régi alkönyvtár ugyanazokat a függvényeket adja', () => {
    expect(cookieStores.upstashRedisCookieStore).toBe(upstashRedisStore)
    expect(cookieStores.memoryCookieStore).toBeTypeOf('function')
    expect(cookieStores.durableObjectStore).toBe(durableObjectStore)
  })
})

class FakeDurableStorage implements DurableObjectStorageLike {
  readonly entries = new Map<string, DurableObjectStoreEntry | string>()
  async get(key: string) {
    return this.entries.get(key)
  }
  async put(key: string, value: DurableObjectStoreEntry) {
    this.entries.set(key, value)
  }
  async delete(key: string) {
    return this.entries.delete(key)
  }
}

function durableStore() {
  const storage = new FakeDurableStorage()
  const calls: unknown[] = []
  const store = durableObjectStore({
    fetch: async (input, init) => {
      calls.push(JSON.parse(String(init.body)))
      return handleDurableObjectStoreRequest(storage, new Request(input, init))
    },
  })
  return { storage, store, calls }
}

describe('durableObjectStore', () => {
  test('minden műveletet a Durable Objecten keresztül végez', async () => {
    const { store, calls } = durableStore()

    await store.set('k', 'v', 60)
    expect(await store.get('k')).toBe('v')
    expect(await store.get('nincs')).toBeUndefined()
    expect(await store.setIfAbsent?.('k', 'x', 60)).toBe(false)
    expect(await store.setIfAbsent?.('uj', 'x', 60)).toBe(true)
    expect(await store.increment?.('n', 60)).toBe(1)
    expect(await store.increment?.('n', 60)).toBe(2)
    expect(await store.deleteIfEquals?.('uj', 'y')).toBe(false)
    expect(await store.deleteIfEquals?.('uj', 'x')).toBe(true)
    await store.delete('k')
    expect(await store.get('k')).toBeUndefined()
    expect(calls[0]).toEqual({ op: 'set', key: 'k', value: 'v', ttlSeconds: 60 })
  })

  test('a lejárt bejegyzést törli és üresnek tekinti', async () => {
    vi.useFakeTimers()
    const { store, storage } = durableStore()
    await store.set('k', 'v', 1)

    vi.advanceTimersByTime(1_001)

    expect(await store.get('k')).toBeUndefined()
    expect(storage.entries.has('k')).toBe(false)
    expect(await store.setIfAbsent?.('k', 'uj', 1)).toBe(true)
  })

  test('a sérült tárolt értéket hiányzónak veszi, a nem szám számlálót nulláról kezdi', async () => {
    const { store, storage } = durableStore()
    storage.entries.set('rossz', 'nem bejegyzés')
    storage.entries.set('n', { value: 'abc', expiresAt: Date.now() + 60_000 })

    expect(await store.get('rossz')).toBeUndefined()
    expect(await store.increment?.('n', 60)).toBe(1)
  })

  test('a kezelő a hibás kérést elutasítja', async () => {
    const storage = new FakeDurableStorage()
    const post = (body: string) =>
      handleDurableObjectStoreRequest(storage, new Request('https://x/', { method: 'POST', body }))

    expect((await handleDurableObjectStoreRequest(storage, new Request('https://x/'))).status).toBe(
      405,
    )
    expect((await post('nem json')).status).toBe(400)
    expect((await post(JSON.stringify({ op: 'drop', key: 'k' }))).status).toBe(400)
    expect((await post(JSON.stringify({ op: 'get', key: '' }))).status).toBe(400)
    expect((await post(JSON.stringify({ op: 'set', key: 'k', value: 1 }))).status).toBe(400)
    expect((await post(JSON.stringify({ op: 'set', key: 'k', ttlSeconds: 'x' }))).status).toBe(400)
    const missingValue = await post(JSON.stringify({ op: 'set', key: 'k' }))
    expect(missingValue.status).toBe(400)
    expect(await missingValue.json()).toMatchObject({ error: expect.stringContaining('érték') })
  })

  test('a kliens a HTTP hibát magyar üzenettel dobja tovább', async () => {
    const store = durableObjectStore({
      fetch: async () => new Response(JSON.stringify({ error: 'túlterhelt' }), { status: 503 }),
    })
    await expect(store.get('k')).rejects.toThrow('HTTP 503')
    const broken = durableObjectStore({
      fetch: async () => new Response('nem json', { status: 500 }),
    })
    await expect(broken.delete('k')).rejects.toThrow('ismeretlen hiba')
    const wrong = durableObjectStore({
      fetch: async () => new Response(JSON.stringify({ result: 'egy' })),
    })
    await expect(wrong.increment?.('k', 1)).rejects.toThrow(TypeError)
  })
})
