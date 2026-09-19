import { describe, expect, test } from 'vitest'
import { SzamlazzError } from '../core/errors'
import {
  IPN_FIELDS,
  ipnOkResponse,
  MAX_IPN_BODY_BYTES,
  parseIpnAmount,
  parseIpnNotification,
  readIpnNotification,
} from './notification'

const FULL_FIELDS: Record<string, string> = {
  szlahu_szamlaszam: 'E-2020-123',
  szlahu_dijbekero_szama: 'DB-2020-456',
  szlahu_rendelesszam: 'RND1234',
  szlahu_bruttovegosszeg: '10000',
  szlahu_kifizetettbrutto: '10000',
  szlahu_fizetesmod: 'átutalás',
  szlahu_kifizdat: '2025-05-14',
}

const FULL_BODY = new URLSearchParams(FULL_FIELDS).toString()

const EXPECTED_FULL = {
  invoiceNumber: 'E-2020-123',
  proformaNumber: 'DB-2020-456',
  orderNumber: 'RND1234',
  grossTotal: 10000,
  paidAmount: 10000,
  paymentMethod: 'átutalás',
  paymentDate: '2025-05-14',
  isFullyPaid: true,
  raw: FULL_FIELDS,
}

describe('parseIpnNotification', () => {
  test('a docs összes mezőjét feldolgozza urlencoded szövegből', () => {
    expect(parseIpnNotification(FULL_BODY)).toEqual(EXPECTED_FULL)
  })

  test('URLSearchParams, FormData és objektum bemenetet is elfogad', () => {
    const formData = new FormData()
    for (const [key, value] of Object.entries(FULL_FIELDS)) formData.append(key, value)
    formData.append('csatolmany', new Blob(['x']), 'x.txt')

    expect(parseIpnNotification(new URLSearchParams(FULL_FIELDS))).toEqual(EXPECTED_FULL)
    expect(parseIpnNotification(formData)).toEqual(EXPECTED_FULL)
    expect(parseIpnNotification(FULL_FIELDS)).toEqual(EXPECTED_FULL)
  })

  test('a vezető kérdőjelet és a + jellel kódolt szóközt kezeli', () => {
    const result = parseIpnNotification(
      '?szlahu_szamlaszam=E-2020-1&szlahu_bruttovegosszeg=100&szlahu_kifizetettbrutto=100&szlahu_fizetesmod=bank+k%C3%A1rtya',
    )

    expect(result.paymentMethod).toBe('bank kártya')
  })

  test('csak a kötelező mezőkkel is működik, az opcionálisak undefined-ok', () => {
    const result = parseIpnNotification({
      szlahu_szamlaszam: 'E-1',
      szlahu_bruttovegosszeg: '5000',
      szlahu_kifizetettbrutto: '2000',
      szlahu_rendelesszam: '   ',
    })

    expect(result).toEqual({
      invoiceNumber: 'E-1',
      proformaNumber: undefined,
      orderNumber: undefined,
      grossTotal: 5000,
      paidAmount: 2000,
      paymentMethod: undefined,
      paymentDate: undefined,
      isFullyPaid: false,
      raw: {
        szlahu_szamlaszam: 'E-1',
        szlahu_bruttovegosszeg: '5000',
        szlahu_kifizetettbrutto: '2000',
        szlahu_rendelesszam: '   ',
      },
    })
  })

  test('tizedesvesszős és tizedespontos összegeket is kezel', () => {
    const result = parseIpnNotification({
      szlahu_szamlaszam: 'E-1',
      szlahu_bruttovegosszeg: '12 700,50',
      szlahu_kifizetettbrutto: '12700.5',
    })

    expect(result).toMatchObject({ grossTotal: 12700.5, paidAmount: 12700.5, isFullyPaid: true })
  })

  test('túlfizetésnél és negatív (helyesbítő) összegnél is teljesen fizetett', () => {
    expect(
      parseIpnNotification({
        szlahu_szamlaszam: 'E-1',
        szlahu_bruttovegosszeg: '100',
        szlahu_kifizetettbrutto: '150',
      }).isFullyPaid,
    ).toBe(true)
    expect(
      parseIpnNotification({
        szlahu_szamlaszam: 'E-2',
        szlahu_bruttovegosszeg: '-100',
        szlahu_kifizetettbrutto: '-100',
      }).isFullyPaid,
    ).toBe(true)
  })

  test('az objektum bemenet null/undefined értékeit kihagyja, a többit szöveggé alakítja', () => {
    const result = parseIpnNotification({
      szlahu_szamlaszam: 'E-1',
      szlahu_bruttovegosszeg: 100,
      szlahu_kifizetettbrutto: 100,
      szlahu_fizetesmod: undefined,
      szlahu_kifizdat: null,
    } as unknown as Record<string, string>)

    expect(result.raw).toEqual({
      szlahu_szamlaszam: 'E-1',
      szlahu_bruttovegosszeg: '100',
      szlahu_kifizetettbrutto: '100',
    })
  })

  test('a __proto__ kulcs nem szennyezi a prototípust', () => {
    const result = parseIpnNotification(`${FULL_BODY}&__proto__=x`)

    expect(Object.getPrototypeOf(result.raw)).toBe(Object.prototype)
    expect(Object.hasOwn(result.raw, '__proto__')).toBe(true)
  })

  test.each([IPN_FIELDS.invoiceNumber, IPN_FIELDS.grossTotal, IPN_FIELDS.paidAmount])(
    'hiányzó kötelező mezőre (%s) validation hibát dob',
    (field) => {
      const fields = Object.fromEntries(
        Object.entries(FULL_FIELDS).filter(([key]) => key !== field),
      )

      expect(() => parseIpnNotification(fields)).toThrow(
        expect.objectContaining({
          category: 'validation',
          message: `Hiányzik a kötelező IPN mező: ${field}`,
        }),
      )
    },
  )

  test('nem értelmezhető összegre validation hibát dob', () => {
    expect(() =>
      parseIpnNotification({ ...FULL_FIELDS, szlahu_kifizetettbrutto: 'tízezer' }),
    ).toThrow(
      expect.objectContaining({
        category: 'validation',
        message: expect.stringContaining('tízezer'),
      }),
    )
  })

  test('nem támogatott bemenet típusra validation hibát dob', () => {
    expect(() => parseIpnNotification(42 as unknown as string)).toThrow(SzamlazzError)
    expect(() => parseIpnNotification(null as unknown as string)).toThrow(SzamlazzError)
  })
})

