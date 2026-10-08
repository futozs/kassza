import { afterEach, describe, expect, test, vi } from 'vitest'
import { memoryCookieStore } from './session'
import { type KeyValueStore, memoryStore, storeCapabilities } from './store'

afterEach(() => {
  vi.useRealTimers()
})

describe('memoryStore', () => {
  test('setIfAbsent csak üres kulcsra ír', async () => {
    const store = memoryStore()

    expect(await store.setIfAbsent?.('k', 'a', 60)).toBe(true)
    expect(await store.setIfAbsent?.('k', 'b', 60)).toBe(false)
    expect(await store.get('k')).toBe('a')
  })

  test('setIfAbsent a lejárt kulcsot szabadnak tekinti', async () => {
    vi.useFakeTimers()
    const store = memoryStore()
    await store.setIfAbsent?.('k', 'a', 1)

    vi.advanceTimersByTime(1_001)

    expect(await store.setIfAbsent?.('k', 'b', 1)).toBe(true)
    expect(await store.get('k')).toBe('b')
  })

  test('increment 1-ről indul, növel, és frissíti a lejáratot', async () => {
    vi.useFakeTimers()
    const store = memoryStore()

    expect(await store.increment?.('n', 10)).toBe(1)
    vi.advanceTimersByTime(9_000)
    expect(await store.increment?.('n', 10)).toBe(2)
    vi.advanceTimersByTime(9_000)
    expect(await store.get('n')).toBe('2')
    vi.advanceTimersByTime(1_001)
    expect(await store.get('n')).toBeUndefined()
  })

  test('increment a nem szám értéket nulláról kezdi', async () => {
    const store = memoryStore()
    await store.set('n', 'abc', 60)
    expect(await store.increment?.('n', 60)).toBe(1)
  })

  test('deleteIfEquals csak egyező értéknél töröl', async () => {
    const store = memoryStore()
    await store.set('k', 'token-1', 60)

    expect(await store.deleteIfEquals?.('k', 'token-2')).toBe(false)
    expect(await store.get('k')).toBe('token-1')
    expect(await store.deleteIfEquals?.('k', 'token-1')).toBe(true)
    expect(await store.get('k')).toBeUndefined()
    expect(await store.deleteIfEquals?.('k', 'token-1')).toBe(false)
  })

  test('a NaN lejárat egy másodperc, a végtelen sosem jár le', async () => {
    vi.useFakeTimers()
    const store = memoryStore()
    await store.set('nan', 'x', Number.NaN)
    await store.set('inf', 'y', Number.POSITIVE_INFINITY)

    vi.advanceTimersByTime(1_001)

    expect(await store.get('nan')).toBeUndefined()
    expect(await store.get('inf')).toBe('y')
  })

  test('a memoryCookieStore ugyanez a tároló', async () => {
    expect(storeCapabilities(memoryCookieStore())).toEqual({
      setIfAbsent: true,
      increment: true,
      deleteIfEquals: true,
    })
  })
})

describe('storeCapabilities', () => {
  test('a hiányzó műveleteket false-ként jelzi', () => {
    const plain: KeyValueStore = { get: () => undefined, set: () => undefined, delete: () => {} }
    expect(storeCapabilities(plain)).toEqual({
      setIfAbsent: false,
      increment: false,
      deleteIfEquals: false,
    })
  })
})
