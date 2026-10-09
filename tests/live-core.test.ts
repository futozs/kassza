import { describe, expect, test } from 'vitest'
import {
  assertTestAccount,
  capturingFetch,
  compareTotals,
  localTotals,
  mulberry32,
  PROBE_CHARACTERS,
  randomCart,
  serverTotals,
  throttle,
} from '../scripts/live-core.mjs'
import { createKassza } from '../src/client'
import * as money from '../src/money'
import { createFakeAgentFetch } from '../src/testing'
import { fakeKassza } from './fake-agent'
import { TEST_AGENT_KEY } from './helpers'

describe('élő szkriptek segédei', () => {
  test('a seedelt PRNG determinisztikus', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    const values = Array.from({ length: 5 }, () => a())
    expect(values).toEqual(Array.from({ length: 5 }, () => b()))
    expect(values.every((value) => value >= 0 && value < 1)).toBe(true)
  })

  test('a véletlen kosár mindig érvényes kassza-bemenet', () => {
    const rng = mulberry32(7)
    for (let index = 0; index < 300; index++) {
      const cart = randomCart(rng, index)
      expect(cart.items.length).toBeGreaterThanOrEqual(1)
      expect(cart.items.length).toBeLessThanOrEqual(12)
      expect(() => localTotals(cart, money)).not.toThrow()
    }
  })

  test('a szerver végösszegét a fejlécből olvassa, hiánynál nem eldönthető', () => {
    const headers = new Headers({ szlahu_nettovegosszeg: '1000', szlahu_bruttovegosszeg: '1270' })
    expect(serverTotals(headers)).toEqual({ net: 1000, gross: 1270 })
    expect(serverTotals(new Headers({ szlahu_nettovegosszeg: '1000' }))).toBeUndefined()
    expect(
      serverTotals(new Headers({ szlahu_nettovegosszeg: 'x', szlahu_bruttovegosszeg: '1' })),
    ).toBeUndefined()
    expect(compareTotals({ net: 1000, gross: 1270 }, { net: 1000, gross: 1270 })).toBe('match')
    expect(compareTotals({ net: 1000, gross: 1270 }, { net: 1000, gross: 1271 })).toBe('mismatch')
    expect(compareTotals({ net: 1, gross: 1 }, undefined)).toBe('inconclusive')
  })

  test('a fuzz a hamis Agent ellen végigfut, és a kassza számai egyeznek a válasz fejlécével', async () => {
    const agent = createFakeAgentFetch()
    const { fetch, captured } = capturingFetch(agent.fetch)
    const kassza = createKassza({ agentKey: TEST_AGENT_KEY, fetch, retryDelayMs: 0 })
    const rng = mulberry32(2026)
    const buyer = { name: 'Fuzz', zip: '1111', city: 'Budapest', address: 'Fuzz utca 1.' }
    const outcomes: string[] = []
    for (let index = 0; index < 40; index++) {
      const { index: _position, ...cart } = randomCart(rng, index)
      await kassza.invoices.preview({ buyer, ...cart })
      outcomes.push(
        compareTotals(localTotals(cart, money), serverTotals(captured.headers ?? new Headers())),
      )
    }
    expect(outcomes.filter((outcome) => outcome === 'match')).toHaveLength(40)
  })

  test('a fojtás a kéréseket a megadott időközzel indítja', async () => {
    const started: number[] = []
    const slow = throttle(async () => {
      started.push(Date.now())
      return new Response('ok')
    }, 30)
    await Promise.all([slow('a'), slow('b'), slow('c')])
    expect((started[2] ?? 0) - (started[0] ?? 0)).toBeGreaterThanOrEqual(55)
  })

  test('a tesztfiók-őr éles fióknál leáll, tesztfióknál átenged, és nem hagy díjbekérőt', async () => {
    const live = fakeKassza({ testAccount: false })
    const test = fakeKassza({ testAccount: true })
    await expect(assertTestAccount(live.kassza, 'G-1')).rejects.toThrow('nem tesztfiókhoz')
    await expect(assertTestAccount(test.kassza, 'G-2')).resolves.toBeUndefined()
    for (const { agent } of [live, test]) {
      expect([...agent.invoices.values()].every((invoice) => invoice.deleted)).toBe(true)
    }
    expect(Object.keys(PROBE_CHARACTERS).length).toBeGreaterThan(5)
  })
})
