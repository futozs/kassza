import { describe, expect, test } from 'vitest'
import { FAKE_PDF_BYTES, type MockResponse, textErrorResponse } from '../../tests/helpers'
import { encodeUtf8 } from '../core/binary'
import { type AgentResponse, createAgentResponse } from '../core/response'
import { parseReceiptResponse } from './parse'
import {
  RECEIPT_WITH_PDF_RESPONSE,
  REVERSAL_RESPONSE,
  receiptErrorResponse,
  receiptResponse,
} from './test-fixtures'

function toAgentResponse(mock: MockResponse): AgentResponse {
  const body = mock.body ?? ''
  return createAgentResponse(
    'createReceipt',
    mock.status ?? 200,
    new Headers(mock.headers ?? {}),
    typeof body === 'string' ? encodeUtf8(body) : body,
  )
}

function parse(mock: MockResponse): unknown {
  try {
    return parseReceiptResponse(toAgentResponse(mock))
  } catch (error) {
    return error
  }
}

const MINIMAL_RECEIPT = `<sikeres>true</sikeres>
<nyugtaPdf>!</nyugtaPdf>
<nyugta>
  <alap>
    <id>1</id>
    <nyugtaszam>NYGT-2026-1</nyugtaszam>
    <tipus>NY</tipus>
    <stornozott>true</stornozott>
    <kelt>2026-09-16</kelt>
    <fizmod>bankkártya</fizmod>
    <penznem>HUF</penznem>
    <teszt>true</teszt>
  </alap>
  <tetelek>
    <tetel>
      <megnevezes>Nevezési díj</megnevezes>
      <mennyiseg>1</mennyiseg>
      <mennyisegiEgyseg>db</mennyisegiEgyseg>
      <nettoEgysegar>787.4</nettoEgysegar>
      <netto>787.40</netto>
      <afakulcs>27</afakulcs>
      <afa>212.60</afa>
      <brutto>1000</brutto>
    </tetel>
    <tetel>
      <megnevezes>Póló</megnevezes>
      <mennyiseg>1</mennyiseg>
      <mennyisegiEgyseg>db</mennyisegiEgyseg>
      <nettoEgysegar>3937.01</nettoEgysegar>
      <netto>3937.01</netto>
      <afakulcs>27</afakulcs>
      <afa>1062.99</afa>
      <brutto>5000</brutto>
    </tetel>
  </tetelek>
</nyugta>`

