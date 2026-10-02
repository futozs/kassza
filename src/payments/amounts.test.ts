import { describe, expect, test } from 'vitest'
import { currencyExponent, fromMinorUnits, normalizeCurrency, parseDecimalAmount } from './amounts'

describe('currencyExponent', () => {
  test('a forint a Stripe-nál és az ISO 4217 szerint is kétdecimális', () => {
    expect(currencyExponent('HUF', 'stripe')).toBe(2)
    expect(currencyExponent('HUF', 'iso4217')).toBe(2)
  })

  test('a Stripe nulladecimális listáját használja Stripe konvencióval', () => {
    expect(currencyExponent('JPY', 'stripe')).toBe(0)
    expect(currencyExponent('MGA', 'stripe')).toBe(0)
    expect(currencyExponent('ISK', 'stripe')).toBe(2)
    expect(currencyExponent('UGX', 'stripe')).toBe(2)
  })

  test('az ISO 4217 szerinti nulladecimális pénznemeket ismeri', () => {
    expect(currencyExponent('ISK', 'iso4217')).toBe(0)
    expect(currencyExponent('UGX', 'iso4217')).toBe(0)
    expect(currencyExponent('JPY', 'iso4217')).toBe(0)
  })

  test('a háromdecimális és négydecimális pénznemeket ismeri', () => {
    expect(currencyExponent('KWD', 'stripe')).toBe(3)
    expect(currencyExponent('IQD', 'iso4217')).toBe(3)
    expect(currencyExponent('CLF', 'iso4217')).toBe(4)
  })

  test('kisbetűs és szóközös kódot is elfogad', () => {
    expect(currencyExponent(' jpy ', 'stripe')).toBe(0)
  })
})

describe('fromMinorUnits', () => {
  test('a Stripe 100000 HUF minor unitja 1000 Ft', () => {
    expect(fromMinorUnits(100000, 'huf', 'stripe')).toBe(1000)
  })

  test('a JPY összeget nem osztja', () => {
    expect(fromMinorUnits(1500, 'JPY', 'stripe')).toBe(1500)
  })

  test('a háromdecimális pénznemet ezerrel osztja', () => {
    expect(fromMinorUnits(1234, 'KWD', 'stripe')).toBe(1.234)
  })

  test('a lebegőpontos maradékot kerekíti', () => {
    expect(fromMinorUnits(1999, 'EUR', 'iso4217')).toBe(19.99)
  })

  test('nem véges számra RangeError-t dob', () => {
    expect(() => fromMinorUnits(Number.NaN, 'EUR', 'stripe')).toThrow(RangeError)
    expect(() => fromMinorUnits(Number.POSITIVE_INFINITY, 'EUR', 'stripe')).toThrow(RangeError)
  })
})

describe('parseDecimalAmount', () => {
  test('egész és tizedes stringet is számmá alakít', () => {
    expect(parseDecimalAmount('1000')).toBe(1000)
    expect(parseDecimalAmount(' 10.50 ')).toBe(10.5)
    expect(parseDecimalAmount('.5')).toBe(0.5)
    expect(parseDecimalAmount('-3.25')).toBe(-3.25)
  })

  test('érvénytelen formára RangeError-t dob', () => {
    for (const value of ['', '1,5', '1e3', 'abc', '1.', '--1']) {
      expect(() => parseDecimalAmount(value)).toThrow(RangeError)
    }
  })
})

describe('normalizeCurrency', () => {
  test('nagybetűssé alakítja és levágja a szóközöket', () => {
    expect(normalizeCurrency(' eur ')).toBe('EUR')
  })
})
