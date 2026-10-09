import { describe, expect, test } from 'vitest'
import {
  REHEARSAL_STEPS,
  rehearsalReport,
  runNavRehearsal,
} from '../scripts/nav-rehearsal-core.mjs'
import type { NavReceiptData, NavReportDetail } from '../src/nav'
import { validateNavReceiptData } from '../src/nav'

function fakeNav(overrides: Record<string, unknown> = {}) {
  const reports = new Map<string, NavReportDetail>()
  let sequence = 0
  const keyOf = (data: NavReceiptData) => `${data.applicableDate}|${data.serialNumber}`
  return {
    environment: 'test' as const,
    canWrite: true,
    reports,
    authenticate: async () => ({ token: 't' }) as never,
    registerSoftware: async () => ({ created: true }),
    vatCategories: async () => [{ name: '27%', validFrom: '2026-01-01' }],
    submitReport: async (data: NavReceiptData) => {
      const existing = [...reports.values()].find(
        (report) => keyOf(report) === keyOf(data) && report.status === 'RECORDED',
      )
      if (existing) return { id: existing.id, created: false, softwareName: 'X' }
      sequence += 1
      const id = `12345678_20261008_${sequence}`
      reports.set(id, {
        ...data,
        id,
        status: 'RECORDED',
        softwareName: 'X',
        totalAmountInForint: data.total,
      })
      return { id, created: true, softwareName: 'X' }
    },
    listReports: async () =>
      ({
        items: [...reports.values()],
        page: 1,
        pageSize: 50,
        totalRowCount: reports.size,
      }) as never,
    getReport: async (id: string) => {
      const report = reports.get(id)
      if (!report) throw new Error('nincs')
      return report
    },
    modifyReport: async (id: string, data: NavReceiptData) => {
      const report = reports.get(id)
      if (!report) throw new Error('nincs')
      reports.set(id, { ...report, ...data })
      return { id }
    },
    invalidateReport: async (id: string) => {
      const report = reports.get(id)
      if (report) reports.set(id, { ...report, status: 'INVALIDATED' })
    },
    ...overrides,
  }
}

describe('NAV teszt-környezeti próba', () => {
  test('a próbajelentés átmegy a kassza saját NAV-validációján', () => {
    const report = rehearsalReport('2026-10-08', 'KASSZAPROBA', 1270)
    expect(() => validateNavReceiptData(report)).not.toThrow()
  })

  test('a teljes kör minden lépése lefut, sorrendben', async () => {
    const lines: string[] = []
    const results = await runNavRehearsal(fakeNav(), {
      date: '2026-10-08',
      serialNumber: 'KASSZAPROBA',
      log: (line) => lines.push(line),
    })
    expect(results.map((result) => result.step)).toEqual(REHEARSAL_STEPS)
    expect(results.every((result) => result.ok)).toBe(true)
    expect(lines).toHaveLength(REHEARSAL_STEPS.length)
  })

  test('éles környezetben vagy írási jog nélkül el sem indul', async () => {
    const options = { date: '2026-10-08', serialNumber: 'KASSZAPROBA' }
    await expect(
      runNavRehearsal(fakeNav({ environment: 'production' }) as never, options),
    ).rejects.toThrow('teszt környezetben')
    await expect(runNavRehearsal(fakeNav({ canWrite: false }) as never, options)).rejects.toThrow(
      'allowWrite',
    )
  })

  test('a hibás lépésnél megáll, és a részeredményeket is átadja', async () => {
    const nav = fakeNav({
      submitReport: async () => ({ id: '12345678_20261008_1', created: true, softwareName: 'X' }),
    })
    const error = (await runNavRehearsal(nav, {
      date: '2026-10-08',
      serialNumber: 'KASSZAPROBA',
    }).catch((caught: unknown) => caught)) as Error & { results: { step: string; ok: boolean }[] }
    expect(error.message).toContain('submitAgain')
    expect(error.results.at(-1)).toMatchObject({ step: 'submitAgain', ok: false })
  })

  test('ha nincs 27%-os áfakategória, jelzi', async () => {
    await expect(
      runNavRehearsal(fakeNav({ vatCategories: async () => [] }), {
        date: '2026-10-08',
        serialNumber: 'KASSZAPROBA',
      }),
    ).rejects.toThrow('vatCategories')
  })
})
