import { describe, expect, test } from 'vitest'
import type { NavReceiptData } from './types'
import {
  assertReportId,
  assertSoftwareName,
  NAV_SERIAL_NUMBER_PATTERN,
  navDate,
  navTaxpayerId,
  validateNavReceiptData,
} from './validate'

const TODAY = '2026-10-02'

const REPORT: NavReceiptData = {
  applicableDate: '2026-10-01',
  serialNumber: 'NYGT-2026-41',
  currency: 'HUF',
  exchangeRate: null,
  vatCategories: [
    { vat: '27%', saleDocument: 1780, modifyingDocument: -890 },
    { vat: '5%', saleDocument: 250, modifyingDocument: -250 },
  ],
  total: 890,
  numberOfSaleDocument: 2,
  numberOfModifyingDocument: 1,
}

function check(overrides: Partial<NavReceiptData>): () => void {
  return () => validateNavReceiptData({ ...REPORT, ...overrides }, { today: TODAY })
}

describe('validateNavReceiptData', () => {
  test('a NAV specifikáció szerinti jelentést elfogadja', () => {
    expect(check({})).not.toThrow()
    expect(check({ applicableDate: TODAY })).not.toThrow()
    expect(check({ exchangeRate: 1 })).not.toThrow()
  })

  test('a devizás jelentést árfolyammal elfogadja', () => {
    expect(
      check({
        currency: 'EUR',
        exchangeRate: 395.1234,
        vatCategories: [{ vat: '27%', saleDocument: 12.5, modifyingDocument: 0 }],
        total: 12.5,
      }),
    ).not.toThrow()
  })

  test.each([
    ['jövőbeli tárgynap', { applicableDate: '2026-10-03' }, 'jövőbeli'],
    ['nem létező dátum', { applicableDate: '2026-02-30' }, 'dátum'],
    ['hibás dátumforma', { applicableDate: '2026.10.01' }, 'dátum'],
    ['pontot tartalmazó sorszám', { serialNumber: 'NY.2026.41' }, 'sorszám'],
    ['szóközzel kezdődő sorszám', { serialNumber: ' NY-1' }, 'sorszám'],
    ['túl hosszú sorszám', { serialNumber: 'A'.repeat(51) }, 'sorszám'],
    ['kisbetűs pénznem', { currency: 'huf' }, 'pénznem'],
    ['forintos árfolyam', { exchangeRate: 2 }, 'null vagy 1'],
    ['deviza árfolyam nélkül', { currency: 'EUR', exchangeRate: null }, 'árfolyam'],
    ['1 alatti árfolyam', { currency: 'KRW', exchangeRate: 0.27 }, '1 és 1000'],
    ['5 tizedes árfolyam', { currency: 'EUR', exchangeRate: 395.12345 }, '4 tizedes'],
    ['üres áfakategória-lista', { vatCategories: [], total: 0 }, 'legalább egy'],
    [
      'duplikált kategória',
      {
        vatCategories: [
          { vat: '27%', saleDocument: 1, modifyingDocument: 0 },
          { vat: '27%', saleDocument: 1, modifyingDocument: 0 },
        ],
        total: 2,
      },
      'EPGP0020',
    ],
    [
      'érvénytelen kategórianév',
      { vatCategories: [{ vat: '27%!', saleDocument: 1, modifyingDocument: 0 }], total: 1 },
      'ÁFA kategória',
    ],
    [
      'negatív értékesítés',
      { vatCategories: [{ vat: '27%', saleDocument: -1, modifyingDocument: 0 }], total: -1 },
      'tartományon kívül',
    ],
    [
      'három tizedes összeg',
      { vatCategories: [{ vat: '27%', saleDocument: 1.005, modifyingDocument: 0 }], total: 1.005 },
      '2 tizedes',
    ],
    ['eltérő végösszeg', { total: 891 }, 'nem egyezik'],
    ['három tizedes végösszeg', { total: 890.001 }, 'végösszeg'],
    ['tört darabszám', { numberOfSaleDocument: 1.5 }, 'egész'],
    ['negatív darabszám', { numberOfModifyingDocument: -1 }, 'egész'],
    [
      'két nulla darabszám',
      { numberOfSaleDocument: 0, numberOfModifyingDocument: 0 },
      'legalább az egyik',
    ],
  ])('%s esetén validációs hibát dob', (_label, overrides, fragment) => {
    expect(check(overrides as Partial<NavReceiptData>)).toThrow(
      expect.objectContaining({
        category: 'validation',
        message: expect.stringContaining(fragment),
      }),
    )
  })

  test('alapértelmezésben a mai budapesti napot veszi', () => {
    expect(() => validateNavReceiptData({ ...REPORT, applicableDate: '2099-01-01' })).toThrow(
      expect.objectContaining({ message: expect.stringContaining('jövőbeli') }),
    )
  })
})

describe('NAV formátum-segédek', () => {
  test('a sorszámmintázat a specifikáció szerinti karaktereket engedi', () => {
    for (const value of ['NYGT-2026-41', 'AB 1234567', 'Á_1/2\\3', 'a']) {
      expect(NAV_SERIAL_NUMBER_PATTERN.test(value)).toBe(true)
    }
    for (const value of ['AB#1', 'A ', 'A\tB', 'A:B', 'A+B', '']) {
      expect(NAV_SERIAL_NUMBER_PATTERN.test(value)).toBe(false)
    }
  })

  test('a törzsszámot a 8 vagy 11 jegyű adószámból olvassa ki', () => {
    expect(navTaxpayerId('12345678')).toBe('12345678')
    expect(navTaxpayerId('12345678-2-42')).toBe('12345678')
    expect(navTaxpayerId('12345678 2 42')).toBe('12345678')
    for (const value of ['1234567', '123456789', 'abcdefgh', '']) {
      expect(() => navTaxpayerId(value)).toThrow(
        expect.objectContaining({ category: 'configuration' }),
      )
    }
  })

  test('a szoftvernevet, az azonosítót és a dátumot ellenőrzi', () => {
    expect(assertSoftwareName(' Kassza 1.0 ')).toBe('Kassza 1.0')
    expect(() => assertSoftwareName('Kassza/1.0')).toThrow(
      expect.objectContaining({ category: 'validation' }),
    )
    expect(() => assertSoftwareName('x'.repeat(101))).toThrow()
    expect(assertReportId('12345678_20261001_3')).toBe('12345678_20261001_3')
    expect(() => assertReportId('12345678-20261001-3')).toThrow()
    expect(navDate(' 2026-10-01 ')).toBe('2026-10-01')
    expect(() => navDate('2026-13-01')).toThrow()
  })
})
