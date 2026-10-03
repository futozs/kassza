import { describe, expect, test } from 'vitest'
import { reconcileNavReports } from './reconcile'
import type { NavReceiptData, NavReportListItem } from './types'

function local(
  serialNumber: string,
  total: number,
  overrides: Partial<NavReceiptData> = {},
): NavReceiptData {
  return {
    applicableDate: '2026-10-01',
    serialNumber,
    currency: 'HUF',
    exchangeRate: null,
    vatCategories: [{ vat: '27%', saleDocument: total, modifyingDocument: 0 }],
    total,
    numberOfSaleDocument: 1,
    numberOfModifyingDocument: 0,
    ...overrides,
  }
}

function remote(
  id: string,
  serialNumber: string,
  totalAmount: number,
  overrides: Partial<NavReportListItem> = {},
): NavReportListItem {
  return {
    id,
    applicableDate: '2026-10-01',
    serialNumber,
    numberOfSaleDocument: 1,
    numberOfModifyingDocument: 0,
    totalAmount,
    totalAmountInForint: totalAmount,
    status: 'RECORDED',
    softwareName: 'Kassza 1.0',
    ...overrides,
  }
}

describe('reconcileNavReports', () => {
  test('egyezőt, eltérőt, hiányzót és váratlant külön sorol', () => {
    const result = reconcileNavReports(
      [local('A-1', 1000), local('B-1', 2000), local('C-1', 3000)],
      [
        remote('1_1_1', 'A-1', 1000),
        remote('1_1_2', 'B-1', 2500, { numberOfSaleDocument: 2, numberOfModifyingDocument: 1 }),
        remote('1_1_3', 'D-1', 4000),
      ],
    )
    expect(result.matched.map((pair) => pair.remote.id)).toEqual(['1_1_1'])
    expect(result.mismatched).toEqual([
      expect.objectContaining({
        differences: [
          'végösszeg: helyi 2000, NAV 2500',
          'nyugták száma: helyi 1, NAV 2',
          'módosító bizonylatok száma: helyi 0, NAV 1',
        ],
      }),
    ])
    expect(result.missing.map((report) => report.serialNumber)).toEqual(['C-1'])
    expect(result.unexpected.map((item) => item.id)).toEqual(['1_1_3'])
  })

  test('az érvénytelenített NAV rekordokat figyelmen kívül hagyja', () => {
    const result = reconcileNavReports(
      [local('A-1', 1000)],
      [remote('1_1_1', 'A-1', 900, { status: 'INVALIDATED' }), remote('1_1_2', 'A-1', 1000)],
    )
    expect(result.matched.map((pair) => pair.remote.id)).toEqual(['1_1_2'])
    expect(result.unexpected).toEqual([])
  })

  test('az ugyanarra a napra és sorszámra beküldött duplikátumot váratlanként jelzi', () => {
    const result = reconcileNavReports(
      [local('A-1', 1000)],
      [remote('1_1_1', 'A-1', 1000), remote('1_1_2', 'A-1', 1000)],
    )
    expect(result.matched).toHaveLength(1)
    expect(result.unexpected.map((item) => item.id)).toEqual(['1_1_2'])
  })

  test('a fillérnyi kerekítési eltérést egyezésnek veszi, a dátumot is figyeli', () => {
    const result = reconcileNavReports(
      [local('A-1', 1000.004), local('A-1', 1000, { applicableDate: '2026-10-02' })],
      [remote('1_1_1', 'A-1', 1000)],
    )
    expect(result.matched).toHaveLength(1)
    expect(result.missing.map((report) => report.applicableDate)).toEqual(['2026-10-02'])
  })
})
