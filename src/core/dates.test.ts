import { describe, expect, test } from 'vitest'
import {
  addBudapestDays,
  toAgentDate,
  toBudapestDate,
  toBudapestTimestamp,
  todayInBudapest,
} from './dates'

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

describe('toBudapestTimestamp', () => {
  test('nyári időben +02:00 eltolással adja vissza a budapesti időt', () => {
    expect(toBudapestTimestamp(new Date('2026-07-01T10:15:30.789Z'))).toBe(
      '2026-07-01T12:15:30+02:00',
    )
  })

  test('téli időben +01:00 eltolással adja vissza a budapesti időt', () => {
    expect(toBudapestTimestamp(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-16T00:30:00+01:00')
  })

  test('éjfélkor 00 órát ír, nem 24-et', () => {
    expect(toBudapestTimestamp(new Date('2026-03-01T23:00:00Z'))).toBe('2026-03-02T00:00:00+01:00')
  })

  test('az óraátállítás napján is helyes az eltolás', () => {
    expect(toBudapestTimestamp(new Date('2026-03-29T00:59:59Z'))).toBe('2026-03-29T01:59:59+01:00')
    expect(toBudapestTimestamp(new Date('2026-03-29T01:00:00Z'))).toBe('2026-03-29T03:00:00+02:00')
  })

  test('érvénytelen dátumra RangeError-t dob', () => {
    expect(() => toBudapestTimestamp(new Date('nem dátum'))).toThrow(RangeError)
  })
})
