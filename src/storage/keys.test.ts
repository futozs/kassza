import { afterEach, describe, expect, test, vi } from 'vitest'
import { StorageError } from './errors'
import { invoicePdfKey, receiptPdfKey, sanitizeKeySegment } from './keys'

afterEach(() => {
  vi.useRealTimers()
})

describe('invoicePdfKey', () => {
  test('alapértelmezett mappa, év és hónap a dátumból', () => {
    expect(invoicePdfKey({ number: 'E-ABC-2026-12', date: '2026-09-03' })).toBe(
      'szamlak/2026/09/E-ABC-2026-12.pdf',
    )
  })

  test('dátum nélkül a mai budapesti dátumot használja, éjfél után is', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-31T22:30:00Z'))

    expect(invoicePdfKey({ number: 'E-1' })).toBe('szamlak/2026/09/E-1.pdf')
  })

  test('Date objektumot budapesti időzónában értelmez', () => {
    expect(invoicePdfKey({ number: 'E-1', date: new Date('2026-12-31T23:30:00Z') })).toBe(
      'szamlak/2027/01/E-1.pdf',
    )
  })

  test('bizonylattípus szerinti almappa', () => {
    const date = '2026-01-15'
    expect(invoicePdfKey({ number: 'D-1', type: 'proforma', date })).toBe(
      'szamlak/dijbekero/2026/01/D-1.pdf',
    )
    expect(invoicePdfKey({ number: 'S-1', type: 'storno', date })).toBe(
      'szamlak/sztorno/2026/01/S-1.pdf',
    )
    expect(invoicePdfKey({ number: 'E-1', type: 'invoice', date })).toBe('szamlak/2026/01/E-1.pdf')
  })

  test('egyedi, többszintű prefix szanitizálva', () => {
    expect(
      invoicePdfKey({ number: 'E-1', prefix: '/ügyfél 1/../számlák/', date: '2026-02-01' }),
    ).toBe('ugyfel-1/szamlak/2026/02/E-1.pdf')
    expect(invoicePdfKey({ number: 'E-1', prefix: '', date: '2026-02-01' })).toBe('2026/02/E-1.pdf')
  })

  test('a számlaszámból fájlnév-biztos nevet képez', () => {
    expect(invoicePdfKey({ number: ' E/ÁRVÍZ 2026\\12 ', date: '2026-02-01' })).toBe(
      'szamlak/2026/02/E-ARVIZ-2026-12.pdf',
    )
    expect(invoicePdfKey({ number: '../../etc/passwd', date: '2026-02-01' })).toBe(
      'szamlak/2026/02/etc-passwd.pdf',
    )
  })

  test('üres vagy csak tiltott karakteres számnál StorageError', () => {
    expect(() => invoicePdfKey({ number: '../..' })).toThrow(StorageError)
    expect(() => invoicePdfKey({ number: '' })).toThrow('nem képezhető fájlnév')
  })

  test('érvénytelen dátumnál RangeError', () => {
    expect(() => invoicePdfKey({ number: 'E-1', date: '2026-02-30' })).toThrow(RangeError)
  })
})

describe('receiptPdfKey', () => {
  test('nyugtak mappába kerül', () => {
    expect(receiptPdfKey({ number: 'NYGT-2026-5', date: '2026-09-16' })).toBe(
      'nyugtak/2026/09/NYGT-2026-5.pdf',
    )
    expect(receiptPdfKey({ number: 'NY 1', prefix: 'bolt/nyugta', date: '2026-09-16' })).toBe(
      'bolt/nyugta/2026/09/NY-1.pdf',
    )
  })
})

describe('sanitizeKeySegment', () => {
  test('ékezetet eltávolít, a széleken lévő pontot és kötőjelet levágja', () => {
    expect(sanitizeKeySegment('..Őrült  fűzfa--')).toBe('Orult-fuzfa')
    expect(sanitizeKeySegment('a.b_c-d')).toBe('a.b_c-d')
    expect(sanitizeKeySegment('..')).toBe('')
  })
})
