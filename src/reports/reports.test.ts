import { describe, expect, test } from 'vitest'
import type { Receipt, ReceiptItem } from '../receipts/types'
import { createMockKassza } from '../testing'
import { dailyClose } from './close'
import { describeNavReport, navCurrencyCode, navDailyReports, splitReceiptNumber } from './nav'
import { isNavVatCategory, NAV_VAT_CATEGORIES, navVatCategory } from './vat-category'

function item(name: string, gross: number, vat: ReceiptItem['vat'] = 27): ReceiptItem {
  const percentage = typeof vat === 'number' ? vat : 0
  const vatAmount = Math.round(((gross * percentage) / (100 + percentage)) * 100) / 100
  return {
    name,
    quantity: 1,
    unit: 'db',
    netUnitPrice: gross - vatAmount,
    vat,
    vatPercentage: percentage,
    netAmount: gross - vatAmount,
    vatAmount,
    grossAmount: gross,
  }
}

function receipt(
  number: string,
  items: readonly ReceiptItem[],
  overrides: Partial<Receipt> = {},
): Receipt {
  const gross = items.reduce((sum, entry) => sum + entry.grossAmount, 0)
  return {
    id: 1,
    number,
    type: 'receipt',
    isReversed: false,
    issueDate: '2026-10-01',
    paymentMethod: 'bankkártya',
    currency: 'HUF',
    isTest: false,
    items,
    payments: [],
    totals: { netAmount: gross, vatAmount: 0, grossAmount: gross, byVat: [] },
    ...overrides,
  }
}

const COFFEE = item('Kávé', 890, 27)
const CROISSANT = item('Kifli', 250, 5)

describe('navVatCategory', () => {
  test('a NAV hat áfakategóriájára képez', () => {
    expect(navVatCategory(27)).toBe('27%')
    expect(navVatCategory(18)).toBe('18%')
    expect(navVatCategory(5)).toBe('5%')
    expect(navVatCategory(0)).toBe('0%')
    expect(navVatCategory('AAM')).toBe('Alanyi adómentes')
    expect(navVatCategory('TAM')).toBe('Egyéb')
    expect(navVatCategory('ÁKK')).toBe('Egyéb')
    expect(navVatCategory(20)).toBe('Egyéb')
    expect(NAV_VAT_CATEGORIES).toHaveLength(6)
    expect(isNavVatCategory('27%')).toBe(true)
    expect(isNavVatCategory('30%')).toBe(false)
  })
})

describe('splitReceiptNumber és navCurrencyCode', () => {
  test('a Számlázz.hu nyugtaszámot sorozatra és sorszámra bontja', () => {
    expect(splitReceiptNumber('NYGT-2026-41')).toEqual({ series: 'NYGT-2026', sequence: 41 })
    expect(splitReceiptNumber(' AB 123 ')).toEqual({ series: 'AB 123', sequence: undefined })
    expect(navCurrencyCode('Ft')).toBe('HUF')
    expect(navCurrencyCode(' eur ')).toBe('EUR')
  })
})

