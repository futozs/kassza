import { describe, expect, test } from 'vitest'
import {
  addMoney,
  calculateInvoiceItem,
  calculateItemAmounts,
  calculateReceiptItem,
  decimalPlaces,
  formatVatRate,
  isHuf,
  isVatRate,
  NUMERIC_VAT_RATES,
  roundMoney,
  summarizeItems,
  vatPercentage,
} from './index'

function seededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function isWithinDecimals(value: number, decimals: number): boolean {
  return decimalPlaces(value) <= decimals
}

describe('roundMoney', () => {
  test.each([
    [1.005, 2, 1.01],
    [2.675, 2, 2.68],
    [1.255, 2, 1.26],
    [-1.005, 2, -1.01],
    [0.5, 0, 1],
    [-0.5, 0, -1],
    [318.89, 0, 319],
    [1180.98, 0, 1181],
    [12.3449999, 2, 12.34],
  ])(
    '%d kerekítve %d tizedesre = %d (half away from zero, lebegőpontos zaj nélkül)',
    (value, decimals, expected) => {
      expect(roundMoney(value, decimals)).toBe(expected)
    },
  )

  test('negatív nullát nem ad vissza', () => {
    expect(Object.is(roundMoney(-0.0001, 2), 0)).toBe(true)
  })

  test('nem véges számra RangeError-t dob', () => {
    expect(() => roundMoney(Number.NaN)).toThrow(RangeError)
  })
})

describe('decimalPlaces és addMoney', () => {
  test('megszámolja a tizedesjegyeket, az exponenciális alakot is', () => {
    expect(decimalPlaces(10)).toBe(0)
    expect(decimalPlaces(787.4)).toBe(1)
    expect(decimalPlaces(0.1 + 0.2)).toBe(1)
    expect(decimalPlaces(1e-7)).toBe(7)
    expect(decimalPlaces(Number.NaN)).toBe(0)
  })

  test('az összeadás nem hagy lebegőpontos zajt', () => {
    expect(addMoney(0.1, 0.2)).toBe(0.3)
    expect(addMoney(787.4, 212.6)).toBe(1000)
    expect(addMoney()).toBe(0)
  })
})

describe('áfakulcsok és pénznem', () => {
  test('ismeri a docs összes áfakulcsát és különleges kódját', () => {
    expect(NUMERIC_VAT_RATES).toContain(25.5)
    expect(isVatRate(27)).toBe(true)
    expect(isVatRate(4.8)).toBe(true)
    expect(isVatRate('TAM')).toBe(true)
    expect(isVatRate('F.AFA')).toBe(true)
    expect(isVatRate(28)).toBe(false)
    expect(isVatRate('27')).toBe(false)
    expect(isVatRate(undefined)).toBe(false)
  })

  test('a különleges kódok 0% áfát jelentenek', () => {
    expect(vatPercentage('AAM')).toBe(0)
    expect(vatPercentage(18)).toBe(18)
    expect(formatVatRate('K.AFA')).toBe('K.AFA')
    expect(formatVatRate(5.5)).toBe('5.5')
  })

  test('a HUF, Ft és hiányzó pénznem forintnak számít', () => {
    expect(isHuf(undefined)).toBe(true)
    expect(isHuf('HUF')).toBe(true)
    expect(isHuf(' Ft ')).toBe(true)
    expect(isHuf('EUR')).toBe(false)
  })
})

