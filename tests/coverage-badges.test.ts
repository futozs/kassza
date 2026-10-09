import { describe, expect, test } from 'vitest'
import {
  COVERAGE_METRICS,
  coverageBadges,
  coverageColor,
} from '../scripts/coverage-badges-core.mjs'

const summary = {
  total: {
    lines: { pct: 98.43 },
    branches: { pct: 92.78 },
    functions: { pct: 98.21 },
    statements: { pct: 79.99 },
  },
}

describe('lefedettségi jelvények', () => {
  test('mind a négy mérőszámból shields.io endpoint jelvény lesz, egy tizedesre kerekítve', () => {
    expect(coverageBadges(summary)).toEqual([
      {
        file: 'coverage-lines.json',
        badge: {
          schemaVersion: 1,
          label: 'sor-lefedettség',
          message: '98.4%',
          color: 'brightgreen',
        },
      },
      {
        file: 'coverage-branches.json',
        badge: { schemaVersion: 1, label: 'ág-lefedettség', message: '92.8%', color: 'green' },
      },
      {
        file: 'coverage-functions.json',
        badge: {
          schemaVersion: 1,
          label: 'függvény-lefedettség',
          message: '98.2%',
          color: 'brightgreen',
        },
      },
      {
        file: 'coverage-statements.json',
        badge: { schemaVersion: 1, label: 'utasítás-lefedettség', message: '80.0%', color: 'red' },
      },
    ])
  })

  test('a szín a küszöbökhöz igazodik', () => {
    expect([100, 95, 94.9, 90, 89.9, 80, 79.9, 0].map(coverageColor)).toEqual([
      'brightgreen',
      'brightgreen',
      'green',
      'green',
      'yellowgreen',
      'yellowgreen',
      'red',
      'red',
    ])
  })

  test('hiányzó vagy hibás értéknél hibát dob, nem tesz ki félrevezető jelvényt', () => {
    expect(() => coverageBadges({})).toThrow('lines')
    expect(() =>
      coverageBadges({ total: { ...summary.total, branches: { pct: Number.NaN } } }),
    ).toThrow('branches')
    expect(() => coverageBadges({ total: { ...summary.total, lines: { pct: 101 } } })).toThrow(
      'lines',
    )
    expect(COVERAGE_METRICS.map((metric) => metric.key)).toEqual([
      'lines',
      'branches',
      'functions',
      'statements',
    ])
  })
})
