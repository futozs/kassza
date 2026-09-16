import { afterEach, describe, expect, test, vi } from 'vitest'
import { createTestContext } from '../../tests/helpers'
import type { CookieStore } from '../core/session'
import { type CookieStoreErrorEvent, resilientCookieStore } from './resilient'

function failingStore(error: unknown = new Error('Redis nem elérhető')): CookieStore {
  return {
    get: () => Promise.reject(error),
    set: () => {
      throw error
    },
    delete: () => Promise.reject(error),
  }
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('resilientCookieStore', () => {
  test('sikeres műveleteket változatlanul továbbít, a null-t undefined-ra alakítja', async () => {
    const calls: unknown[][] = []
    const store = resilientCookieStore({
      get: (key) => (key === 'van' ? 'JSESSIONID=abc' : null),
      set: (...args) => {
        calls.push(['set', ...args])
      },
      delete: async (key) => {
        calls.push(['delete', key])
      },
    })

    expect(await store.get('van')).toBe('JSESSIONID=abc')
    expect(await store.get('nincs')).toBeUndefined()
    await store.set('k', 'v', 60)
    await store.delete('k')
    expect(calls).toEqual([
      ['set', 'k', 'v', 60],
      ['delete', 'k'],
    ])
  })

  test('szinkron és aszinkron hibát is elnyel, és jelenti az onError-nak', async () => {
    const events: CookieStoreErrorEvent[] = []
    const error = new Error('boom')
    const store = resilientCookieStore(failingStore(error), { onError: (e) => events.push(e) })

    await expect(store.get('a')).resolves.toBeUndefined()
    await expect(store.set('b', 'v', 10)).resolves.toBeUndefined()
    await expect(store.delete('c')).resolves.toBeUndefined()
    expect(events).toEqual([
      { operation: 'get', key: 'a', error },
      { operation: 'set', key: 'b', error },
      { operation: 'delete', key: 'c', error },
    ])
  })

  test('onError nélkül console.warn-nal figyelmeztet', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const store = resilientCookieStore(failingStore())

    await store.get('a')

    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0]?.[0])).toContain('"get" művelete sikertelen')
  })

  test('ha az onError maga dob, az sem jut ki', async () => {
    const store = resilientCookieStore(failingStore(), {
      onError: () => {
        throw new Error('rossz logger')
      },
    })

    await expect(store.get('a')).resolves.toBeUndefined()
  })

  test('timeoutMs után feladja a lassú store-t', async () => {
    vi.useFakeTimers()
    const events: CookieStoreErrorEvent[] = []
    const store = resilientCookieStore(
      { get: () => new Promise(() => undefined), set: () => undefined, delete: () => undefined },
      { timeoutMs: 50, onError: (e) => events.push(e) },
    )

    const pending = store.get('lassu')
    await vi.advanceTimersByTimeAsync(50)

    await expect(pending).resolves.toBeUndefined()
    expect(events[0]?.operation).toBe('get')
    expect(String(events[0]?.error)).toContain('50 ms')
  })

  test('a timeout nem szól bele a gyors válaszba', async () => {
    const store = resilientCookieStore(
      { get: async () => 'ok=1', set: () => undefined, delete: () => undefined },
      { timeoutMs: 1000 },
    )

    expect(await store.get('x')).toBe('ok=1')
  })

  test('érvénytelen timeoutMs esetén RangeError', () => {
    expect(() => resilientCookieStore(failingStore(), { timeoutMs: 0 })).toThrow(RangeError)
    expect(() => resilientCookieStore(failingStore(), { timeoutMs: Number.NaN })).toThrow(
      RangeError,
    )
  })

  test('a Számlázz kérés nem hasal el, ha a cookie store dob', async () => {
    const onError = vi.fn()
    const { ctx, agent } = createTestContext(
      { body: 'ok', headers: { 'set-cookie': 'JSESSIONID=uj; Path=/' } },
      { cookieStore: resilientCookieStore(failingStore(), { onError }) },
    )

    const text = await ctx.execute({ action: 'getInvoicePdf', xml: '<x/>' }, (r) => r.text())
    await ctx.resetSession()

    expect(text).toBe('ok')
    expect(agent.lastCall().cookie).toBeNull()
    expect(onError.mock.calls.map(([event]) => event.operation)).toEqual(['get', 'set', 'delete'])
  })
})