describe('parseIpnAmount', () => {
  test.each([
    ['10000', 10000],
    ['10000.0', 10000],
    ['10000,50', 10000.5],
    ['10.000,50', 10000.5],
    ['10,000.50', 10000.5],
    ['1 234 567', 1234567],
    ['-250,5', -250.5],
    ['+3', 3],
    ['.5', 0.5],
  ])('%j → %d', (input, expected) => {
    expect(parseIpnAmount(input)).toBe(expected)
  })

  test.each(['', 'abc', '1.234.567', '12a', '1,2,3', '-'])('értelmezhetetlen: %j', (input) => {
    expect(parseIpnAmount(input)).toBeUndefined()
  })
})

describe('readIpnNotification', () => {
  test('urlencoded POST törzset olvas', async () => {
    const request = new Request('https://example.hu/ipn', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: FULL_BODY,
    })

    await expect(readIpnNotification(request)).resolves.toEqual(EXPECTED_FULL)
  })

  test('multipart/form-data törzset is olvas', async () => {
    const formData = new FormData()
    for (const [key, value] of Object.entries(FULL_FIELDS)) formData.append(key, value)
    const request = new Request('https://example.hu/ipn', { method: 'POST', body: formData })

    await expect(readIpnNotification(request)).resolves.toEqual(EXPECTED_FULL)
  })

  test('content-type nélkül is urlencodedként értelmezi a törzset', async () => {
    const request = new Request('https://example.hu/ipn', {
      method: 'POST',
      body: new TextEncoder().encode(FULL_BODY),
    })

    await expect(readIpnNotification(request)).resolves.toMatchObject({
      invoiceNumber: 'E-2020-123',
    })
  })

  test('üres törzsnél az URL query paramétereit használja', async () => {
    const request = new Request(`https://example.hu/ipn?${FULL_BODY}`, { method: 'POST' })

    await expect(readIpnNotification(request)).resolves.toEqual(EXPECTED_FULL)
  })

  test('üres kérésre validation hibát dob', async () => {
    const request = new Request('https://example.hu/ipn', { method: 'POST', body: '' })

    await expect(readIpnNotification(request)).rejects.toMatchObject({ category: 'validation' })
  })

  test('a túl nagy törzset a content-length alapján elutasítja', async () => {
    const request = new Request('https://example.hu/ipn', {
      method: 'POST',
      headers: { 'content-length': String(MAX_IPN_BODY_BYTES + 1) },
      body: FULL_BODY,
    })

    await expect(readIpnNotification(request)).rejects.toMatchObject({ category: 'validation' })
  })

  test('a content-length nélkül érkező túl nagy törzset olvasás közben állítja le', async () => {
    const chunk = new Uint8Array(MAX_IPN_BODY_BYTES / 2 + 1)
    let sent = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += 1
        controller.enqueue(chunk)
        if (sent > 4) controller.close()
      },
    })
    const request = new Request('https://example.hu/ipn', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit)

    await expect(readIpnNotification(request)).rejects.toMatchObject({ category: 'validation' })
    expect(sent).toBeLessThan(5)
  })

  test('a multipart törzsnél is ellenőrzi a deklarált méretet', async () => {
    const formData = new FormData()
    for (const [key, value] of Object.entries(FULL_FIELDS)) formData.append(key, value)
    const request = new Request('https://example.hu/ipn', {
      method: 'POST',
      headers: { 'content-length': String(MAX_IPN_BODY_BYTES + 1) },
      body: formData,
    })

    await expect(readIpnNotification(request)).rejects.toMatchObject({ category: 'validation' })
  })

  test('a limiten belüli, több darabban érkező törzset összefűzi', async () => {
    const bytes = new TextEncoder().encode(FULL_BODY)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 10))
        controller.enqueue(bytes.slice(10))
        controller.close()
      },
    })
    const request = new Request('https://example.hu/ipn', {
      method: 'POST',
      body: stream,
      duplex: 'half',
    } as RequestInit)

    await expect(readIpnNotification(request)).resolves.toEqual(EXPECTED_FULL)
  })
})

describe('ipnOkResponse', () => {
  test('HTTP 200 választ ad', async () => {
    const response = ipnOkResponse()

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    await expect(response.text()).resolves.toBe('OK')
  })
})
