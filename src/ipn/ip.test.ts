import { describe, expect, test } from 'vitest'
import * as ipn from './index'
import { isSzamlazzIp, SZAMLAZZ_OUTBOUND_IPS } from './ip'

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
    ['x-forwarded-for lánc első eleme', '3.73.214.98, 10.0.0.1, 172.16.0.5'],
    ['szóközökkel', '  18.153.156.51  '],
    ['IPv4-mapped IPv6', '::ffff:3.73.214.98'],
    ['nagybetűs IPv4-mapped IPv6', '::FFFF:3.76.149.232'],
    ['porttal', '3.73.214.98:44321'],
    ['szögletes zárójeles IPv6 porttal', '[::ffff:3.73.214.98]:443'],
  ])('%s', (_label, ip) => {
    expect(isSzamlazzIp(ip)).toBe(true)
  })

  test.each([
    ['a régi, 2025. augusztus 1. előtti cím', '18.153.1.171'],
    ['idegen cím', '1.2.3.4'],
    ['csak a lánc második eleme a Számlázz.hu-é', '10.0.0.1, 3.73.214.98'],
    ['részleges egyezés', '3.73.214.9'],
    ['üres szöveg', ''],
  ])('elutasítja: %s', (_label, ip) => {
    expect(isSzamlazzIp(ip)).toBe(false)
  })

  test('nem szöveg bemenetre false', () => {
    expect(isSzamlazzIp(undefined as unknown as string)).toBe(false)
  })
})

describe('ipn barrel', () => {
  test('minden publikus függvényt exportál', () => {
    expect(Object.keys(ipn).sort()).toEqual([
      'IPN_FIELDS',
      'SZAMLAZZ_OUTBOUND_IPS',
      'ipnOkResponse',
      'isSzamlazzIp',
      'parseIpnAmount',
      'parseIpnNotification',
      'readIpnNotification',
    ])
  })
})
