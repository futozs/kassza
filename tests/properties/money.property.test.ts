import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { billingPeriod } from '../../src/batch'
import { attemptLedgerKey } from '../../src/core/attempt-ledger'
import {
  allocateRefund,
  calculateInvoiceItem,
  calculateReceiptItem,
  NUMERIC_VAT_RATES,
  SPECIAL_VAT_CODES,
  summarizeItems,
  type VatRate,
} from '../../src/money'

const RUNS = { numRuns: 400 }
const vat = fc.constantFrom<VatRate>(
  27,
  18,
  5,
  0,
  ...SPECIAL_VAT_CODES.slice(0, 4),
  ...NUMERIC_VAT_RATES.slice(5, 10),
)
const quantity = fc.oneof(
  fc.integer({ min: 1, max: 1_000 }),
  fc.integer({ min: 1, max: 99_999 }).map((value) => value / 1000),
)
const hufPrice = fc.integer({ min: 1, max: 5_000_000 })
const decimalPrice = fc.integer({ min: 1, max: 10_000_000 }).map((value) => value / 100)

function close(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6
}

describe('pénzszámítás invariánsai', () => {
  test('forintos számlatételnél nettó + áfa = bruttó, mind egész', () => {
    fc.assert(
      fc.property(vat, quantity, hufPrice, fc.boolean(), (rate, qty, price, fromGross) => {
        const item = calculateInvoiceItem(
          fromGross
            ? { quantity: qty, grossUnitPrice: price, vat: rate }
            : { quantity: qty, netUnitPrice: price, vat: rate },
          'HUF',
        )
        expect(close(item.netAmount + item.vatAmount, item.grossAmount)).toBe(true)
        expect(Number.isInteger(item.grossAmount)).toBe(true)
        expect(Number.isInteger(item.netAmount)).toBe(true)
        expect(Number.isInteger(item.vatAmount)).toBe(true)
      }),
      RUNS,
    )
  })

  test('devizás számlatételnél nettó + áfa = bruttó, legfeljebb két tizedes', () => {
    fc.assert(
      fc.property(vat, quantity, decimalPrice, fc.boolean(), (rate, qty, price, fromGross) => {
        const item = calculateInvoiceItem(
          fromGross
            ? { quantity: qty, grossUnitPrice: price, vat: rate }
            : { quantity: qty, netUnitPrice: price, vat: rate },
          'EUR',
        )
        expect(close(item.netAmount + item.vatAmount, item.grossAmount)).toBe(true)
        for (const amount of [item.netAmount, item.vatAmount, item.grossAmount]) {
          expect(close(Math.round(amount * 100) / 100, amount)).toBe(true)
        }
      }),
      RUNS,
    )
  })

  test('forintos nyugtán a bruttó mindig egész, nettó + áfa = bruttó', () => {
    fc.assert(
      fc.property(vat, quantity, hufPrice, fc.boolean(), (rate, qty, price, fromGross) => {
        const item = calculateReceiptItem(
          fromGross
            ? { quantity: qty, grossUnitPrice: price, vat: rate }
            : { quantity: qty, netUnitPrice: price, vat: rate },
          'HUF',
        )
        expect(Number.isInteger(item.grossAmount)).toBe(true)
        expect(close(item.netAmount + item.vatAmount, item.grossAmount)).toBe(true)
      }),
      RUNS,
    )
  })

  test('az áfa előjele egyezik a nettóéval, nulla kulcsnál nincs áfa', () => {
    fc.assert(
      fc.property(vat, quantity, hufPrice, fc.boolean(), (rate, qty, price, negative) => {
        const item = calculateInvoiceItem(
          { quantity: negative ? -qty : qty, netUnitPrice: price, vat: rate },
          'HUF',
        )
        if (typeof rate !== 'number' || rate === 0) expect(item.vatAmount).toBe(0)
        else if (item.vatAmount !== 0)
          expect(Math.sign(item.vatAmount)).toBe(Math.sign(item.netAmount))
      }),
      RUNS,
    )
  })

  test('a kosár végösszege a tételek sorrendjétől független', () => {
    const items = fc.array(
      fc
        .record({ quantity, netUnitPrice: hufPrice, vat })
        .map((input) => calculateInvoiceItem(input, 'HUF')),
      { minLength: 1, maxLength: 15 },
    )
    fc.assert(
      fc.property(items, fc.nat(), (list, seed) => {
        const shuffled = [...list].sort(
          (a, b) => ((a.grossAmount * 31 + seed) % 7) - ((b.grossAmount * 31 + seed) % 7),
        )
        const a = summarizeItems(list)
        const b = summarizeItems(shuffled)
        expect(a.grossAmount).toBe(b.grossAmount)
        expect(a.netAmount).toBe(b.netAmount)
        expect(
          close(
            a.grossAmount,
            list.reduce((sum, item) => sum + item.grossAmount, 0),
          ),
        ).toBe(true)
      }),
      RUNS,
    )
  })
})