describe('parseReceiptResponse', () => {
  test('a docs sikeres, PDF-es mintájából minden mezőt kiolvas', () => {
    const receipt = parseReceiptResponse(toAgentResponse(RECEIPT_WITH_PDF_RESPONSE))

    expect(receipt).toEqual({
      id: 123456,
      number: 'NYGT-2017-123',
      callId: 'rendeles-42',
      type: 'receipt',
      isReversed: false,
      reversedReceiptNumber: undefined,
      issueDate: '2015-12-01',
      paymentMethod: 'készpénz',
      currency: 'EUR',
      exchangeBank: 'MNB',
      exchangeRate: 210,
      comment: 'Köszönjük a vásárlást',
      customerLedgerId: '311',
      isTest: false,
      orderNumber: 'ORD-2026-001',
      items: [
        {
          name: 'Cicás lábtörlő',
          identifier: 'CICA-1',
          quantity: 2,
          unit: 'db',
          netUnitPrice: 10000,
          vat: 27,
          vatPercentage: 27,
          netAmount: 20000,
          vatAmount: 5400,
          grossAmount: 25400,
          ledger: { revenue: '911', vat: '467' },
        },
        {
          name: 'Kutyás lábtörlő',
          identifier: undefined,
          quantity: 2,
          unit: 'db',
          netUnitPrice: 10000,
          vat: 'ÁKK',
          vatPercentage: 0,
          netAmount: 20000,
          vatAmount: 0,
          grossAmount: 20000,
          ledger: undefined,
        },
      ],
      payments: [
        { method: 'utalvány', amount: 1000, description: 'OTP SZÉP kártya' },
        { method: 'bankkártya', amount: 44400, description: undefined },
      ],
      totals: {
        netAmount: 40000,
        vatAmount: 5400,
        grossAmount: 45400,
        byVat: [
          { vat: 27, vatPercentage: 27, netAmount: 20000, vatAmount: 5400, grossAmount: 25400 },
          { vat: 'ÁKK', vatPercentage: 0, netAmount: 20000, vatAmount: 0, grossAmount: 20000 },
        ],
      },
      pdf: FAKE_PDF_BYTES,
    })
  })

  test('a sztornó nyugtát reversal típussal és az eredeti nyugtaszámmal adja vissza', () => {
    const receipt = parseReceiptResponse(toAgentResponse(REVERSAL_RESPONSE))

    expect(receipt).toMatchObject({
      number: 'NYGT-2017-124',
      type: 'reversal',
      reversedReceiptNumber: 'NYGT-2017-123',
      currency: 'Ft',
      isTest: true,
      payments: [],
      totals: { grossAmount: -1000, netAmount: -787.4, vatAmount: -212.6 },
    })
    expect(receipt).not.toHaveProperty('pdf')
  })

  test('hiányzó totalossz esetén a tételekből összegez, üres PDF-et nem ad vissza', () => {
    const receipt = parseReceiptResponse(toAgentResponse(receiptResponse(MINIMAL_RECEIPT)))

    expect(receipt.totals).toEqual({
      netAmount: 4724.41,
      vatAmount: 1275.59,
      grossAmount: 6000,
      byVat: [],
    })
    expect(receipt.isReversed).toBe(true)
    expect(receipt).not.toHaveProperty('pdf')
  })

  test('a hiányzó opcionális mezőket alapértékkel tölti ki', () => {
    const receipt = parseReceiptResponse(
      toAgentResponse(
        receiptResponse(
          '<sikeres>true</sikeres><nyugta><alap><nyugtaszam>X-1</nyugtaszam></alap><tetelek><tetel></tetel></tetelek></nyugta>',
        ),
      ),
    )

    expect(receipt).toMatchObject({
      id: 0,
      number: 'X-1',
      type: 'receipt',
      isReversed: false,
      issueDate: '',
      paymentMethod: '',
      currency: 'HUF',
      isTest: false,
      items: [
        {
          name: '',
          quantity: 0,
          unit: '',
          netUnitPrice: 0,
          vat: 0,
          vatPercentage: 0,
          netAmount: 0,
          vatAmount: 0,
          grossAmount: 0,
        },
      ],
    })
  })

  test('XML hibaválaszt típusos hibává alakít', () => {
    expect(parse(receiptErrorResponse(339, 'A nyugtaszám nem létezik.'))).toMatchObject({
      name: 'SzamlazzError',
      code: 339,
      category: 'not_found',
      isNotFound: true,
      action: 'createReceipt',
    })
  })

  test('a 338-as kódot duplikációként jelöli', () => {
    expect(parse(receiptErrorResponse(338, 'Hívásazonosító már létezik'))).toMatchObject({
      code: 338,
      isDuplicate: true,
      retryable: false,
    })
  })

  test('a szlahu_error fejlécet hibaként kezeli', () => {
    expect(parse(textErrorResponse('A nyugta előtag formátuma hibás', 337))).toMatchObject({
      code: 337,
      category: 'validation',
    })
  })

  test('a szöveges [ERR] választ hibaként kezeli', () => {
    expect(parse({ body: '[ERR] Sikertelen bejelentkezés ---------- részletek' })).toMatchObject({
      category: 'unknown',
      message: 'Sikertelen bejelentkezés',
    })
  })

  test('nem XML választ HTTP 5xx esetén hálózati hibának tekint', () => {
    expect(parse({ status: 502, body: 'Bad Gateway' })).toMatchObject({
      category: 'network',
      retryable: true,
      httpStatus: 502,
    })
  })

  test('nem XML 200-as választ váratlan válaszként jelez', () => {
    expect(parse({ body: 'valami más' })).toMatchObject({ category: 'unexpected_response' })
  })

  test('sikeres jelzés nélküli XML-t váratlan válaszként jelez', () => {
    expect(parse(receiptResponse('<nyugta></nyugta>'))).toMatchObject({
      category: 'unexpected_response',
    })
  })

  test('sikeres jelzés nélküli XML-t HTTP 5xx esetén hálózati hibának tekint', () => {
    expect(parse({ ...receiptResponse('<nyugta></nyugta>'), status: 503 })).toMatchObject({
      category: 'network',
    })
  })

  test('hiányzó nyugta blokknál váratlan válasz hibát ad', () => {
    expect(parse(receiptResponse('<sikeres>true</sikeres>'))).toMatchObject({
      category: 'unexpected_response',
      message: expect.stringContaining('<nyugta>'),
    })
  })

  test('hiányzó nyugtaszámnál váratlan válasz hibát ad', () => {
    expect(
      parse(receiptResponse('<sikeres>true</sikeres><nyugta><alap><id>1</id></alap></nyugta>')),
    ).toMatchObject({
      category: 'unexpected_response',
      message: expect.stringContaining('<nyugtaszam>'),
    })
  })
})
