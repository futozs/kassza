import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { localTotals } from '../scripts/live-core.mjs'
import * as money from '../src/money'

interface Regression {
  readonly seed: number
  readonly cart: Parameters<typeof localTotals>[0] & { readonly index: number }
  readonly server: { readonly net: number; readonly gross: number }
}

const regressions = JSON.parse(
  readFileSync(new URL('./fixtures/rounding-regressions.json', import.meta.url), 'utf8'),
) as Regression[]

describe('kerekítési regressziók (az élő preview-fuzz eltérései)', () => {
  test('a fixture érvényes lista', () => {
    expect(Array.isArray(regressions)).toBe(true)
  })

  test.each(
    regressions.map((regression) => [
      `seed ${regression.seed} #${regression.cart.index}`,
      regression,
    ]),
  )('a kassza végösszege megegyezik a Számlázz.hu-éval: %s', (_label, regression) => {
    const local = localTotals(regression.cart, money)
    expect(local.net).toBeCloseTo(regression.server.net, 2)
    expect(local.gross).toBeCloseTo(regression.server.gross, 2)
  })
})
