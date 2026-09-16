import { describe, expect, test } from 'vitest'
import {
  HUNGARIAN_TAX_COUNTY_CODES,
  isHungarianVatGroupMemberTaxNumber,
  isValidHungarianGroupTaxNumber,
  isValidHungarianTaxNumber,
  isValidHungarianTaxpayerId,
  parseHungarianTaxNumber,
} from './tax-number'

describe('parseHungarianTaxNumber', () => {
  test('kötőjeles formátumot bont részekre', () => {
    expect(parseHungarianTaxNumber('13421739-2-41')).toEqual({
      taxpayerId: '13421739',
      vatCode: '2',
      countyCode: '41',
      formatted: '13421739-2-41',
    })
  })

  test('elválasztó nélküli és szóközös alakot is elfogad', () => {
    expect(parseHungarianTaxNumber('13421739241')?.formatted).toBe('13421739-2-41')
    expect(parseHungarianTaxNumber(' 13421739 2 41 ')?.formatted).toBe('13421739-2-41')
  })

  test('hibás CDV ellenőrzőszámra undefined', () => {
    expect(parseHungarianTaxNumber('13421738-2-41')).toBeUndefined()
  })

  test.each(['0', '6', '9'])('érvénytelen áfakódra (%s) undefined', (vatCode) => {
    expect(parseHungarianTaxNumber(`13421739-${vatCode}-41`)).toBeUndefined()
  })

  test.each(['00', '01', '21', '45', '50', '52', '99'])(
    'érvénytelen megyekódra (%s) undefined',
    (countyCode) => {
      expect(parseHungarianTaxNumber(`13421739-2-${countyCode}`)).toBeUndefined()
    },
  )

  test.each(['02', '13', '20', '22', '33', '44', '51'])('érvényes megyekód: %s', (countyCode) => {
    expect(parseHungarianTaxNumber(`12345676-1-${countyCode}`)?.countyCode).toBe(countyCode)
  })

  test('rossz hosszra, betűre és nem szövegre undefined', () => {
    expect(parseHungarianTaxNumber('13421739')).toBeUndefined()
    expect(parseHungarianTaxNumber('13421739-2-411')).toBeUndefined()
    expect(parseHungarianTaxNumber('1342173A-2-41')).toBeUndefined()
    expect(parseHungarianTaxNumber(13421739241 as unknown as string)).toBeUndefined()
  })
})

describe('HUNGARIAN_TAX_COUNTY_CODES', () => {
  test('a 02-20, 22-44 és 51 kódokat tartalmazza', () => {
    expect(HUNGARIAN_TAX_COUNTY_CODES).toHaveLength(43)
    expect(HUNGARIAN_TAX_COUNTY_CODES[0]).toBe('02')
    expect(HUNGARIAN_TAX_COUNTY_CODES).toContain('20')
    expect(HUNGARIAN_TAX_COUNTY_CODES).not.toContain('21')
    expect(HUNGARIAN_TAX_COUNTY_CODES.at(-1)).toBe('51')
  })
})

describe('isValidHungarianTaxpayerId', () => {
  test('a törzsszám CDV ellenőrzését végzi', () => {
    expect(isValidHungarianTaxpayerId('13421739')).toBe(true)
    expect(isValidHungarianTaxpayerId('24680242')).toBe(true)
    expect(isValidHungarianTaxpayerId('13421730')).toBe(false)
    expect(isValidHungarianTaxpayerId('1342173')).toBe(false)
  })
})

describe('isValidHungarianTaxNumber', () => {
  test('érvényes és érvénytelen adószám', () => {
    expect(isValidHungarianTaxNumber('11111111-2-42')).toBe(true)
    expect(isValidHungarianTaxNumber('11111112-2-42')).toBe(false)
  })
})

describe('csoportos áfaalanyiság', () => {
  test('a csoportazonosító szám áfakódja 5', () => {
    expect(isValidHungarianGroupTaxNumber('24680242-5-44')).toBe(true)
    expect(isValidHungarianGroupTaxNumber('24680242-4-44')).toBe(false)
    expect(isValidHungarianGroupTaxNumber('24680243-5-44')).toBe(false)
  })

  test('a csoporttag adószámának áfakódja 4', () => {
    expect(isHungarianVatGroupMemberTaxNumber('24680242-4-44')).toBe(true)
    expect(isHungarianVatGroupMemberTaxNumber('24680242-5-44')).toBe(false)
  })
})
