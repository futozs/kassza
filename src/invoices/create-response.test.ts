import { describe, expect, test } from 'vitest'
import { FAKE_PDF_BYTES } from '../../tests/helpers'
import { bytesToBase64 } from '../core/binary'
import { SzamlazzError } from '../core/errors'
import { type AgentResponse, createAgentResponse } from '../core/response'
import { parseCreateInvoiceResponse, parseInvoicePreviewResponse } from './create-response'
import type { CreatedInvoiceItem } from './create-types'

const ITEMS: CreatedInvoiceItem[] = [
  {
    name: 'Termék',
    quantity: 2,
    vat: 27,
    netUnitPrice: 10000,
    netAmount: 20000,
    vatAmount: 5400,
    grossAmount: 25400,
  },
]

function response(
  body: string | Uint8Array,
  headers: Record<string, string> = {},
  status = 200,
): AgentResponse {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body
  return createAgentResponse('createInvoice', status, new Headers(headers), bytes)
}

function xml(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<xmlszamlavalasz xmlns="http://www.szamlazz.hu/xmlszamlavalasz" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n${inner}\n</xmlszamlavalasz>`
}

function caught(fn: () => unknown): SzamlazzError {
  try {
    fn()
  } catch (error) {
    expect(error).toBeInstanceOf(SzamlazzError)
    return error as SzamlazzError
  }
  throw new Error('Hibát vártunk')
}

describe('parseCreateInvoiceResponse', () => {
  test('a sikeres XML választ base64 PDF-fel együtt feldolgozza', () => {
    const pdfBase64 = bytesToBase64(FAKE_PDF_BYTES)
    const wrapped = `${pdfBase64.slice(0, 10)}\n${pdfBase64.slice(10)}`
    const result = parseCreateInvoiceResponse(
      response(
        xml(
          `<sikeres>true</sikeres>\n<szamlaszam>XXX-2026-3</szamlaszam>\n<szamlanetto>20000</szamlanetto>\n<szamlabrutto>25400</szamlabrutto>\n<kintlevoseg>0</kintlevoseg>\n<vevoifiokurl>https://www.szamlazz.hu/szamla/?page=vevoifiokpay&amp;partguid=abc</vevoifiokurl>\n<pdf>${wrapped}</pdf>`,
        ),
      ),
      ITEMS,
    )

    expect(result).toEqual({
      number: 'XXX-2026-3',
      netTotal: 20000,
      grossTotal: 25400,
      outstanding: 0,
      buyerAccountUrl: 'https://www.szamlazz.hu/szamla/?page=vevoifiokpay&partguid=abc',
      pdf: FAKE_PDF_BYTES,
      items: ITEMS,
    })
  })

  test('PDF nélküli XML válasznál a hiányzó mezőket a fejlécekből pótolja', () => {
    const result = parseCreateInvoiceResponse(
      response(xml('<sikeres>true</sikeres>'), {
        szlahu_szamlaszam: encodeURIComponent('E 2026/1'),
        szlahu_nettovegosszeg: '100',
        szlahu_bruttovegosszeg: '127',
        szlahu_vevoifiokurl: encodeURIComponent('https://example.hu/fiok'),
      }),
    )

    expect(result).toEqual({
      number: 'E 2026/1',
      netTotal: 100,
      grossTotal: 127,
      outstanding: undefined,
      buyerAccountUrl: 'https://example.hu/fiok',
      pdf: undefined,
      items: [],
    })
  })

  test('az XML hibaválaszt típusos hibává alakítja', () => {
    const error = caught(() =>
      parseCreateInvoiceResponse(
        response(
          xml(
            '<sikeres>false</sikeres>\n<hibakod>3</hibakod>\n<hibauzenet><![CDATA[Bejelentkezési hiba]]></hibauzenet>',
          ),
        ),
      ),
    )

    expect(error).toMatchObject({
      code: 3,
      category: 'auth',
      message: '[3] Bejelentkezési hiba',
      action: 'createInvoice',
    })
  })

  test('a fejlécben érkező hibát a törzs előtt dobja', () => {
    const error = caught(() =>
      parseCreateInvoiceResponse(
        response(FAKE_PDF_BYTES, {
          szlahu_error_code: '202',
          szlahu_error: encodeURIComponent('A megadott számlaszám előtag nem megfelelő.'),
        }),
      ),
    )

    expect(error).toMatchObject({ code: 202, category: 'validation' })
    expect(error.hint).toContain('Előtagok')
  })

  test('a szöveges [ERR] hibát feldolgozza', () => {
    const error = caught(() =>
      parseCreateInvoiceResponse(
        response(
          '[ERR] Számla mentés sikertelen. Már létező rendelésszám: XX. ---------- t.getMessage(): Már létező rendelésszám:\nXX. ---------- [CEG:978]',
        ),
      ),
    )

    expect(error.message).toContain('Már létező rendelésszám')
  })

  test('a nyers PDF törzset és a szlahu fejléceket feldolgozza', () => {
    const result = parseCreateInvoiceResponse(
      response(FAKE_PDF_BYTES, {
        'content-type': 'application/pdf',
        szlahu_szamlaszam: 'WEB-2026-12',
        szlahu_nettovegosszeg: '20000',
        szlahu_bruttovegosszeg: '25400',
      }),
      ITEMS,
    )

    expect(result).toEqual({
      number: 'WEB-2026-12',
      netTotal: 20000,
      grossTotal: 25400,
      outstanding: undefined,
      buyerAccountUrl: undefined,
      pdf: FAKE_PDF_BYTES,
      items: ITEMS,
    })
  })

  test('a DONE szöveges választ feldolgozza, a végösszeget a tételekből számolja', () => {
    const result = parseCreateInvoiceResponse(
      response('xmlagentresponse=DONE;WEB-2026-13\n'),
      ITEMS,
    )

    expect(result).toMatchObject({ number: 'WEB-2026-13', netTotal: 20000, grossTotal: 25400 })
    expect(result.pdf).toBeUndefined()
  })

  test('a számlaszám nélküli DONE válasznál a fejléc számlaszámát használja', () => {
    const result = parseCreateInvoiceResponse(
      response('xmlagentresponse=DONE', { szlahu_szamlaszam: 'H-1', szlahu_nettovegosszeg: '50' }),
      ITEMS,
    )

    expect(result).toMatchObject({ number: 'H-1', netTotal: 50, grossTotal: 25400 })
  })

  test('üres törzsnél a fejlécekből olvas', () => {
    const result = parseCreateInvoiceResponse(response('', { szlahu_szamlaszam: 'H-2' }))

    expect(result).toMatchObject({ number: 'H-2', netTotal: 0, grossTotal: 0 })
  })

  test('felismerhetetlen válaszra unexpected_response hibát dob', () => {
    const error = caught(() => parseCreateInvoiceResponse(response('<html')))

    expect(error.category).toBe('unexpected_response')
    expect(caught(() => parseCreateInvoiceResponse(response('valami egészen más'))).category).toBe(
      'unexpected_response',
    )
  })

  test('sikeres, de számlaszám nélküli válaszra hibát dob', () => {
    const error = caught(() => parseCreateInvoiceResponse(response(FAKE_PDF_BYTES)))

    expect(error).toMatchObject({ category: 'unexpected_response' })
    expect(error.message).toContain('számlaszám')
  })

  test('HTTP 500-as választ újrapróbálható network hibaként jelez', () => {
    const error = caught(() => parseCreateInvoiceResponse(response('Internal error', {}, 500)))

    expect(error).toMatchObject({ category: 'network', httpStatus: 500 })
  })
})

describe('parseInvoicePreviewResponse', () => {
  test('az előnézeti PDF-et XML-ből és nyers törzsből is kiolvassa', () => {
    const fromXml = parseInvoicePreviewResponse(
      response(xml(`<sikeres>true</sikeres><pdf>${bytesToBase64(FAKE_PDF_BYTES)}</pdf>`)),
      ITEMS,
    )
    const fromBody = parseInvoicePreviewResponse(response(FAKE_PDF_BYTES))

    expect(fromXml).toEqual({
      pdf: FAKE_PDF_BYTES,
      netTotal: 20000,
      grossTotal: 25400,
      items: ITEMS,
    })
    expect(fromBody).toEqual({ pdf: FAKE_PDF_BYTES, netTotal: 0, grossTotal: 0, items: [] })
  })

  test('PDF nélküli előnézeti válaszra hibát dob', () => {
    const error = caught(() =>
      parseInvoicePreviewResponse(response(xml('<sikeres>true</sikeres>'))),
    )

    expect(error.category).toBe('unexpected_response')
    expect(error.message).toContain('PDF')
  })
})
