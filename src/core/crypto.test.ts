import { describe, expect, test } from 'vitest'
import { bytesToHex, digestHex, hmac, hmacHex, timingSafeEqual } from './crypto'

const RFC4231_KEY = 'Jefe'
const RFC4231_DATA = 'what do ya want for nothing?'

describe('bytesToHex', () => {
  test('kisbetűs, kétjegyű hexát ad minden bájtra', () => {
    expect(bytesToHex(new Uint8Array([0, 1, 15, 16, 255]))).toBe('00010f10ff')
  })

  test('üres tömbre üres stringet ad', () => {
    expect(bytesToHex(new Uint8Array())).toBe('')
  })
})

describe('digestHex', () => {
  test('a NIST „abc” tesztvektorait adja SHA-256, SHA-384 és SHA-512 esetén', async () => {
    expect(await digestHex('SHA-256', 'abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(await digestHex('SHA-384', 'abc')).toBe(
      'cb00753f45a35e8bb5a03d699ac65007272c32ab0eded1631a8b605a43ff5bed8086072ba1e7cc2358baeca134c825a7',
    )
    expect(await digestHex('SHA-512', 'abc')).toBe(
      'ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f',
    )
  })

  test('bájttömböt és stringet azonos módon kezel', async () => {
    expect(await digestHex('SHA-256', new TextEncoder().encode('abc'))).toBe(
      await digestHex('SHA-256', 'abc'),
    )
  })

  test('a bemeneti tömb nézetét (subarray) is helyesen hasheli', async () => {
    const view = new TextEncoder().encode('xabcx').subarray(1, 4)
    expect(await digestHex('SHA-256', view)).toBe(await digestHex('SHA-256', 'abc'))
  })
})

describe('hmac', () => {
  test('az RFC 4231 2. tesztesetét adja mindhárom algoritmussal', async () => {
    expect(await hmacHex('SHA-256', RFC4231_KEY, RFC4231_DATA)).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    )
    expect(await hmacHex('SHA-384', RFC4231_KEY, RFC4231_DATA)).toBe(
      'af45d2e376484031617f78d2b58a6b1b9c7ef464f5a01b47e42ec3736322445e8e2240ca5e69e2c78b3239ecfab21649',
    )
    expect(await hmacHex('SHA-512', RFC4231_KEY, RFC4231_DATA)).toBe(
      '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea2505549758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737',
    )
  })

  test('nyers bájtokat ad, amelyek hexája megegyezik a hmacHex eredményével', async () => {
    const bytes = await hmac('SHA-256', RFC4231_KEY, RFC4231_DATA)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes).toHaveLength(32)
    expect(bytesToHex(bytes)).toBe(await hmacHex('SHA-256', RFC4231_KEY, RFC4231_DATA))
  })

  test('UTF-8 kulcsot és üzenetet bájtként kezel', async () => {
    const encoder = new TextEncoder()
    expect(await hmacHex('SHA-256', encoder.encode('kulcsú'), encoder.encode('árvíztűrő'))).toBe(
      await hmacHex('SHA-256', 'kulcsú', 'árvíztűrő'),
    )
  })
})

describe('timingSafeEqual', () => {
  test('azonos stringekre igazat ad', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true)
    expect(timingSafeEqual('', '')).toBe(true)
  })

  test('eltérő tartalomra hamisat ad', () => {
    expect(timingSafeEqual('abc', 'abd')).toBe(false)
  })

  test('eltérő hosszra hamisat ad, akkor is, ha az egyik a másik előtagja', () => {
    expect(timingSafeEqual('abc', 'abcd')).toBe(false)
    expect(timingSafeEqual('abcd', 'abc')).toBe(false)
    expect(timingSafeEqual('', 'a')).toBe(false)
  })

  test('UTF-8 bájtokat hasonlít, így az ékezetes karaktereket is helyesen kezeli', () => {
    expect(timingSafeEqual('árvíz', 'árvíz')).toBe(true)
    expect(timingSafeEqual('árvíz', 'arviz')).toBe(false)
  })
})