describe('calculateInvoiceItem: forintos számla', () => {
  test('nettó alapú kerekítés a docs példája szerint (3 × 500 Ft, 27%)', () => {
    expect(calculateInvoiceItem({ quantity: 3, netUnitPrice: 500, vat: 27 })).toEqual({
      quantity: 3,
      vat: 27,
      netUnitPrice: 500,
      netAmount: 1500,
      vatAmount: 405,
      grossAmount: 1905,
    })
  })

  test('bruttó alapú kerekítés a docs példája szerint (3 × 500 Ft bruttó, 27%)', () => {
    expect(calculateInvoiceItem({ quantity: 3, grossUnitPrice: 500, vat: 27 })).toEqual({
      quantity: 3,
      vat: 27,
      netUnitPrice: 393.67,
      netAmount: 1181,
      vatAmount: 319,
      grossAmount: 1500,
    })
  })

  test('bruttó egységárból fillérre pontos bruttó végösszeg (nevezési díj)', () => {
    expect(calculateInvoiceItem({ grossUnitPrice: 26_000, vat: 27 })).toMatchObject({
      netAmount: 20_472,
      vatAmount: 5_528,
      grossAmount: 26_000,
    })
  })

  test('tört nettó egységárnál a tétel nettó értéke egész', () => {
    expect(calculateInvoiceItem({ quantity: 7, netUnitPrice: 123.45, vat: 27 })).toMatchObject({
      netUnitPrice: 123.45,
      netAmount: 864,
      vatAmount: 233,
      grossAmount: 1097,
    })
  })

  test('tárgyi adómentes tételnél nincs áfa', () => {
    expect(calculateInvoiceItem({ grossUnitPrice: 9990, vat: 'TAM' })).toMatchObject({
      netAmount: 9990,
      vatAmount: 0,
      grossAmount: 9990,
    })
  })

  test('negatív mennyiségnél (végszámla, helyesbítés) szimmetrikusan kerekít', () => {
    const positive = calculateInvoiceItem({ quantity: 3, grossUnitPrice: 500, vat: 27 })
    const negative = calculateInvoiceItem({ quantity: -3, grossUnitPrice: 500, vat: 27 })

    expect(negative.netAmount).toBe(-positive.netAmount)
    expect(negative.vatAmount).toBe(-positive.vatAmount)
    expect(negative.grossAmount).toBe(-positive.grossAmount)
  })

  test('alapértelmezett mennyiség 1', () => {
    expect(calculateInvoiceItem({ netUnitPrice: 1000, vat: 5 }).quantity).toBe(1)
  })

  test('véletlen inputokra is teljesülnek a Számlázz.hu ellenőrzései (egész összegek)', () => {
    const random = seededRandom(20260916)
    for (let run = 0; run < 2000; run++) {
      const vat = NUMERIC_VAT_RATES[Math.floor(random() * NUMERIC_VAT_RATES.length)] ?? 27
      const quantity = roundMoney(1 + random() * 250, random() < 0.5 ? 0 : 2)
      const price = roundMoney(random() * 500_000, random() < 0.5 ? 0 : 2)
      const input =
        random() < 0.5
          ? { quantity, vat, netUnitPrice: price }
          : { quantity, vat, grossUnitPrice: price }

      const item = calculateInvoiceItem(input)

      expect(Number.isInteger(item.netAmount)).toBe(true)
      expect(Number.isInteger(item.vatAmount)).toBe(true)
      expect(Number.isInteger(item.grossAmount)).toBe(true)
      expect(item.netAmount + item.vatAmount).toBe(item.grossAmount)
      expect(Math.abs(item.netUnitPrice * item.quantity - item.netAmount)).toBeLessThanOrEqual(
        0.500001,
      )
      expect(Math.abs((item.netAmount * vat) / 100 - item.vatAmount)).toBeLessThanOrEqual(1)
    }
  })
})

describe('calculateInvoiceItem: devizás számla', () => {
  test('2 tizedesre kerekít, és nem kényszerít egész összeget', () => {
    expect(calculateInvoiceItem({ quantity: 3, netUnitPrice: 10.99, vat: 27 }, 'EUR')).toEqual({
      quantity: 3,
      vat: 27,
      netUnitPrice: 10.99,
      netAmount: 32.97,
      vatAmount: 8.9,
      grossAmount: 41.87,
    })
  })

  test('bruttó alapon is pontos bruttót ad', () => {
    expect(
      calculateInvoiceItem({ quantity: 2, grossUnitPrice: 19.99, vat: 21 }, 'EUR'),
    ).toMatchObject({
      netAmount: 33.04,
      vatAmount: 6.94,
      grossAmount: 39.98,
    })
  })
})