describe('navDailyReports', () => {
  test('a NAV szabályai szerint összesít: értékesítés és sztornó külön, nettózás nélkül', () => {
    const reports = navDailyReports([
      receipt('NYGT-2026-41', [COFFEE, CROISSANT]),
      receipt('NYGT-2026-42', [COFFEE]),
      receipt('NYGT-2026-43', [item('Kávé', -890, 27), item('Kifli', -250, 5)], {
        type: 'reversal',
        reversedReceiptNumber: 'NYGT-2026-41',
      }),
    ])

    expect(reports).toEqual([
      {
        applicableDate: '2026-10-01',
        series: 'NYGT-2026',
        serialNumber: 'NYGT-2026-41',
        currency: 'HUF',
        exchangeRate: null,
        vatCategories: [
          { vat: '5%', saleDocument: 250, modifyingDocument: -250 },
          { vat: '27%', saleDocument: 1780, modifyingDocument: -890 },
        ],
        total: 890,
        numberOfSaleDocument: 2,
        numberOfModifyingDocument: 1,
        receiptNumbers: ['NYGT-2026-41', 'NYGT-2026-42', 'NYGT-2026-43'],
      },
    ])
  })

  test('a kezdő sorszámot numerikusan választja, nem szövegként', () => {
    const [report] = navDailyReports([
      receipt('NYGT-2026-10', [COFFEE]),
      receipt('NYGT-2026-9', [COFFEE]),
    ])

    expect(report?.serialNumber).toBe('NYGT-2026-9')
    expect(report?.receiptNumbers).toEqual(['NYGT-2026-9', 'NYGT-2026-10'])
  })

  test('naponként, sorozatonként, pénznemenként és árfolyamonként külön jelentést ad', () => {
    const reports = navDailyReports([
      receipt('NYGT-2026-1', [COFFEE], { currency: 'Ft' }),
      receipt('NYGT-2026-2', [COFFEE], { issueDate: '2026-10-02' }),
      receipt('WEB-2026-1', [COFFEE]),
      receipt('NYGT-2026-3', [item('Ticket', 10, 27)], {
        currency: 'EUR',
        exchangeRate: 395.123456,
      }),
      receipt('NYGT-2026-4', [item('Ticket', 10, 27)], { currency: 'EUR', exchangeRate: 401 }),
    ])

    expect(
      reports.map((report) => [
        report.applicableDate,
        report.series,
        report.currency,
        report.exchangeRate,
      ]),
    ).toEqual([
      ['2026-10-01', 'NYGT-2026', 'EUR', 395.1235],
      ['2026-10-01', 'NYGT-2026', 'EUR', 401],
      ['2026-10-01', 'NYGT-2026', 'HUF', null],
      ['2026-10-01', 'WEB-2026', 'HUF', null],
      ['2026-10-02', 'NYGT-2026', 'HUF', null],
    ])
  })

  test('a tesztnyugtákat és az ismétlődő nyugtaszámokat kihagyja', () => {
    const reports = navDailyReports([
      receipt('NYGT-2026-1', [COFFEE]),
      receipt('NYGT-2026-1', [COFFEE]),
      receipt('NYGT-2026-2', [COFFEE], { isTest: true }),
    ])

    expect(reports[0]).toMatchObject({ numberOfSaleDocument: 1, total: 890 })
    expect(
      navDailyReports([receipt('NYGT-2026-2', [COFFEE], { isTest: true })], { includeTest: true }),
    ).toHaveLength(1)
  })

  test('a pozitív összegű sztornó tételt is negatívként számolja', () => {
    const [report] = navDailyReports([receipt('NYGT-2026-5', [COFFEE], { type: 'reversal' })])

    expect(report).toMatchObject({
      numberOfSaleDocument: 0,
      numberOfModifyingDocument: 1,
      total: -890,
      vatCategories: [{ vat: '27%', saleDocument: 0, modifyingDocument: -890 }],
    })
  })

  test('egyedi kategória- és sorozat-leképezést is elfogad', () => {
    const [report] = navDailyReports([receipt('X/1', [COFFEE])], {
      vatCategory: () => 'Egyéb',
      series: () => 'X',
    })

    expect(report).toMatchObject({
      series: 'X',
      vatCategories: [{ vat: 'Egyéb', saleDocument: 890 }],
    })
  })

  test('árfolyam nélküli devizás nyugtánál és hibás keltnél hibát dob', () => {
    expect(() => navDailyReports([receipt('NYGT-2026-1', [COFFEE], { currency: 'EUR' })])).toThrow(
      /árfolyam/,
    )
    expect(() => navDailyReports([receipt('NYGT-2026-1', [COFFEE], { issueDate: '' })])).toThrow(
      /kelte érvénytelen/,
    )
  })

  test('a mock nyugtáiból is helyes összesítést ad', async () => {
    const kassza = createMockKassza({ now: () => new Date('2026-10-01T10:00:00Z') })
    const sale = await kassza.receipts.create({
      prefix: 'NYGT',
      paymentMethod: 'készpénz',
      items: [{ name: 'Kávé', grossUnitPrice: 890, vat: 27 }],
    })

    const reports = navDailyReports([sale], { includeTest: true })

    expect(reports).toMatchObject([
      { total: 890, numberOfSaleDocument: 1, serialNumber: sale.number },
    ])
  })

  test('olvasható összefoglalót ad kézi KOBAK rögzítéshez', () => {
    const [huf, eur] = navDailyReports([
      receipt('NYGT-2026-41', [COFFEE, CROISSANT]),
      receipt('WEB-2026-1', [item('Ticket', 10, 27)], { currency: 'EUR', exchangeRate: 395 }),
    ])
    if (!huf || !eur) throw new Error('Két jelentést vártunk')

    const text = describeNavReport(huf)

    expect(text).toContain('Tárgynap: 2026-10-01')
    expect(text).toContain('Kezdő nyugtasorszám: NYGT-2026-41')
    expect(text).toContain('Pénznem: HUF')
    expect(text).toContain('Nyugták száma: 1, módosító/érvénytelenítő bizonylatok száma: 0')
    expect(describeNavReport(eur)).toContain('Pénznem: EUR (árfolyam: 395)')
  })
})

describe('dailyClose', () => {
  test('fizetési módonként és áfakulcsonként zár, a sztornót levonja', () => {
    const summaries = dailyClose([
      receipt('NYGT-2026-1', [COFFEE, CROISSANT], {
        payments: [
          { method: 'SZÉP kártya', amount: 1000 },
          { method: 'bankkártya', amount: 140 },
        ],
      }),
      receipt('NYGT-2026-2', [COFFEE], { paymentMethod: 'készpénz' }),
      receipt('NYGT-2026-3', [COFFEE], { type: 'reversal', paymentMethod: 'készpénz' }),
      receipt('NYGT-2026-4', [COFFEE], { issueDate: '2026-10-02', paymentMethod: ' ' }),
    ])

    expect(summaries).toHaveLength(2)
    expect(summaries[0]).toMatchObject({
      date: '2026-10-01',
      currency: 'HUF',
      receiptCount: 2,
      reversalCount: 1,
      salesGross: 2030,
      reversalsGross: -890,
      grossTotal: 1140,
      byPaymentMethod: [
        { method: 'bankkártya', amount: 140 },
        { method: 'készpénz', amount: 0 },
        { method: 'SZÉP kártya', amount: 1000 },
      ],
      receiptNumbers: ['NYGT-2026-1', 'NYGT-2026-2', 'NYGT-2026-3'],
    })
    expect(summaries[0]?.byVat.map((row) => [row.vat, row.grossAmount])).toEqual([
      [5, 250],
      [27, 890],
    ])
    expect(summaries[1]?.byPaymentMethod).toEqual([{ method: 'ismeretlen', amount: 890 }])
  })

  test('a tesztnyugtákat alapból kihagyja, az ismétlődőket egyszer számolja', () => {
    const test = receipt('NYGT-2026-1', [COFFEE], { isTest: true })

    expect(dailyClose([test])).toEqual([])
    expect(dailyClose([test, test], { includeTest: true })[0]?.receiptCount).toBe(1)
  })
})