describe('allocateRefund invariánsai', () => {
  const items = fc
    .array(
      fc.record({
        name: fc.constant('T'),
        vat,
        grossAmount: fc.integer({ min: 0, max: 1_000_000 }),
      }),
      { minLength: 1, maxLength: 12 },
    )
    .filter((list) => list.some((item) => item.grossAmount > 0))

  test('a szétosztás összege pontosan a visszatérítés, tételenként 0 és az eredeti között', () => {
    fc.assert(
      fc.property(items, fc.double({ min: 0, max: 1, noNaN: true }), (list, fraction) => {
        const total = list.reduce((sum, item) => sum + item.grossAmount, 0)
        const refund = Math.max(1, Math.floor(total * fraction))
        const allocation = allocateRefund(list, refund)
        expect(allocation.reduce((sum, item) => sum + item.grossAmount, 0)).toBe(refund)
        for (const entry of allocation) {
          expect(entry.grossAmount).toBeGreaterThan(0)
          expect(entry.grossAmount).toBeLessThanOrEqual(list[entry.index]?.grossAmount ?? -1)
          expect(entry.vat).toBe(list[entry.index]?.vat)
        }
      }),
      RUNS,
    )
  })

  test('egymást követő visszatérítések tételenként sem lépik túl az eredetit', () => {
    fc.assert(
      fc.property(
        items,
        fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 10 }),
        (list, weights) => {
          const total = list.reduce((sum, item) => sum + item.grossAmount, 0)
          const weightSum = weights.reduce((sum, weight) => sum + weight, 0)
          const refunds = weights
            .map((weight) => Math.floor((total * weight) / weightSum))
            .filter((value) => value > 0)
          const perItem = list.map(() => 0)
          let before = 0
          for (const refund of refunds) {
            for (const entry of allocateRefund(list, refund, { refundedBefore: before })) {
              perItem[entry.index] = (perItem[entry.index] ?? 0) + entry.grossAmount
            }
            before += refund
          }
          for (const [index, item] of list.entries()) {
            expect(perItem[index]).toBeLessThanOrEqual(item.grossAmount)
          }
          expect(perItem.reduce((sum, value) => sum + value, 0)).toBe(before)
        },
      ),
      RUNS,
    )
  })
})

describe('allocateRefund útfüggetlensége', () => {
  const items = fc
    .array(
      fc.record({
        name: fc.constant('T'),
        vat,
        grossAmount: fc.integer({ min: 0, max: 1_000_000 }),
      }),
      {
        minLength: 1,
        maxLength: 10,
      },
    )
    .filter((list) => list.some((item) => item.grossAmount > 0))

  test('ugyanaz az összeg egyben vagy részletekben ugyanazt a tételenkénti végeredményt adja', () => {
    fc.assert(
      fc.property(
        items,
        fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 2, maxLength: 8 }),
        fc.double({ min: 0.01, max: 1, noNaN: true }),
        (list, weights, fraction) => {
          const total = list.reduce((sum, item) => sum + item.grossAmount, 0)
          const target = Math.max(weights.length, Math.floor(total * fraction))
          if (target > total) return
          const weightSum = weights.reduce((sum, weight) => sum + weight, 0)
          const parts = weights.map((weight) =>
            Math.max(1, Math.floor((target * weight) / weightSum)),
          )
          const partSum = parts.reduce((sum, part) => sum + part, 0)
          if (partSum > total) return
          const stepwise = list.map(() => 0)
          let before = 0
          for (const part of parts) {
            for (const entry of allocateRefund(list, part, { refundedBefore: before })) {
              stepwise[entry.index] = (stepwise[entry.index] ?? 0) + entry.grossAmount
            }
            before += part
          }
          const single = list.map(() => 0)
          for (const entry of allocateRefund(list, partSum)) single[entry.index] = entry.grossAmount
          expect(stepwise).toEqual(single)
        },
      ),
      RUNS,
    )
  })

  test('a teljes összeg visszatérítése pontosan az eredeti tételeket adja', () => {
    fc.assert(
      fc.property(items, (list) => {
        const total = list.reduce((sum, item) => sum + item.grossAmount, 0)
        const result = list.map(() => 0)
        for (const entry of allocateRefund(list, total)) result[entry.index] = entry.grossAmount
        expect(result).toEqual(list.map((item) => item.grossAmount))
      }),
      RUNS,
    )
  })
})

describe('egyéb invariánsok', () => {
  test('a próbálkozás-napló kulcsa determinisztikus, és eltérő kérésre eltér', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), fc.string(), async (a, b) => {
        const keyA = await attemptLedgerKey({ action: 'createInvoice', xml: a })
        expect(await attemptLedgerKey({ action: 'createInvoice', xml: a })).toBe(keyA)
        if (a !== b)
          expect(await attemptLedgerKey({ action: 'createInvoice', xml: b })).not.toBe(keyA)
      }),
      { numRuns: 100 },
    )
  })

  test('a számlázási időszakok hézag és átfedés nélkül követik egymást', () => {
    const day = fc.date({
      min: new Date('2020-01-01'),
      max: new Date('2035-12-31'),
      noInvalidDate: true,
    })
    fc.assert(
      fc.property(
        day,
        fc.constantFrom('week', 'month', 'quarter', 'year' as const),
        fc.integer({ min: 0, max: 60 }),
        (anchor, interval, index) => {
          const options = { interval, anchor: anchor.toISOString().slice(0, 10) }
          const current = billingPeriod(options, index)
          const next = billingPeriod(options, index + 1)
          const afterEnd = new Date(`${current.end}T00:00:00Z`)
          afterEnd.setUTCDate(afterEnd.getUTCDate() + 1)
          expect(afterEnd.toISOString().slice(0, 10)).toBe(next.start)
          expect(current.start <= current.end).toBe(true)
        },
      ),
      RUNS,
    )
  })
})
