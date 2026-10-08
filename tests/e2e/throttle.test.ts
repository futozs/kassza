import { describe, expect, test } from 'vitest'
import {
  DEFAULT_E2E_DELAY_MS,
  resolveDelayMs,
  type ThrottleClock,
  throttledFetch,
} from './throttle'

function fakeClock(): ThrottleClock & { readonly time: () => number } {
  let current = 10_000
  return {
    now: () => current,
    sleep: async (ms) => {
      current += ms
    },
    time: () => current,
  }
}

describe('az e2e kérések szüneteltetése', () => {
  test('a kérések indulása között legalább a megadott idő telik el', async () => {
    const clock = fakeClock()
    const starts: number[] = []
    const base = (async () => {
      starts.push(clock.time())
      return new Response('ok')
    }) as typeof globalThis.fetch
    const fetch = throttledFetch(base, 1500, clock)

    await Promise.all([
      fetch('https://a.test/1'),
      fetch('https://a.test/2'),
      fetch('https://a.test/3'),
    ])

    const gaps = starts.slice(1).map((start, index) => start - (starts[index] ?? 0))
    expect(starts).toHaveLength(3)
    expect(gaps).toHaveLength(2)
    expect(gaps.every((gap) => gap >= 1500)).toBe(true)
  })

  test('az első kérés nem vár, és a paramétereket változatlanul adja tovább', async () => {
    const clock = fakeClock()
    const seen: unknown[] = []
    const base = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push([input, init?.method])
      return new Response('ok')
    }) as typeof globalThis.fetch
    const fetch = throttledFetch(base, 1500, clock)
    const before = clock.time()

    await fetch('https://a.test/1', { method: 'POST' })

    expect(clock.time()).toBe(before)
    expect(seen).toEqual([['https://a.test/1', 'POST']])
  })

  test('a hiányzó vagy hibás beállítás az alapértelmezett szünetet adja', () => {
    expect(resolveDelayMs(undefined)).toBe(DEFAULT_E2E_DELAY_MS)
    expect(resolveDelayMs('')).toBe(DEFAULT_E2E_DELAY_MS)
    expect(resolveDelayMs('abc')).toBe(DEFAULT_E2E_DELAY_MS)
    expect(resolveDelayMs('-5')).toBe(DEFAULT_E2E_DELAY_MS)
    expect(resolveDelayMs('0')).toBe(0)
    expect(resolveDelayMs('3000')).toBe(3000)
  })
})
