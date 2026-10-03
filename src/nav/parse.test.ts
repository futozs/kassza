import { describe, expect, test } from 'vitest'
import { NavReceiptError } from './errors'
import {
  parseAuthTokenResponse,
  parseCurrencyResponse,
  parseIdResponse,
  parseIssuingSoftwareListResponse,
  parseNavResponse,
  parseReceiptDetailResponse,
  parseReceiptListResponse,
  parseVatCategoryResponse,
} from './parse'

const NS =
  'xmlns="http://schemas.nav.gov.hu/NTCA/2.0/common/service" xmlns:ns2="http://schemas.nav.gov.hu/NTCA/1.0/receipt" xmlns:ns3="http://schemas.nav.gov.hu/NTCA/2.0/common/paging"'
const CONTEXT =
  '<context><requestId>584b4d7e-8e5c-459c-bb91-3099575d846d</requestId><timestamp>2026-06-27T10:49:15.200431Z</timestamp></context>'

function response(
  root: string,
  inner: string,
  resultCode = '<resultCode>SUCCESS</resultCode>',
): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><ns2:${root} ${NS}>${CONTEXT}${resultCode}${inner}</ns2:${root}>`
}

describe('parseNavResponse', () => {
  test('a várt gyökérelemű sikeres választ visszaadja', () => {
    const root = parseNavResponse(
      'createReceipt',
      'CreateReceiptResponse',
      200,
      response('CreateReceiptResponse', '<ns2:id>12345678_20260712_3</ns2:id>'),
    )
    expect(parseIdResponse(root, 'createReceipt')).toBe('12345678_20260712_3')
  })

  test('a BusinessErrorResponse-t kóddal, magyar üzenettel és tanáccsal dobja', () => {
    const body = `<BusinessErrorResponse xmlns="http://schemas.nav.gov.hu/NTCA/2.0/common/service">${CONTEXT}<resultCode>ERROR</resultCode><message>Nem létező szoftver megnevezés.</message><errorCode>EPGP0002</errorCode></BusinessErrorResponse>`
    try {
      parseNavResponse('createReceipt', 'CreateReceiptResponse', 400, body)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(NavReceiptError)
      expect(error).toMatchObject({
        category: 'business',
        code: 'EPGP0002',
        httpStatus: 400,
        operation: 'createReceipt',
        hint: expect.stringContaining('registerSoftware'),
        message: 'NAV hiba [EPGP0002]: Nem létező szoftver megnevezés.',
      })
    }
  })

  test('az InvalidRequestResponse mezőhibáit is felsorolja', () => {
    const body = `<InvalidRequestResponse xmlns="http://schemas.nav.gov.hu/NTCA/2.0/common/service">${CONTEXT}<resultCode>ERROR</resultCode><errorCode>EPGP9001</errorCode><error><field>serialNumber</field><error>Hibás formátum</error></error><error><field>total</field></error></InvalidRequestResponse>`
    expect(() => parseNavResponse('createReceipt', 'CreateReceiptResponse', 400, body)).toThrow(
      expect.objectContaining({
        category: 'validation',
        fieldErrors: [
          { field: 'serialNumber', error: 'Hibás formátum' },
          { field: 'total', error: undefined },
        ],
        message: expect.stringContaining('serialNumber: Hibás formátum; total'),
      }),
    )
  })

  test('a technikai hibát újrapróbálhatónak, az ismeretlen kódot a gyökér szerint sorolja be', () => {
    const technical = `<TechnicalErrorResponse xmlns="http://schemas.nav.gov.hu/NTCA/2.0/common/service">${CONTEXT}<resultCode>ERROR</resultCode><errorCode>EPGP_UJ</errorCode></TechnicalErrorResponse>`
    try {
      parseNavResponse('listReceipts', 'ReceiptListResponse', 500, technical)
      expect.unreachable()
    } catch (error) {
      expect(error).toMatchObject({ category: 'technical', code: 'EPGP_UJ', retryable: true })
      expect((error as Error).message).toContain('ismeretlen hiba')
    }
  })

  test('a 401-es választ hitelesítési hibának veszi, a resultCode ERROR-t is hibának', () => {
    const unauthorized = `<BusinessErrorResponse xmlns="http://schemas.nav.gov.hu/NTCA/2.0/common/service">${CONTEXT}<resultCode>ERROR</resultCode><errorCode>EPGP0046</errorCode></BusinessErrorResponse>`
    expect(() =>
      parseNavResponse('listReceipts', 'ReceiptListResponse', 401, unauthorized),
    ).toThrow(expect.objectContaining({ category: 'auth', code: 'EPGP0046', retryable: false }))
    const errorResult = response(
      'ReceiptListResponse',
      '',
      '<resultCode>ERROR</resultCode><message>Hiba</message>',
    )
    expect(() => parseNavResponse('listReceipts', 'ReceiptListResponse', 200, errorResult)).toThrow(
      expect.objectContaining({ message: 'NAV hiba: Hiba' }),
    )
  })

  test('üres, nem XML, váratlan gyökerű vagy nem 2xx választ váratlan válaszként jelez', () => {
    expect(() => parseNavResponse('currencies', 'CurrencyResponse', 200, '  ')).toThrow(
      expect.objectContaining({ category: 'unexpected_response' }),
    )
    expect(() => parseNavResponse('currencies', 'CurrencyResponse', 503, '')).toThrow(
      expect.objectContaining({ category: 'technical', httpStatus: 503 }),
    )
    expect(() => parseNavResponse('currencies', 'CurrencyResponse', 403, '<html>')).toThrow(
      expect.objectContaining({ category: 'auth' }),
    )
    expect(() => parseNavResponse('currencies', 'CurrencyResponse', 200, '<a><b></a>')).toThrow(
      expect.objectContaining({ category: 'unexpected_response' }),
    )
    expect(() =>
      parseNavResponse('currencies', 'CurrencyResponse', 200, response('VatCategoryResponse', '')),
    ).toThrow(
      expect.objectContaining({ message: expect.stringContaining('CurrencyResponse helyett') }),
    )
    expect(() =>
      parseNavResponse('currencies', 'CurrencyResponse', 302, response('CurrencyResponse', '')),
    ).toThrow(expect.objectContaining({ category: 'unexpected_response', httpStatus: 302 }))
  })
})

describe('válaszmezők', () => {
  test('az AuthTokenResponse tokenjét és lejáratát adja, resultCode nélkül is', () => {
    const root = parseNavResponse(
      'authToken',
      'AuthTokenResponse',
      200,
      `<ns3:AuthTokenResponse xmlns="http://schemas.nav.gov.hu/NTCA/2.0/common/service" xmlns:ns2="http://schemas.nav.gov.hu/NTCA/2.0/common/authservice" xmlns:ns3="http://schemas.nav.gov.hu/NTCA/1.0/receipt">${CONTEXT}<ns2:notifications/><ns3:token>eyJ.token.x</ns3:token><ns3:validTo>2026-06-27T14:26:29.735Z</ns3:validTo></ns3:AuthTokenResponse>`,
    )
    expect(parseAuthTokenResponse(root)).toEqual({
      token: 'eyJ.token.x',
      validTo: '2026-06-27T14:26:29.735Z',
    })
  })

  test('token nélküli válaszra hitelesítési hibát dob', () => {
    const root = parseNavResponse(
      'authToken',
      'AuthTokenResponse',
      200,
      response('AuthTokenResponse', '<ns2:token/>'),
    )
    expect(() => parseAuthTokenResponse(root)).toThrow(
      expect.objectContaining({ category: 'auth' }),
    )
  })

  test('a ReceiptListResponse lapozását és tételeit a specifikáció példája szerint olvassa', () => {
    const root = parseNavResponse(
      'listReceipts',
      'ReceiptListResponse',
      200,
      response(
        'ReceiptListResponse',
        `<ns2:paging><ns3:pageSize>2</ns3:pageSize><ns3:page>1</ns3:page><ns3:totalRowCount>2</ns3:totalRowCount></ns2:paging><ns2:result><ns2:receipt><ns2:id>12345678_20260601_1</ns2:id><ns2:applicableDate>2026-06-01</ns2:applicableDate><ns2:serialNumber>1234v</ns2:serialNumber><ns2:numberOfSaleDocument>1</ns2:numberOfSaleDocument><ns2:numberOfModifyingDocument>1</ns2:numberOfModifyingDocument><ns2:totalAmount>170000</ns2:totalAmount><ns2:totalAmountInForint>170000</ns2:totalAmountInForint><ns2:status>RECORDED</ns2:status><ns2:issuingSoftware><ns2:name>Sample Software v1</ns2:name></ns2:issuingSoftware></ns2:receipt><ns2:receipt><ns2:id>12345678_20260529_2</ns2:id><ns2:applicableDate>2026-05-29</ns2:applicableDate><ns2:serialNumber>1234v</ns2:serialNumber><ns2:numberOfSaleDocument>1</ns2:numberOfSaleDocument><ns2:numberOfModifyingDocument>0</ns2:numberOfModifyingDocument><ns2:totalAmount>1</ns2:totalAmount><ns2:totalAmountInForint>100</ns2:totalAmountInForint><ns2:status>INVALIDATED</ns2:status><ns2:issuingSoftware><ns2:name>Sample Software v1</ns2:name></ns2:issuingSoftware></ns2:receipt></ns2:result>`,
      ),
    )
    const page = parseReceiptListResponse(root)
    expect(page).toMatchObject({ page: 1, pageSize: 2, totalRowCount: 2 })
    expect(page.items).toEqual([
      {
        id: '12345678_20260601_1',
        applicableDate: '2026-06-01',
        serialNumber: '1234v',
        numberOfSaleDocument: 1,
        numberOfModifyingDocument: 1,
        totalAmount: 170000,
        totalAmountInForint: 170000,
        status: 'RECORDED',
        softwareName: 'Sample Software v1',
      },
      expect.objectContaining({
        id: '12345678_20260529_2',
        status: 'INVALIDATED',
        totalAmountInForint: 100,
      }),
    ])
  })

  test('üres listánál üres tömböt ad', () => {
    const root = parseNavResponse(
      'listReceipts',
      'ReceiptListResponse',
      200,
      response(
        'ReceiptListResponse',
        '<ns2:paging><ns3:pageSize>100</ns3:pageSize><ns3:page>1</ns3:page><ns3:totalRowCount>0</ns3:totalRowCount></ns2:paging><ns2:result/>',
      ),
    )
    expect(parseReceiptListResponse(root).items).toEqual([])
  })

  test('a ReceiptDetailResponse teljes tartalmát olvassa, a deviza árfolyamával', () => {
    const root = parseNavResponse(
      'receiptDetail',
      'ReceiptDetailResponse',
      200,
      response(
        'ReceiptDetailResponse',
        '<ns2:id>87654321_20260601_3</ns2:id><ns2:issuingSoftware><ns2:name>Sample Software v1</ns2:name></ns2:issuingSoftware><ns2:applicableDate>2026-05-29</ns2:applicableDate><ns2:status>INVALIDATED</ns2:status><ns2:serialNumber>001</ns2:serialNumber><ns2:currency>BGN</ns2:currency><ns2:exchangeRate>185.0</ns2:exchangeRate><ns2:vatCategoryItems><ns2:vatCategory><ns2:vat>0%</ns2:vat><ns2:saleDocument>1</ns2:saleDocument><ns2:modifyingDocument>0</ns2:modifyingDocument></ns2:vatCategory><ns2:vatCategory><ns2:vat>Egyéb</ns2:vat><ns2:saleDocument>0</ns2:saleDocument><ns2:modifyingDocument>0</ns2:modifyingDocument></ns2:vatCategory></ns2:vatCategoryItems><ns2:total>1</ns2:total><ns2:totalAmountInForint>185</ns2:totalAmountInForint><ns2:numberOfSaleDocument>1</ns2:numberOfSaleDocument><ns2:numberOfModifyingDocument>0</ns2:numberOfModifyingDocument>',
      ),
    )
    expect(parseReceiptDetailResponse(root)).toEqual({
      id: '87654321_20260601_3',
      softwareName: 'Sample Software v1',
      applicableDate: '2026-05-29',
      status: 'INVALIDATED',
      serialNumber: '001',
      currency: 'BGN',
      exchangeRate: 185,
      vatCategories: [
        { vat: '0%', saleDocument: 1, modifyingDocument: 0 },
        { vat: 'Egyéb', saleDocument: 0, modifyingDocument: 0 },
      ],
      total: 1,
      totalAmountInForint: 185,
      numberOfSaleDocument: 1,
      numberOfModifyingDocument: 0,
    })
  })

  test('a nil árfolyamot null-ként adja', () => {
    const root = parseNavResponse(
      'receiptDetail',
      'ReceiptDetailResponse',
      200,
      response(
        'ReceiptDetailResponse',
        '<ns2:id>1_2_3</ns2:id><ns2:issuingSoftware><ns2:name>K</ns2:name></ns2:issuingSoftware><ns2:applicableDate>2026-05-29</ns2:applicableDate><ns2:status>RECORDED</ns2:status><ns2:serialNumber>001</ns2:serialNumber><ns2:currency>HUF</ns2:currency><ns2:exchangeRate xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true"/><ns2:vatCategoryItems/><ns2:total>0</ns2:total><ns2:totalAmountInForint>0</ns2:totalAmountInForint><ns2:numberOfSaleDocument>1</ns2:numberOfSaleDocument><ns2:numberOfModifyingDocument>0</ns2:numberOfModifyingDocument>',
      ),
    )
    expect(parseReceiptDetailResponse(root)).toMatchObject({
      exchangeRate: null,
      vatCategories: [],
    })
  })

  test('hiányzó kötelező mezőre, nem számra és ismeretlen státuszra váratlan válasz hibát dob', () => {
    const missing = parseNavResponse(
      'createReceipt',
      'CreateReceiptResponse',
      200,
      response('CreateReceiptResponse', ''),
    )
    expect(() => parseIdResponse(missing, 'createReceipt')).toThrow(
      expect.objectContaining({
        category: 'unexpected_response',
        message: expect.stringContaining('id'),
      }),
    )
    const badItem = (status: string, total: string) =>
      parseNavResponse(
        'listReceipts',
        'ReceiptListResponse',
        200,
        response(
          'ReceiptListResponse',
          `<ns2:paging><ns3:pageSize>1</ns3:pageSize><ns3:page>1</ns3:page><ns3:totalRowCount>1</ns3:totalRowCount></ns2:paging><ns2:result><ns2:receipt><ns2:id>1_2_3</ns2:id><ns2:applicableDate>2026-06-01</ns2:applicableDate><ns2:serialNumber>1</ns2:serialNumber><ns2:numberOfSaleDocument>1</ns2:numberOfSaleDocument><ns2:numberOfModifyingDocument>0</ns2:numberOfModifyingDocument><ns2:totalAmount>${total}</ns2:totalAmount><ns2:totalAmountInForint>1</ns2:totalAmountInForint><ns2:status>${status}</ns2:status><ns2:issuingSoftware><ns2:name>K</ns2:name></ns2:issuingSoftware></ns2:receipt></ns2:result>`,
        ),
      )
    expect(() => parseReceiptListResponse(badItem('DELETED', '1'))).toThrow(
      expect.objectContaining({ message: expect.stringContaining('DELETED') }),
    )
    expect(() => parseReceiptListResponse(badItem('RECORDED', 'sok'))).toThrow(
      expect.objectContaining({ message: expect.stringContaining('nem szám') }),
    )
  })

  test('a szoftverlistát, az áfakategóriákat és a pénznemeket olvassa', () => {
    const software = parseNavResponse(
      'listIssuingSoftware',
      'IssuingSoftwareListResponse',
      200,
      response(
        'IssuingSoftwareListResponse',
        '<ns2:issuingSoftwareList><ns2:software><ns2:name>Sample Software v1</ns2:name></ns2:software><ns2:software><ns2:name>Kassza 1.0</ns2:name></ns2:software></ns2:issuingSoftwareList>',
      ),
    )
    expect(parseIssuingSoftwareListResponse(software)).toEqual(['Sample Software v1', 'Kassza 1.0'])
    const categories = parseNavResponse(
      'vatCategories',
      'VatCategoryResponse',
      200,
      response(
        'VatCategoryResponse',
        '<ns2:categories><ns2:category><ns2:name>0%</ns2:name><ns2:validFrom>2026-09-01</ns2:validFrom></ns2:category><ns2:category><ns2:name>Egyéb</ns2:name><ns2:validFrom>2026-09-01</ns2:validFrom><ns2:validTo>2030-12-31</ns2:validTo></ns2:category></ns2:categories>',
      ),
    )
    expect(parseVatCategoryResponse(categories)).toEqual([
      { name: '0%', validFrom: '2026-09-01', validTo: undefined },
      { name: 'Egyéb', validFrom: '2026-09-01', validTo: '2030-12-31' },
    ])
    const currencies = parseNavResponse(
      'currencies',
      'CurrencyResponse',
      200,
      response(
        'CurrencyResponse',
        '<ns2:currencies><ns2:currency><ns2:name>Magyar forint</ns2:name><ns2:code>HUF</ns2:code></ns2:currency></ns2:currencies>',
      ),
    )
    expect(parseCurrencyResponse(currencies)).toEqual([{ code: 'HUF', name: 'Magyar forint' }])
  })
})
