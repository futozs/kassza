import { describe, expect, test } from 'vitest'
import { numeric, path, record, records, text } from './json'

describe('record', () => {
  test('csak sima objektumot fogad el', () => {
    expect(record({ a: 1 })).toEqual({ a: 1 })
    expect(record([])).toBeUndefined()
    expect(record(null)).toBeUndefined()
    expect(record('szöveg')).toBeUndefined()
  })
})

describe('records', () => {
  test('a tömb objektum elemeit adja, a többit kihagyja', () => {
    expect(records([{ a: 1 }, null, 3, [1], { b: 2 }])).toEqual([{ a: 1 }, { b: 2 }])
  })

  test('nem tömbre üres tömböt ad', () => {
    expect(records({ a: 1 })).toEqual([])
    expect(records(undefined)).toEqual([])
  })
})

describe('text', () => {
  test('levágja a szóközöket, az üres stringet undefined-ként kezeli', () => {
    expect(text('  abc ')).toBe('abc')
    expect(text('   ')).toBeUndefined()
  })

  test('a véges számot stringgé alakítja', () => {
    expect(text(501180380)).toBe('501180380')
    expect(text(Number.NaN)).toBeUndefined()
  })

  test('más típusra undefined-ot ad', () => {
    expect(text(true)).toBeUndefined()
    expect(text({})).toBeUndefined()
  })
})

describe('numeric', () => {
  test('a számot és a szám stringet is elfogadja', () => {
    expect(numeric(12.5)).toBe(12.5)
    expect(numeric(' 7 ')).toBe(7)
  })

  test('a nem véges és nem szám értékre undefined-ot ad', () => {
    expect(numeric(Number.POSITIVE_INFINITY)).toBeUndefined()
    expect(numeric('abc')).toBeUndefined()
    expect(numeric('')).toBeUndefined()
    expect(numeric(null)).toBeUndefined()
  })
})

describe('path', () => {
  test('beágyazott értéket olvas ki', () => {
    expect(path({ a: { b: { c: 3 } } }, 'a', 'b', 'c')).toBe(3)
  })

  test('hiányzó vagy nem objektum köztes szintnél undefined-ot ad', () => {
    expect(path({ a: 1 }, 'a', 'b')).toBeUndefined()
    expect(path(undefined, 'a')).toBeUndefined()
    expect(path({ a: [{ b: 1 }] }, 'a', 'b')).toBeUndefined()
  })
})