describe('calculateReceiptItem: forintos nyugta', () => {
  test('a docs példája: 1000 Ft bruttó, 27% → 787.40 + 212.60', () => {
    expect(calculateReceiptItem({ grossUnitPrice: 1000, vat: 27 })).toEqual({
      quantity: 1,
      vat: 27,
      netUnitPrice: 787.4,
      netAmount: 787.4,
      vatAmount: 212.6,
      grossAmount: 1000,
    })
  })

  test('nettó egységárból egész bruttót számol', () => {
    expect(calculateReceiptItem({ quantity: 2, netUnitPrice: 787.4, vat: 27 })).toMatchObject({
      netAmount: 1574.8,
      grossAmount: 2000,
      vatAmount: 425.2,
    })
  })

  test('véletlen inputokra is teljesülnek a szigorú nyugtaszabályok (261, 363, 364, 365)', () => {
    const random = seededRandom(42)
    for (let run = 0; run < 2000; run++) {
      const vat = NUMERIC_VAT_RATES[Math.floor(random() * NUMERIC_VAT_RATES.length)] ?? 27
      const quantity = roundMoney(1 + random() * 40, random() < 0.7 ? 0 : 3)
      const price = roundMoney(random() * 100_000, random() < 0.5 ? 0 : 2)
      const input =
        random() < 0.5
          ? { quantity, vat, netUnitPrice: price }
          : { quantity, vat, grossUnitPrice: price }

      const item = calculateReceiptItem(input)

      expect(Number.isInteger(item.grossAmount)).toBe(true)
      expect(isWithinDecimals(item.netAmount, 2)).toBe(true)
      expect(isWithinDecimals(item.vatAmount, 2)).toBe(true)
      expect(addMoney(item.netAmount, item.vatAmount)).toBe(item.grossAmount)
      expect(Math.abs(item.netUnitPrice * item.quantity - item.netAmount)).toBeLessThanOrEqual(2)
      expect(Math.abs((item.netAmount * vat) / 100 - item.vatAmount)).toBeLessThanOrEqual(2)
    }
  })

  test('devizás nyugtán 2 tizedesre kerekít', () => {
    expect(calculateReceiptItem({ grossUnitPrice: 12.5, vat: 27 }, 'EUR')).toMatchObject({
      grossAmount: 12.5,
      vatAmount: 2.66,
      netAmount: 9.84,
    })
  })
})

describe('explicit összegek', () => {
  test('a megadott összegeket változatlanul használja, és egységárat számol hozzá', () => {
    expect(
      calculateItemAmounts(
        { quantity: 4, vat: 27, netAmount: 1000, vatAmount: 270, grossAmount: 1270 },
        { kind: 'invoice' },
      ),
    ).toEqual({
      quantity: 4,
      vat: 27,
      netUnitPrice: 250,
      netAmount: 1000,
      vatAmount: 270,
      grossAmount: 1270,
    })
  })

  test('a megadott nettó egységárat megtartja', () => {
    expect(
      calculateInvoiceItem({
        netUnitPrice: 99.5,
        vat: 27,
        netAmount: 100,
        vatAmount: 27,
        grossAmount: 127,
      }).netUnitPrice,
    ).toBe(99.5)
  })

  test('hiányos explicit összegre validációs hibát dob', () => {
    expect(() => calculateInvoiceItem({ vat: 27, netAmount: 100 })).toThrow(
      expect.objectContaining({ category: 'validation' }),
    )
  })
})

describe('validáció', () => {
  test.each([
    ['0 mennyiség', { quantity: 0, netUnitPrice: 1, vat: 27 }, /mennyisége/],
    ['NaN ár', { netUnitPrice: Number.NaN, vat: 27 }, /netUnitPrice/],
    ['ismeretlen áfakulcs', { netUnitPrice: 1, vat: 28 }, /áfakulcs/],
    [
      'nettó és bruttó egységár együtt',
      { netUnitPrice: 1, grossUnitPrice: 1, vat: 27 },
      /csak az egyiket/,
    ],
    ['nincs ár', { vat: 27 }, /netUnitPrice vagy a grossUnitPrice/],
  ])('%s esetén validációs hibát dob', (_name, input, message) => {
    expect(() => calculateInvoiceItem(input)).toThrow(message)
  })
})

describe('summarizeItems', () => {
  test('összesít és áfakulcsonként csoportosít', () => {
    const items = [
      calculateInvoiceItem({ quantity: 3, netUnitPrice: 500, vat: 27 }),
      calculateInvoiceItem({ netUnitPrice: 1000, vat: 5 }),
      calculateInvoiceItem({ netUnitPrice: 200, vat: 27 }),
      calculateInvoiceItem({ netUnitPrice: 300, vat: 'AAM' }),
    ]

    expect(summarizeItems(items)).toEqual({
      netAmount: 3000,
      vatAmount: 509,
      grossAmount: 3509,
      byVat: [
        { vat: 27, netAmount: 1700, vatAmount: 459, grossAmount: 2159 },
        { vat: 5, netAmount: 1000, vatAmount: 50, grossAmount: 1050 },
        { vat: 'AAM', netAmount: 300, vatAmount: 0, grossAmount: 300 },
      ],
    })
  })

  test('üres listára nullákat ad', () => {
    expect(summarizeItems([])).toEqual({ netAmount: 0, vatAmount: 0, grossAmount: 0, byVat: [] })
  })
})
