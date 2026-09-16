import { describe, expect, test } from 'vitest'
import { isValidHungarianZipCode, parseHungarianAddress } from './address'

describe('isValidHungarianZipCode', () => {
  test.each(['1000', '1031', '9999', ' 6720 ', 4025])('érvényes: %s', (value) => {
    expect(isValidHungarianZipCode(value)).toBe(true)
  })

  test.each(['0999', '999', '10000', '12a4', '', 999, 10000])('érvénytelen: %s', (value) => {
    expect(isValidHungarianZipCode(value)).toBe(false)
  })

  test('nem szöveg és nem szám esetén false', () => {
    expect(isValidHungarianZipCode(null as unknown as string)).toBe(false)
  })
})

describe('parseHungarianAddress', () => {
  test('a szokásos, vesszős formátumot bontja', () => {
    expect(parseHungarianAddress('1234 Budapest, Fő utca 1.')).toEqual({
      zip: '1234',
      city: 'Budapest',
      address: 'Fő utca 1.',
    })
  })

  test('vessző nélküli formátumot is bont', () => {
    expect(parseHungarianAddress('6720 Szeged Kárász utca 5.')).toEqual({
      zip: '6720',
      city: 'Szeged',
      address: 'Kárász utca 5.',
    })
  })

  test('kötőjeles településnevet megtart', () => {
    expect(parseHungarianAddress('2083 Solymár-Pilisborosjenő, Fő tér 2')).toMatchObject({
      city: 'Solymár-Pilisborosjenő',
      address: 'Fő tér 2',
    })
  })

  test('a budapesti kerületet római számmal a városnévből leválasztja', () => {
    expect(parseHungarianAddress('1111 Budapest XI. kerület, Bartók Béla út 12.')).toEqual({
      zip: '1111',
      city: 'Budapest',
      address: 'Bartók Béla út 12.',
      district: 11,
    })
  })

  test('a Budapest XI. ker. rövidítést is kezeli', () => {
    expect(parseHungarianAddress('1111 Budapest XI. ker. Bartók Béla út 12.')).toEqual({
      zip: '1111',
      city: 'Budapest',
      address: 'Bartók Béla út 12.',
      district: 11,
    })
  })

  test('a vessző után álló kerületet is felismeri', () => {
    expect(parseHungarianAddress('1051 Budapest, V. ker., Nádor utca 3')).toMatchObject({
      address: 'Nádor utca 3',
      district: 5,
    })
    expect(parseHungarianAddress('1033 Budapest, III ker Fő utca 1')).toMatchObject({
      address: 'Fő utca 1',
      district: 3,
    })
  })

  test('arab számos kerületet is felismer', () => {
    expect(parseHungarianAddress('1135 Budapest, 13. kerület, Váci út 1.')).toMatchObject({
      address: 'Váci út 1.',
      district: 13,
    })
  })

  test('a kerület jelölés csak városnévként nem kerül a címbe', () => {
    expect(parseHungarianAddress('1111 Budapest XI., Bartók Béla út 12.')).toMatchObject({
      city: 'Budapest',
      district: 11,
    })
  })

  test('a 23-nál nagyobb kerületszámot nem értelmezi kerületként', () => {
    expect(parseHungarianAddress('1111 Budapest, 24. ker. 1')).toEqual({
      zip: '1111',
      city: 'Budapest',
      address: '24. ker. 1',
    })
  })

  test('ha a városrész mögött további szöveg van, a várost nem bontja', () => {
    expect(parseHungarianAddress('1111 Budapest XI. valami, Fő utca 1.')).toEqual({
      zip: '1111',
      city: 'Budapest XI. valami',
      address: 'Fő utca 1.',
    })
  })

  test('nem budapesti városnál nem keres kerületet', () => {
    expect(parseHungarianAddress('3525 Miskolc, V. utca 1.')).toEqual({
      zip: '3525',
      city: 'Miskolc',
      address: 'V. utca 1.',
    })
  })

  test('országkód előtagot, országnevet, többsoros és többszörös szóközös bemenetet kezel', () => {
    expect(parseHungarianAddress('H-1234  Budapest,\nFő utca 1., Magyarország')).toEqual({
      zip: '1234',
      city: 'Budapest',
      address: 'Fő utca 1.',
    })
  })

  test('a cím, irányítószám város sorrendet is bontja', () => {
    expect(parseHungarianAddress('Fő utca 1., 1234 Budapest')).toEqual({
      zip: '1234',
      city: 'Budapest',
      address: 'Fő utca 1.',
    })
  })

  test.each([
    '',
    'Budapest',
    '1234',
    '1234 Budapest',
    '0999 Budapest, Fő utca 1.',
    '1234 12345, Fő utca 1.',
    '1234 Budapest,',
    'Fő utca 1.',
  ])('értelmezhetetlen bemenetre undefined: %j', (value) => {
    expect(parseHungarianAddress(value)).toBeUndefined()
  })

  test('nem szövegre undefined', () => {
    expect(parseHungarianAddress(42 as unknown as string)).toBeUndefined()
  })
})
