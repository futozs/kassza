import { describe, expect, test } from 'vitest'
import { FAKE_PDF_BYTES } from '../../tests/helpers'
import { encodeUtf8 } from './binary'
import { SzamlazzError } from './errors'
import {
  type AgentResponse,
  createAgentResponse,
  decodeHeaderValue,
  extractTextError,
  looksLikeXml,
  parseDoneText,
  parseResponseXml,
  readDocumentHeaders,
  readHeader,
  throwIfAnyError,
  throwIfHeaderError,
  throwIfHttpError,
  throwIfTextError,
  throwIfXmlFailure,
  unexpectedResponse,
} from './response'

function response(
  body: string | Uint8Array,
  headers: Record<string, string> = {},
  status = 200,
): AgentResponse {
  return createAgentResponse(
    'createInvoice',
    status,
    new Headers(headers),
    typeof body === 'string' ? encodeUtf8(body) : body,
  )
}

const DOCS_TEXT_ERROR = `[ERR] Számla mentés sikertelen. Már létező rendelésszám: XX. ---------- t.getMessage(): Már létező rendelésszám:
XX. ---------- [CEG:978] [MODUL:SZAMLAZZGUI] [INSTANCE:hu.kboss.szamlazz.gui.action.AcXmlSzamla] Már létező rendelésszám: XX.[LOCATION:hu.kboss.szamlazz.api.bean.SzFej.insert (SzFej.java) #1700]
hu.kboss.szamlazz.api.bean.SzFej.insert(SzFej.java:1700)
java.lang.Thread.run(Thread.java:662)`

describe('createAgentResponse', () => {
  test('felismeri a PDF törzset, és csak egyszer dekódolja a szöveget', () => {
    const pdf = response(FAKE_PDF_BYTES)
    const text = response('szöveg')

    expect(pdf.isPdf).toBe(true)
    expect(text.isPdf).toBe(false)
    expect(text.text()).toBe('szöveg')
    expect(text.text()).toBe(text.text())
  })
})

describe('fejlécek', () => {
  test('a decodeHeaderValue a + jelet szóközzé alakítja, és hibás kódolásnál az eredetit adja', () => {
    expect(decodeHeaderValue('Hib%C3%A1s+el%C5%91tag')).toBe('Hibás előtag')
    expect(decodeHeaderValue('100%')).toBe('100%')
  })

  test('a readHeader az üres fejlécet undefined-ként adja', () => {
    const headers = new Headers({ a: '  ', b: 'E-ABC%2F1' })

    expect(readHeader(headers, 'a')).toBeUndefined()
    expect(readHeader(headers, 'b')).toBe('E-ABC%2F1')
    expect(readHeader(headers, 'b', true)).toBe('E-ABC/1')
    expect(readHeader(headers, 'nincs')).toBeUndefined()
  })

  test('a readDocumentHeaders beolvassa a szlahu_* fejléceket', () => {
    const headers = new Headers({
      szlahu_szamlaszam: 'E-TST-2026-1',
      szlahu_nettovegosszeg: '30000',
      szlahu_bruttovegosszeg: '38100,5',
      szlahu_fizetesmod: '%C3%81tutal%C3%A1s',
      szlahu_vevoifiokurl: 'https%3A%2F%2Fwww.szamlazz.hu%2Fszamla%2F%3Fpage%3Dvevoifiok',
    })

    expect(readDocumentHeaders(headers)).toEqual({
      number: 'E-TST-2026-1',
      netTotal: 30000,
      grossTotal: 38100.5,
      paymentMethod: 'Átutalás',
      buyerAccountUrl: 'https://www.szamlazz.hu/szamla/?page=vevoifiok',
    })
  })

  test('a nem szám összegfejlécet figyelmen kívül hagyja', () => {
    expect(
      readDocumentHeaders(new Headers({ szlahu_nettovegosszeg: 'n/a' })).netTotal,
    ).toBeUndefined()
  })
})

describe('throwIfHeaderError', () => {
  test('a szlahu_error és szlahu_error_code alapján típusos hibát dob', () => {
    const error = captureError(() =>
      throwIfHeaderError(
        response('', {
          szlahu_error: 'M%C3%A1r+l%C3%A9tez%C5%91+rendel%C3%A9ssz%C3%A1m',
          szlahu_error_code: '152',
        }),
      ),
    )

    expect(error).toMatchObject({
      code: 152,
      category: 'duplicate',
      isDuplicate: true,
      isNotFound: false,
      retryable: false,
      action: 'createInvoice',
      httpStatus: 200,
      message: '[152] Már létező rendelésszám',
    })
  })

  test('csak kód esetén a táblázat üzenetét használja', () => {
    const error = captureError(() => throwIfHeaderError(response('', { szlahu_error_code: '7' })))

    expect(error).toMatchObject({ code: 7, category: 'not_found', isNotFound: true })
    expect(error.message).toContain('ismeretlen számlaszám')
  })

  test('hibafejléc nélkül nem dob', () => {
    expect(() => throwIfHeaderError(response('ok'))).not.toThrow()
  })
})

