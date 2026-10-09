import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import type { Receipt } from '../../src/receipts/types'
import { dailyClose, navDailyReports } from '../../src/reports'

const receipt = fc
  .record({
    serial: fc.constantFrom('NYGT', 'BOLT'),
    sequence: fc.integer({ min: 1, max: 500 }),
    day: fc.integer({ min: 1, max: 3 }),
    reversal: fc.boolean(),
    items: fc.array(
      fc.record({
        vat: fc.constantFrom(27, 18, 5, 0, 'AAM'),
        gross: fc.integer({ min: 1, max: 100_000 }),
      }),
      { minLength: 1, maxLength: 5 },
    ),
  })
  .map(({ serial, sequence, day, reversal, items }): Receipt => {
    const sign = reversal ? -1 : 1
    const total = items.reduce((sum, item) => sum + item.gross, 0) * sign
    return {
      id: sequence,
      number: `${serial}-2026-${sequence}`,
      type: reversal ? 'reversal' : 'receipt',
      isReversed: false,
      issueDate: `2026-10-0${day}`,
      paymentMethod: 'készpénz',
      currency: 'HUF',
      isTest: false,
      items: items.map((item, index) => ({
        name: `T${index}`,
        quantity: 1,
        unit: 'db',
        netUnitPrice: item.gross,
        vat: item.vat as Receipt['items'][number]['vat'],
        vatPercentage: typeof item.vat === 'number' ? item.vat : 0,
        netAmount: item.gross * sign,
        vatAmount: 0,
        grossAmount: item.gross * sign,
      })),
      payments: [],
      totals: { netAmount: total, vatAmount: 0, grossAmount: total },
    } as unknown as Receipt
  })

const receipts = fc.uniqueArray(receipt, { selector: (value) => value.number, maxLength: 30 })

describe('NAV napi összesítő invariánsai', () => {
  test('a bemenet sorrendje nem változtat az eredményen', () => {
    fc.assert(
      fc.property(receipts, fc.nat(), (list, seed) => {
        const shuffled = [...list].sort(
          (a, b) => ((a.id * 7919 + seed) % 101) - ((b.id * 7919 + seed) % 101),
        )
        expect(navDailyReports(shuffled)).toEqual(navDailyReports(list))
        expect(dailyClose(shuffled)).toEqual(dailyClose(list))
      }),
      { numRuns: 300 },
    )
  })

  test('a darabszámok nem nettósodnak, az ismételt nyugta nem számít kétszer', () => {
    fc.assert(
      fc.property(receipts, (list) => {
        const reports = navDailyReports([...list, ...list])
        const sales = reports.reduce((sum, report) => sum + report.numberOfSaleDocument, 0)
        const modifying = reports.reduce((sum, report) => sum + report.numberOfModifyingDocument, 0)
        expect(sales).toBe(list.filter((item) => item.type !== 'reversal').length)
        expect(modifying).toBe(list.filter((item) => item.type === 'reversal').length)
      }),
      { numRuns: 300 },
    )
  })
})
