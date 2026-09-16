import { afterEach, describe, expect, test, vi } from 'vitest'
import { base64ToBytes, bytesToBase64, decodeUtf8, encodeUtf8, isPdf } from './binary'
import { createAgentError, isSzamlazzError, parseErrorCode, SzamlazzError } from './errors'
import { memoryCookieStore, mergeSetCookies, sessionKeyFor } from './session'

afterEach(() => {
  vi.useRealTimers()
})

describe('memoryCookieStore', () => {
  test('tárolja, visszaadja és törli az értéket', async () => {
    const store = memoryCookieStore()

    await store.set('k', 'JSESSIONID=1', 60)
    expect(await store.get('k')).toBe('JSESSIONID=1')

    await store.delete('k')
    expect(await store.get('k')).toBeUndefined()
  })

  test('a lejárt értéket nem adja vissza', async () => {
    vi.useFakeTimers()
    const store = memoryCookieStore()
    await store.set('k', 'JSESSIONID=1', 60)

    vi.advanceTimersByTime(60_001)

    expect(await store.get('k')).toBeUndefined()
  })
})

describe('sessionKeyFor', () => {
  test('determinisztikus, és nem tartalmazza a titkot', () => {
    const key = sessionKeyFor('titkos-agent-kulcs')

    expect(key).toBe(sessionKeyFor('titkos-agent-kulcs'))
    expect(key).not.toContain('titkos')
    expect(key).toMatch(/^szamlazz:session:[0-9a-f]{8}$/)
    expect(sessionKeyFor('masik-kulcs')).not.toBe(key)
  })
})

describe('mergeSetCookies', () => {
  test('a getSetCookie nélküli környezetben az összevont fejlécet is szétbontja', () => {
    const headers = new Headers()
    Object.defineProperty(headers, 'getSetCookie', { value: undefined })
    vi.spyOn(headers, 'get').mockReturnValue(
      'JSESSIONID=abc; Path=/; Expires=Wed, 16 Sep 2026 10:00:00 GMT, AWSALB=xyz; Path=/',
    )

    expect(mergeSetCookies(undefined, headers)).toBe('JSESSIONID=abc; AWSALB=xyz')
  })

  test('a meglévő cookie-kat név szerint frissíti, és változás nélkül undefined-ot ad', () => {
    const headers = new Headers()
    headers.append('set-cookie', 'JSESSIONID=uj; Path=/')
    headers.append('set-cookie', 'AWSALB=same')

    expect(mergeSetCookies('JSESSIONID=regi; AWSALB=same; hibas', headers)).toBe(
      'JSESSIONID=uj; AWSALB=same',
    )
    expect(mergeSetCookies('JSESSIONID=uj; AWSALB=same', headers)).toBeUndefined()
  })

  test('set-cookie nélkül és érvénytelen cookie-nál undefined-ot ad', () => {
    const invalid = new Headers()
    invalid.append('set-cookie', '=nincsnev')
    invalid.append('set-cookie', '')

    expect(mergeSetCookies('JSESSIONID=1', new Headers())).toBeUndefined()
    expect(mergeSetCookies(undefined, invalid)).toBeUndefined()
  })
})

describe('binary', () => {
  test('a base64 oda-vissza alakítás veszteségmentes, nagy PDF-nél is', () => {
    const bytes = new Uint8Array(100_000).map((_, index) => (index * 31) % 256)

    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })

  test('a sortöréses és URL-safe base64-et is dekódolja', () => {
    expect(decodeUtf8(base64ToBytes('JVBE\nRi0x\r\nLjQ='))).toBe('%PDF-1.4')
    expect(decodeUtf8(base64ToBytes('_-8'))).toBe(decodeUtf8(base64ToBytes('/+8')))
  })

  test('a PDF felismeréshez a %PDF fejléc kell', () => {
    expect(isPdf(encodeUtf8('%PDF-1.7'))).toBe(true)
    expect(isPdf(encodeUtf8('%PD'))).toBe(false)
    expect(isPdf(encodeUtf8('<?xml'))).toBe(false)
  })
})

describe('errors', () => {
  test('a SzamlazzError az eredeti okot is megőrzi', () => {
    const cause = new Error('eredeti')
    const error = new SzamlazzError('burkolt', { category: 'network', cause })

    expect(error.cause).toBe(cause)
    expect(error.name).toBe('SzamlazzError')
    expect(isSzamlazzError(error)).toBe(true)
    expect(isSzamlazzError(cause)).toBe(false)
  })

  test('ismeretlen kódra és üzenet nélkül is értelmes hibát ad', () => {
    expect(createAgentError({ code: 9999 })).toMatchObject({
      category: 'unknown',
      message: '[9999] Ismeretlen hiba a Számlázz.hu válaszában.',
    })
    expect(createAgentError({})).toMatchObject({
      code: undefined,
      message: 'Ismeretlen hiba a Számlázz.hu válaszában.',
    })
  })

  test('a parseErrorCode csak egész számot fogad el', () => {
    expect(parseErrorCode(' 57 ')).toBe(57)
    expect(parseErrorCode('-1')).toBe(-1)
    expect(parseErrorCode('57a')).toBeUndefined()
    expect(parseErrorCode(null)).toBeUndefined()
    expect(parseErrorCode(undefined)).toBeUndefined()
  })
})
