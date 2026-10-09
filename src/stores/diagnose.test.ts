import { describe, expect, test } from 'vitest'
import { type KeyValueStore, memoryStore } from '../core/store'
import { diagnoseStore } from './diagnose'
import { cloudflareKvStore, resilientStore } from './index'

describe('diagnoseStore', () => {
  test('a teljes képességű tároló mindenre alkalmas, és nem hagy szemetet', async () => {
    const inner = memoryStore()
    const keys: string[] = []
    const store: KeyValueStore = {
      ...inner,
      set: (key, value, ttl) => {
        keys.push(key)
        return inner.set(key, value, ttl)
      },
    }

    const diagnosis = await diagnoseStore(store)

    expect(diagnosis).toMatchObject({
      ok: true,
      problems: [],
      suitableFor: {
        session: true,
        attemptLedger: true,
        createOnceLock: true,
        journal: true,
        webhookDedupe: true,
      },
    })
    expect(keys[0]).toMatch(/^szamlazz:diagnose:[0-9a-f]{16}$/)
    expect(await inner.get(keys[0] ?? '')).toBeUndefined()
  })

  test('a Cloudflare KV-t zárnak és naplónak alkalmatlannak jelzi', async () => {
    const data = new Map<string, string>()
    const kv = cloudflareKvStore({
      get: async (key) => data.get(key) ?? null,
      put: async (key, value) => {
        data.set(key, value)
      },
      delete: async (key) => {
        data.delete(key)
      },
    })

    const diagnosis = await diagnoseStore(kv)

    expect(diagnosis.ok).toBe(false)
    expect(diagnosis.suitableFor).toMatchObject({
      session: true,
      createOnceLock: false,
      journal: false,
    })
    expect(diagnosis.problems.join(' ')).toContain('Cloudflare KV')
  })

  test('az elnyelt hibájú (hibatűrő) tároló hibáját a visszaolvasás felfedi', async () => {
    const broken = resilientStore(
      {
        get: () => Promise.reject(new Error('le')),
        set: () => Promise.reject(new Error('le')),
        delete: () => Promise.reject(new Error('le')),
      },
      { onError: () => undefined },
    )

    const diagnosis = await diagnoseStore(broken)

    expect(diagnosis.suitableFor.session).toBe(false)
    expect(diagnosis.problems[0]).toContain('írás és olvasás')
  })

  test('a hibásan működő atomikus műveleteket kiszűri', async () => {
    const inner = memoryStore()
    const wrong: KeyValueStore = {
      ...inner,
      setIfAbsent: async () => true,
      increment: async () => 5,
      deleteIfEquals: async () => true,
    }

    const diagnosis = await diagnoseStore(wrong, { keyPrefix: 'teszt:', now: () => 0 })

    expect(diagnosis.suitableFor).toMatchObject({ createOnceLock: false, journal: false })
    expect(diagnosis.latencyMs).toBe(0)
    expect(diagnosis.problems).toHaveLength(2)
  })

  test('deleteIfEquals nélkül is ellenőrzi a setIfAbsent-et', async () => {
    const inner = memoryStore()
    const { deleteIfEquals: _unused, ...rest } = inner
    expect((await diagnoseStore(rest)).suitableFor.createOnceLock).toBe(true)
  })
})
