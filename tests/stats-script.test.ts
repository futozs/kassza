import { describe, expect, test } from 'vitest'
import {
  analyzeVersions,
  cleanedEstimate,
  formatReport,
  parseDependentsCount,
  type Stats,
  sumDownloads,
} from '../scripts/stats.mjs'

describe('a statisztika script', () => {
  test('kiolvassa a GitHub dependents számát az oldalból', () => {
    const html = '<svg></svg>\n   12\n   Repositories\n</a>'

    expect(parseDependentsCount(html)).toBe(12)
  })

  test('ezres elválasztóval is helyesen olvassa a dependents számot', () => {
    expect(parseDependentsCount('1,204\n Repositories')).toBe(1204)
  })

  test('nullát ad, ha az oldalban nincs dependents szám', () => {
    expect(parseDependentsCount('<html></html>')).toBeNull()
  })

  test('összeadja a napi letöltéseket', () => {
    const range = { downloads: [{ downloads: 3 }, { downloads: 4 }] }

    expect(sumDownloads(range)).toBe(7)
    expect(sumDownloads(null)).toBe(0)
  })

  test('gyanúsnak jelöli a közel azonos verziónkénti letöltést', () => {
    const analysis = analyzeVersions({ '0.13.0': 180, '0.12.0': 183, '0.11.0': 172, '0.1.0': 5 })

    expect(analysis.flat).toBe(true)
    expect(analysis.flatVersions).toBe(3)
    expect(analysis.flatShare).toBeGreaterThan(0.95)
  })

  test('nem jelöli gyanúsnak a változatos letöltési eloszlást', () => {
    const analysis = analyzeVersions({ '0.3.0': 900, '0.2.0': 120, '0.1.0': 60 })

    expect(analysis.flat).toBe(false)
    expect(analysis.flatVersions).toBe(0)
  })

  test('a jelentés a hiányzó adatot nem elérhetőnek írja ki', () => {
    const stats: Stats = {
      npm: { lastWeek: null, lastMonth: null, lastYear: null, versions: null },
      github: null,
      dependents: { githubRepositories: null, npmPackagesDepsDev: null, npmDirectDepsDev: null },
    }

    const report = formatReport('kassza', '1.0.0', stats)

    expect(report).toContain('kassza@1.0.0 statisztika')
    expect(report).toContain('elmúlt 7 nap:   nem elérhető')
  })

  test('a tisztított becslés a tükrök verziónkénti forgalma feletti részt számolja', () => {
    const analysis = analyzeVersions({
      '0.13.0': 260,
      '0.12.0': 185,
      '0.11.0': 173,
      '0.10.0': 180,
      '0.1.0': 4,
    })
    expect(cleanedEstimate(analysis)).toEqual({ estimate: 85, baseline: 180, cleaned: true })
    const flat = analyzeVersions({ '0.13.0': 189, '0.12.0': 185, '0.11.0': 173, '0.10.0': 48 })
    expect(cleanedEstimate(flat)).toEqual({ estimate: 4, baseline: 185, cleaned: true })
    const varied = analyzeVersions({ '1.0.0': 500, '0.9.0': 20 })
    expect(cleanedEstimate(varied)).toEqual({ estimate: 520, baseline: 0, cleaned: false })
    expect(cleanedEstimate(null)).toBeNull()
  })

  test('a jelentés első sora a tisztított becslés, a kódkeresés találatai is megjelennek', () => {
    const report = formatReport('kassza', '0.13.0', {
      npm: {
        lastWeek: 813,
        lastMonth: null,
        lastYear: null,
        versions: analyzeVersions({ '0.13.0': 189, '0.12.0': 185, '0.11.0': 173 }),
      },
      github: null,
      dependents: { githubRepositories: null, npmPackagesDepsDev: null, npmDirectDepsDev: null },
      codeSearch: [{ query: '"createKassza("', total: 3 }],
    })
    expect(report.split('\n')[2]).toContain('Tisztított becslés (7 nap): 4')
    expect(report).toContain('"createKassza(": 3 találat')
  })
})