describe('szöveges [ERR] válasz', () => {
  test('a docs mintájából csak a lényeges üzenetet emeli ki', () => {
    expect(extractTextError(DOCS_TEXT_ERROR)).toEqual({
      code: undefined,
      message: 'Számla mentés sikertelen. Már létező rendelésszám: XX.',
    })
  })

  test('elválasztó nélküli egysoros hibát is kezel, és felismeri a számkódot', () => {
    expect(extractTextError('[ERR] 136 Bejelentkezési hiba\nstack')).toEqual({
      code: 136,
      message: 'Bejelentkezési hiba',
    })
    expect(extractTextError('minden rendben')).toBeUndefined()
  })

  test('a throwIfTextError csak [ERR]-rel kezdődő törzsre dob', () => {
    expect(captureError(() => throwIfTextError(response(`\n  ${DOCS_TEXT_ERROR}`)))).toMatchObject({
      category: 'unknown',
      message: 'Számla mentés sikertelen. Már létező rendelésszám: XX.',
    })
    expect(() => throwIfTextError(response('<x>[ERR] a megjegyzésben</x>'))).not.toThrow()
    expect(() => throwIfTextError(response(FAKE_PDF_BYTES))).not.toThrow()
  })
})

describe('parseDoneText', () => {
  test('kiolvassa a bizonylatszámot', () => {
    expect(parseDoneText('xmlagentresponse=DONE;E-TST-2026-12\n')).toEqual({
      number: 'E-TST-2026-12',
    })
    expect(parseDoneText('xmlagentresponse=DONE;STORNO%2F1')).toEqual({ number: 'STORNO/1' })
  })

  test('szám nélküli DONE-t és a nem DONE szöveget is kezeli', () => {
    expect(parseDoneText('xmlagentresponse=DONE')).toEqual({ number: undefined })
    expect(parseDoneText('valami más')).toBeUndefined()
  })
})

describe('XML válasz', () => {
  test('a looksLikeXml a BOM-os és behúzott XML-t is felismeri', () => {
    expect(
      looksLikeXml(response(`${String.fromCharCode(0xfeff)}  <?xml version="1.0"?><a/>`)),
    ).toBe(true)
    expect(looksLikeXml(response('xmlagentresponse=DONE'))).toBe(false)
    expect(looksLikeXml(response(FAKE_PDF_BYTES))).toBe(false)
  })

  test('nem XML törzsre unexpected_response hibát dob', () => {
    expect(captureError(() => parseResponseXml(response('nem xml')))).toMatchObject({
      category: 'unexpected_response',
      rawResponse: 'nem xml',
    })
  })

  test('hibás XML-re unexpected_response hibát dob az eredeti okkal', () => {
    const error = captureError(() => parseResponseXml(response('<a><b></a>')))

    expect(error.category).toBe('unexpected_response')
    expect(error.cause).toBeInstanceOf(Error)
  })

  test('a throwIfXmlFailure a docs sikertelen mintájára típusos hibát dob', () => {
    const failed = response(`<?xml version="1.0" encoding="UTF-8"?>
<xmlszamlavalasz xmlns="http://www.szamlazz.hu/xmlszamlavalasz">
<sikeres>false</sikeres>
<hibakod>3</hibakod>
<hibauzenet><![CDATA[Bejelentkezési hiba - a megadott login név és jelszó pároshoz nem létezik felhasználó]]></hibauzenet>
</xmlszamlavalasz>`)

    expect(captureError(() => throwIfXmlFailure(parseResponseXml(failed), failed))).toMatchObject({
      code: 3,
      category: 'auth',
      message:
        '[3] Bejelentkezési hiba - a megadott login név és jelszó pároshoz nem létezik felhasználó',
    })
  })

  test('sikeres és sikeres mező nélküli XML-re nem dob', () => {
    const ok = response('<v><sikeres>true</sikeres></v>')
    const neutral = response('<QueryTaxpayerResponse><result/></QueryTaxpayerResponse>')

    expect(() => throwIfXmlFailure(parseResponseXml(ok), ok)).not.toThrow()
    expect(() => throwIfXmlFailure(parseResponseXml(neutral), neutral)).not.toThrow()
  })

  test('hibakóddal érkező, sikeres mező nélküli választ hibának tekint', () => {
    const failed = response('<v><hibakod>339</hibakod></v>')

    expect(captureError(() => throwIfXmlFailure(parseResponseXml(failed), failed))).toMatchObject({
      code: 339,
      category: 'not_found',
    })
  })
})

describe('HTTP státusz', () => {
  test('5xx státuszt újrapróbálható hálózati hibaként kezel', () => {
    expect(captureError(() => throwIfHttpError(response('Bad gateway', {}, 502)))).toMatchObject({
      category: 'network',
      retryable: true,
      httpStatus: 502,
    })
  })

  test('4xx státuszt váratlan válaszként kezel', () => {
    expect(captureError(() => throwIfHttpError(response('Not found', {}, 404)))).toMatchObject({
      category: 'unexpected_response',
      retryable: false,
    })
  })

  test('a throwIfAnyError a fejléchibát előbb jelzi, mint a HTTP státuszt', () => {
    expect(
      captureError(() => throwIfAnyError(response('', { szlahu_error_code: '57' }, 500))),
    ).toMatchObject({ code: 57 })
    expect(() => throwIfAnyError(response('ok'))).not.toThrow()
  })

  test('az unexpectedResponse PDF törzsnél nem tesz nyers választ a hibába', () => {
    expect(unexpectedResponse(response(FAKE_PDF_BYTES), 'részlet')).toMatchObject({
      rawResponse: undefined,
      message: 'Váratlan válasz a Számlázz.hu-tól (HTTP 200). részlet',
    })
  })
})

function captureError(fn: () => void): SzamlazzError {
  try {
    fn()
  } catch (error) {
    if (error instanceof SzamlazzError) return error
    throw error
  }
  throw new Error('Nem dobott hibát')
}
