import { describe, expect, test } from 'vitest'
import {
  formatHungarianBankAccount,
  isValidHungarianBankAccount,
  isValidHungarianIban,
  parseHungarianBankAccount,
} from './bank-account'

describe('parseHungarianBankAccount', () => {
  test('16 jegyű számlaszámot bont részekre', () => {
    expect(parseHungarianBankAccount('11773016-11111018')).toEqual({
      digits: '1177301611111018',
      bankCode: '117',
      branchCode: '7301',
      formatted: '11773016-11111018',
    })
  })

  test('24 jegyű számlaszámot 8-as blokkokban formáz', () => {
    expect(parseHungarianBankAccount('117730161111101800000000')?.formatted).toBe(
      '11773016-11111018-00000000',
    )
  })

  test('a 24 jegyű számlaszám második részét 16 jegyként ellenőrzi', () => {
    expect(isValidHungarianBankAccount('11773016-12345678-00000008')).toBe(true)
  })

  test('szóközt és kötőjelet is elfogad', () => {
    expect(isValidHungarianBankAccount('1177 3016 1111 1018')).toBe(true)
    expect(isValidHungarianBankAccount(' 11773016 - 11111018 ')).toBe(true)
  })

  test('hibás CDV-re undefined', () => {
    expect(parseHungarianBankAccount('11773017-11111018')).toBeUndefined()
    expect(parseHungarianBankAccount('11773016-11111019')).toBeUndefined()
    expect(parseHungarianBankAccount('11773016-11111018-00000001')).toBeUndefined()
  })

  test('rossz hosszra és nem szövegre undefined', () => {
    expect(parseHungarianBankAccount('11773016')).toBeUndefined()
    expect(parseHungarianBankAccount('11773016-11111018-0000')).toBeUndefined()
    expect(parseHungarianBankAccount('1177301A-11111018')).toBeUndefined()
    expect(parseHungarianBankAccount(null as unknown as string)).toBeUndefined()
  })
})

describe('formatHungarianBankAccount', () => {
  test('érvényes számlaszámot formáz, érvénytelenre undefined', () => {
    expect(formatHungarianBankAccount('1177301611111018')).toBe('11773016-11111018')
    expect(formatHungarianBankAccount('1177301611111019')).toBeUndefined()
  })
})

describe('isValidHungarianIban', () => {
  test('érvényes magyar IBAN-t elfogad, szóközökkel és kisbetűvel is', () => {
    expect(isValidHungarianIban('HU42117730161111101800000000')).toBe(true)
    expect(isValidHungarianIban('hu42 1177 3016 1111 1018 0000 0000')).toBe(true)
  })

  test('hibás ellenőrzőszámra false', () => {
    expect(isValidHungarianIban('HU43117730161111101800000000')).toBe(false)
  })

  test('nem magyar, rossz hosszú vagy betűt tartalmazó IBAN-ra false', () => {
    expect(isValidHungarianIban('DE89370400440532013000')).toBe(false)
    expect(isValidHungarianIban('HU4211773016111110180000000')).toBe(false)
    expect(isValidHungarianIban('HU4211773016111110180000000A')).toBe(false)
    expect(isValidHungarianIban(undefined as unknown as string)).toBe(false)
  })
})
