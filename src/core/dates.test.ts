import { describe, expect, test } from 'vitest'
import { addBudapestDays, toAgentDate, toBudapestDate, todayInBudapest } from './dates'

describe('toBudapestDate', () => {
  test('nyári időszámításban éjfél után már a magyar napot adja, nem az UTC előző napot', () => {
    const date = new Date('2026-07-14T22:30:00Z')

    expect(date.toISOString().slice(0, 10)).toBe('2026-07-14')
    expect(toBudapestDate(date)).toBe('2026-07-15')
  })

  test('téli időszámításban (UTC+1) is a magyar napot adja', () => {
    expect(toBudapestDate(new Date('2026-01-09T23:15:00Z'))).toBe('2026-01-10')
  })

  test('érvénytelen dátumra RangeError-t dob', () => {
    expect(() => toBudapestDate(new Date('nem-datum'))).toThrow(RangeError)
  })
})

describe('addBudapestDays', () => {
  test('hónap- és évhatáron átlépve helyes naptári dátumot ad', () => {
    expect(addBudapestDays(new Date('2026-12-30T10:00:00Z'), 3)).toBe('2027-01-02')
  })

  test('óraátállítás hétvégéjén sem csúszik el a nap', () => {
    expect(addBudapestDays(new Date('2026-03-28T23:30:00Z'), 1)).toBe('2026-03-30')
  })

  test('0 nap a mai magyar dátum', () => {
    expect(addBudapestDays(new Date('2026-07-14T22:30:00Z'), 0)).toBe('2026-07-15')
  })

  test('nem egész napszámra RangeError-t dob', () => {
    expect(() => addBudapestDays(new Date(), 1.5)).toThrow(RangeError)
  })
})

describe('toAgentDate', () => {
  test('Date objektumot magyar dátummá alakít', () => {
    expect(toAgentDate(new Date('2026-07-14T22:30:00Z'))).toBe('2026-07-15')
  })

  test('érvényes YYYY-MM-DD stringet változatlanul hagy', () => {
    expect(toAgentDate(' 2026-02-28 ')).toBe('2026-02-28')
  })

  test('rossz formátumra és nem létező napra RangeError-t dob', () => {
    expect(() => toAgentDate('2026.02.28')).toThrow(RangeError)
    expect(() => toAgentDate('2026-02-30')).toThrow(RangeError)
  })
})

describe('todayInBudapest', () => {
  test('a megadott pillanat magyar napját adja', () => {
    expect(todayInBudapest(new Date('2026-01-09T23:15:00Z'))).toBe('2026-01-10')
  })
})
