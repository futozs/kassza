import { describe, expect, test } from 'vitest'
import { canValidateXsd, validateAgainstXsd } from '../../tests/xsd'
import type { NavReceiptData } from './types'
import {
  buildAuthTokenXml,
  buildContextOnlyXml,
  buildCreateIssuingSoftwareXml,
  buildCreateReceiptXml,
  buildIssuingSoftwareListXml,
  buildModifyReceiptXml,
  buildReceiptIdXml,
  buildReceiptListXml,
  type NavRequestContext,
} from './xml'

const SCHEMA = 'nav-receipt/receipt-if-schema-v1.1.1.xsd'
const CONTEXT: NavRequestContext = {
  requestId: '584b4d7e-8e5c-459c-bb91-3099575d846d',
  timestamp: '2026-10-02T08:30:00.123Z',
}
const LEGACY_CONTEXT: NavRequestContext = {
  requestId: 'DPrHL3Tr6djsrPtABCDEFGHIJ12345',
  timestamp: '2026-10-02T08:30:00.123Z',
}
const HASH = 'A'.repeat(128)

const HUF_REPORT: NavReceiptData = {
  applicableDate: '2026-10-01',
  serialNumber: 'NYGT-2026-41',
  currency: 'HUF',
  exchangeRate: null,
  vatCategories: [
    { vat: '27%', saleDocument: 1780, modifyingDocument: -890 },
    { vat: '5%', saleDocument: 250, modifyingDocument: -250 },
    { vat: 'Alanyi adómentes', saleDocument: 0.5, modifyingDocument: 0 },
  ],
  total: 890.5,
  numberOfSaleDocument: 2,
  numberOfModifyingDocument: 1,
}

const EUR_REPORT: NavReceiptData = {
  ...HUF_REPORT,
  currency: 'EUR',
  exchangeRate: 395.1234,
  vatCategories: [{ vat: '27%', saleDocument: 12.5, modifyingDocument: 0 }],
  total: 12.5,
  numberOfSaleDocument: 1,
  numberOfModifyingDocument: 0,
}

function expectValid(xml: string): void {
  if (canValidateXsd(SCHEMA)) expect(validateAgainstXsd(xml, SCHEMA)).toEqual([])
}

describe('NAV kérés XML-ek', () => {
  test('az AuthTokenRequest a service, authservice és receipt névtereket helyesen használja', () => {
    const xml = buildAuthTokenXml(LEGACY_CONTEXT, {
      login: 'technikai_user',
      passwordHash: HASH,
      taxPayerId: '12345678',
      predecessorTaxPayerId: '87654321',
      requestSignature: 'B'.repeat(128),
    })
    expect(xml).toContain('<AuthTokenRequest xmlns="http://schemas.nav.gov.hu/NTCA/1.0/receipt"')
    expect(xml).toContain('xmlns:auth="http://schemas.nav.gov.hu/NTCA/2.0/common/authservice"')
    expect(xml).toContain(`<auth:passwordHash cryptoType="SHA-512">${HASH}</auth:passwordHash>`)
    expect(xml).toContain('<auth:requestSignature cryptoType="SHA3-512">')
    expect(xml).toContain('<auth:predecessorTaxNumber>87654321</auth:predecessorTaxNumber>')
    expectValid(xml)
  })

  test('jogelőd nélkül is érvényes az AuthTokenRequest', () => {
    const xml = buildAuthTokenXml(LEGACY_CONTEXT, {
      login: 'technikai_user',
      passwordHash: HASH,
      taxPayerId: '12345678',
      requestSignature: 'B'.repeat(128),
    })
    expect(xml).not.toContain('predecessorTaxNumber')
    expectValid(xml)
  })

  test('forintos jelentésnél xsi:nil árfolyamot küld, és XSD-valid', () => {
    const xml = buildCreateReceiptXml(CONTEXT, '12345678', 'Kassza 1.0', HUF_REPORT)
    expect(xml).toContain('<exchangeRate xsi:nil="true"></exchangeRate>')
    expect(xml).toContain('xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"')
    expect(xml).toContain('<modifyingDocument>-890</modifyingDocument>')
    expect(xml).toContain('<vat>Alanyi adómentes</vat>')
    expect(xml).toContain('<total>890.5</total>')
    expectValid(xml)
  })

  test('devizás jelentésnél négy tizedesre kerekített árfolyamot küld', () => {
    const xml = buildCreateReceiptXml(CONTEXT, '12345678', 'Kassza 1.0', {
      ...EUR_REPORT,
      exchangeRate: 395.12344,
    })
    expect(xml).toContain('<exchangeRate>395.1234</exchangeRate>')
    expectValid(xml)
  })

  test('a módosító kérés azonosítót kap, sorszámot nem', () => {
    const xml = buildModifyReceiptXml(
      CONTEXT,
      '12345678_20261001_1',
      '12345678',
      'Kassza 1.0',
      HUF_REPORT,
    )
    expect(xml).toContain('<id>12345678_20261001_1</id>')
    expect(xml).not.toContain('serialNumber')
    expectValid(xml)
  })

  test('a lista kérés a lapozást a paging névtérben küldi', () => {
    const xml = buildReceiptListXml(CONTEXT, '12345678', {
      from: '2026-09-01',
      to: '2026-09-30',
      page: 2,
      pageSize: 50,
      orderBy: 'SERIAL_NUMBER',
      direction: 'DESC',
    })
    expect(xml).toContain('<page:pageSize>50</page:pageSize>')
    expect(xml).toContain('<page:page>2</page:page>')
    expect(xml).toContain('<property>SERIAL_NUMBER</property>')
    expectValid(xml)
  })

  test('a lista kérés alapértelmezett lapozással és rendezéssel is érvényes', () => {
    const xml = buildReceiptListXml(CONTEXT, '12345678', { from: '2026-09-01', to: '2026-09-30' })
    expect(xml).toContain('<page:pageSize>100</page:pageSize>')
    expect(xml).toContain('<direction>ASC</direction>')
    expectValid(xml)
  })

  test.each(['ReceiptDetailRequest', 'InvalidateReceiptRequest'] as const)(
    'a(z) %s XSD-valid',
    (root) => {
      const xml = buildReceiptIdXml(root, CONTEXT, '12345678_20261001_1', '12345678')
      expect(xml).toContain(`<${root} `)
      expectValid(xml)
    },
  )

  test('a szoftver rögzítése és listázása XSD-valid', () => {
    expectValid(buildCreateIssuingSoftwareXml(CONTEXT, '12345678', 'Kassza 1.0'))
    expectValid(buildIssuingSoftwareListXml(CONTEXT, '12345678'))
  })

  test.each(['VatCategoryRequest', 'CurrencyRequest'] as const)('a(z) %s XSD-valid', (root) => {
    expectValid(buildContextOnlyXml(root, CONTEXT))
  })
})
