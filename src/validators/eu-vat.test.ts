import { describe, expect, test } from 'vitest'
import { EU_VAT_NUMBER_PATTERNS, isValidEuVatNumber, normalizeEuVatNumber } from './eu-vat'

describe('isValidEuVatNumber', () => {
  test.each([
    'ATU12345678',
    'BE0123456789',
    'BG123456789',
    'BG1234567890',
    'CY12345678X',
    'CZ12345678',
    'CZ1234567890',
    'DE123456789',
    'DK12345678',
    'EE123456789',
    'EL123456789',
    'ESA1234567B',
    'ES12345678Z',
    'FI12345678',
    'FRAB123456789',
    'FR12345678901',
    'HR12345678901',
    'HU13421739',
    'IE1234567T',
    'IE1234567WA',
    'IE1A23456T',
    'IT12345678901',
    'LT123456789',
    'LT123456789012',
    'LU12345678',
    'LV12345678901',
    'MT12345678',
    'NL123456789B01',
    'PL1234567890',
    'PT123456789',
    'RO12',
    'RO1234567890',
    'SE123456789001',
    'SI12345678',
    'SK1234567890',
    'XI123456789',
    'XI123456789012',
    'XIGD001',
    'XIHA599',
  ])('érvényes: %s', (value) => {
    expect(isValidEuVatNumber(value)).toBe(true)
  })

  test.each([
    'AT12345678',
    'BE2123456789',
    'DE12345678',
    'GR123456789',
    'GB123456789',
    'HU1342173',
    'NL123456789A01',
    'RO0123',
    'SE123456789002',
    'FRIO123456789',
    'XIGD500',
    'XIHA499',
    'U12345678',
    '',
  ])('érvénytelen: %s', (value) => {
    expect(isValidEuVatNumber(value)).toBe(false)
  })

  test('szóközt, pontot, kötőjelet és kisbetűt is elfogad', () => {
    expect(isValidEuVatNumber('hu 1342-1739')).toBe(true)
    expect(isValidEuVatNumber('nl 1234.56789.b01')).toBe(true)
    expect(normalizeEuVatNumber(' de 123-456.789 ')).toBe('DE123456789')
  })

  test('nem szövegre false', () => {
    expect(isValidEuVatNumber(undefined as unknown as string)).toBe(false)
  })

  test('mind a 27 tagállamot és Észak-Írországot lefedi', () => {
    expect(Object.keys(EU_VAT_NUMBER_PATTERNS)).toHaveLength(28)
  })
})
