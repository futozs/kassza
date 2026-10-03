import { describe, expect, test } from 'vitest'
import { paperReceiptReport } from './paper'
import { validateNavReceiptData } from './validate'

describe('paperReceiptReport', () => {
  test('a papír nyugtákat áfakategóriánként, eladás és visszavétel szerint összesíti', () => {
    const report = paperReceiptReport({
      applicableDate: '2026-10-01',
      entries: [
        { number: 'AB 0000102', vat: '27%', gross: 890 },
        { number: 'AB 0000102', vat: '5%', gross: 250 },
        { number: 'AB 0000101', vat: '27%', gross: 1500 },
        { number: 'AB 0000103', vat: '27%', gross: -890, modifying: true },
      ],
    })
    expect(report).toEqual({
      applicableDate: '2026-10-01',
      serialNumber: 'AB 0000101',
      currency: 'HUF',
      exchangeRate: null,
      vatCategories: [
        { vat: '5%', saleDocument: 250, modifyingDocument: 0 },
        { vat: '27%', saleDocument: 2390, modifyingDocument: -890 },
      ],
      total: 1750,
      numberOfSaleDocument: 2,
      numberOfModifyingDocument: 1,
    })
    expect(() => validateNavReceiptData(report, { today: '2026-10-02' })).not.toThrow()
  })

  test('a numerikus sorszámot számként rendezi, és Date tárgynapot is elfogad', () => {
    const report = paperReceiptReport({
      applicableDate: new Date('2026-09-30T23:30:00Z'),
      entries: [
        { number: 'NY-10', vat: 'Alanyi adómentes', gross: 100 },
        { number: 'NY-9', vat: 'Alanyi adómentes', gross: 100.004 },
      ],
    })
    expect(report).toMatchObject({
      applicableDate: '2026-10-01',
      serialNumber: 'NY-9',
      vatCategories: [{ vat: 'Alanyi adómentes', saleDocument: 200, modifyingDocument: 0 }],
      total: 200,
    })
  })

  test('devizás nyugtatömbnél megtartja az árfolyamot', () => {
    expect(
      paperReceiptReport({
        applicableDate: '2026-10-01',
        currency: 'eur',
        exchangeRate: 395.5,
        entries: [{ number: 'E-1', vat: '27%', gross: 10 }],
      }),
    ).toMatchObject({ currency: 'EUR', exchangeRate: 395.5 })
  })

  test.each([
    ['üres lista', [], 'legalább egy'],
    ['hiányzó sorszám', [{ number: ' ', vat: '27%', gross: 1 }], 'sorszámát'],
    ['érvénytelen összeg', [{ number: 'A-1', vat: '27%', gross: Number.NaN }], 'érvénytelen'],
    ['negatív eladás', [{ number: 'A-1', vat: '27%', gross: -1 }], 'negatív'],
    [
      'eladás és visszavétel ugyanazzal a sorszámmal',
      [
        { number: 'A-1', vat: '27%', gross: 100 },
        { number: 'A-1', vat: '27%', gross: -100, modifying: true },
      ],
      'egyszerre',
    ],
  ])('%s esetén validációs hibát dob', (_label, entries, fragment) => {
    expect(() => paperReceiptReport({ applicableDate: '2026-10-01', entries })).toThrow(
      expect.objectContaining({
        category: 'validation',
        message: expect.stringContaining(fragment),
      }),
    )
  })
})
