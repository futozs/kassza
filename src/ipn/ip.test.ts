import { describe, expect, test } from 'vitest'
import { SzamlazzError } from '../core/errors'
import * as ipn from './index'
import { checkSzamlazzIp, isSzamlazzIp, SZAMLAZZ_OUTBOUND_IPS } from './ip'

describe('SZAMLAZZ_OUTBOUND_IPS', () => {
  test('a docs szerinti, 2025. augusztus 1-től érvényes címeket tartalmazza', () => {
    expect(SZAMLAZZ_OUTBOUND_IPS).toEqual(['3.73.214.98', '3.76.149.232', '18.153.156.51'])
  })
})

describe('isSzamlazzIp', () => {
  test.each(SZAMLAZZ_OUTBOUND_IPS)('a Számlázz.hu címét elfogadja: %s', (ip) => {
    expect(isSzamlazzIp(ip)).toBe(true)
  })

  test.each([
    ['x-forwarded-for lánc utolsó eleme', '10.0.0.1, 172.16.0.5, 3.73.214.98'],
    ['szóközökkel', '  18.153.156.51  '],
    ['IPv4-mapped IPv6', '::ffff:3.73.214.98'],
    ['nagybetűs IPv4-mapped IPv6', '::FFFF:3.76.149.232'],
    ['porttal', '3.73.214.98:44321'],
    ['szögletes zárójeles IPv6 porttal', '[::ffff:3.73.214.98]:443'],
    ['záró vesszővel és szóközzel', '3.73.214.98, '],
  ])('%s', (_label, ip) => {
    expect(isSzamlazzIp(ip)).toBe(true)
  })

  test.each([
    ['a régi, 2025. augusztus 1. előtti cím', '18.153.1.171'],
    ['idegen cím', '1.2.3.4'],
    ['a hamisított első elem a lánc elején', '3.73.214.98, 9.9.9.9'],
    ['a hamisított elem a valódi kliens előtt', '3.73.214.98, 10.0.0.1, 9.9.9.9'],
    ['részleges egyezés', '3.73.214.9'],
    ['üres szöveg', ''],
    ['csak vesszők és szóközök', ' , , '],
  ])('elutasítja: %s', (_label, ip) => {
    expect(isSzamlazzIp(ip)).toBe(false)
  })

  test('nem szöveg bemenetre false', () => {
    expect(isSzamlazzIp(undefined)).toBe(false)
    expect(isSzamlazzIp(null)).toBe(false)
    expect(isSzamlazzIp(42 as unknown as string)).toBe(false)
  })
})

describe('isSzamlazzIp trustedProxies', () => {
  test('a megadott számú, jobb szélső megbízható proxyt átugorja', () => {
    expect(isSzamlazzIp('3.73.214.98, 10.0.0.1', { trustedProxies: 1 })).toBe(true)
    expect(isSzamlazzIp('9.9.9.9, 3.73.214.98, 10.0.0.1, 10.0.0.2', { trustedProxies: 2 })).toBe(
      true,
    )
  })

  test('a proxyk átugrása után sem fogadja el a hamisítható bal oldali elemet', () => {
    expect(isSzamlazzIp('3.73.214.98, 9.9.9.9, 10.0.0.1', { trustedProxies: 1 })).toBe(false)
  })

  test('kevesebb elemnél, mint a megbízható proxyk száma, false', () => {
    expect(isSzamlazzIp('3.73.214.98', { trustedProxies: 1 })).toBe(false)
  })

  test.each([-1, 1.5, Number.NaN])(
    'érvénytelen trustedProxies (%s) konfigurációs hiba',
    (value) => {
      const call = (): boolean => isSzamlazzIp('3.73.214.98', { trustedProxies: value })

      expect(call).toThrow(SzamlazzError)
      expect(call).toThrow(/trustedProxies/)
    },
  )
})

describe('isSzamlazzIp allowedIps', () => {
  test('az alapértelmezett lista helyett a megadottat használja', () => {
    expect(isSzamlazzIp('203.0.113.7', { allowedIps: ['203.0.113.7'] })).toBe(true)
    expect(isSzamlazzIp('3.73.214.98', { allowedIps: ['203.0.113.7'] })).toBe(false)
  })

  test('a megadott címeket is egységes alakra hozza', () => {
    expect(isSzamlazzIp('203.0.113.7', { allowedIps: ['::ffff:203.0.113.7'] })).toBe(true)
  })

  test('üres listával semmit sem fogad el', () => {
    expect(isSzamlazzIp('3.73.214.98', { allowedIps: [] })).toBe(false)
  })
})

describe('ipn barrel', () => {
  test('minden publikus függvényt exportál', () => {
    expect(Object.keys(ipn).sort()).toEqual([
      'IPN_FIELDS',
      'MAX_IPN_BODY_BYTES',
      'SZAMLAZZ_OUTBOUND_IPS',
      'checkSzamlazzIp',
      'ipnOkResponse',
      'isSzamlazzIp',
      'parseIpnAmount',
      'parseIpnNotification',
      'readIpnNotification',
    ])
  })
})

describe('checkSzamlazzIp', () => {
  test('elfogadáskor a normalizált kliens címet adja vissza', () => {
    expect(checkSzamlazzIp('10.0.0.1, ::ffff:3.73.214.98')).toEqual({
      allowed: true,
      client: '3.73.214.98',
    })
  })

  test('megmondja, miért utasította el', () => {
    expect(checkSzamlazzIp(null)).toMatchObject({ allowed: false, reason: 'missing_header' })
    expect(checkSzamlazzIp('   ')).toMatchObject({ allowed: false, reason: 'missing_header' })
    expect(checkSzamlazzIp('3.73.214.98', { trustedProxies: 1 })).toMatchObject({
      allowed: false,
      reason: 'no_client_entry',
    })
    const rejected = checkSzamlazzIp('52.1.2.3:443')
    expect(rejected).toMatchObject({ allowed: false, reason: 'not_allowed', client: '52.1.2.3' })
    expect(rejected.allowed === false && rejected.message).toContain('allowedIps')
  })

  test('az allowedIps felülírja a beépített listát', () => {
    expect(checkSzamlazzIp('52.1.2.3', { allowedIps: ['52.1.2.3'] })).toEqual({
      allowed: true,
      client: '52.1.2.3',
    })
  })

  test('az index is exportálja', () => {
    expect(ipn.checkSzamlazzIp).toBe(checkSzamlazzIp)
  })
})
