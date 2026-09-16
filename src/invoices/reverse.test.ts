import { describe, expect, test } from 'vitest'
import {
  createTestContext,
  FAKE_PDF_BYTES,
  invoiceXmlResponse,
  TEST_AGENT_KEY,
  textErrorResponse,
} from '../../tests/helpers'
import { canValidateXsd, validateAgainstXsd } from '../../tests/xsd'
import { bytesToBase64 } from '../core/binary'
import { el } from '../core/xml/serialize'
import type { InvoiceTemplate } from './create-types'
import { buildReverseInvoiceXml, parseReverseInvoiceResponse, reverseInvoice } from './reverse'

const CREDENTIALS = [el('szamlaagentkulcs', TEST_AGENT_KEY)]

const FULL_INPUT = {
  invoiceNumber: 'E-TST-2026-1',
  issueDate: '2026-09-16',
  fulfillmentDate: new Date('2026-09-10T10:00:00Z'),
  comment: 'Hibás vevőnév',
  template: 'SzlaMost',
  eInvoice: true,
  downloadPdf: false,
  externalId: 'storno-42',
  email: { replyTo: 'elado@example.hu', subject: 'Sztornó számla', text: 'Csatolva küldjük.' },
  buyer: { email: 'vevo@example.hu', taxNumber: '12345678-1-42', euTaxNumber: 'HU12345678' },
} as const

const SUCCESS_XML = invoiceXmlResponse(
  [
    '<sikeres>true</sikeres>',
    '<szamlaszam>E-TST-2026-2</szamlaszam>',
    '<szamlanetto>-30000</szamlanetto>',
    '<szamlabrutto>-38100</szamlabrutto>',
    '<kintlevoseg>-38100</kintlevoseg>',
    '<vevoifiokurl>https://www.szamlazz.hu/szamla/?page=vevoifiokpay&amp;partguid=abc</vevoifiokurl>',
    `<pdf>${bytesToBase64(FAKE_PDF_BYTES)}</pdf>`,
  ].join('\n'),
)

describe('buildReverseInvoiceXml', () => {
  test('a minimális inputból SS típusú, PDF-et kérő XML-t épít', () => {
    const xml = buildReverseInvoiceXml(CREDENTIALS, 'E-TST-2026-1')

    expect(xml).toContain('<szamlaszam>E-TST-2026-1</szamlaszam>')
    expect(xml).toContain('<tipus>SS</tipus>')
    expect(xml).toContain('<szamlaLetoltes>true</szamlaLetoltes>')
    expect(xml).toContain('<eszamla>false</eszamla>')
    expect(xml).toContain('<valaszVerzio>2</valaszVerzio>')
    expect(xml).not.toContain('keltDatum')
    expect(xml).not.toContain('<elado>')
    expect(xml).not.toContain('<vevo>')
  })

  test('a teljes inputot a sémának megfelelő sorrendben írja', () => {
    const xml = buildReverseInvoiceXml(CREDENTIALS, FULL_INPUT)

    expect(xml).toContain('<keltDatum>2026-09-16</keltDatum>')
    expect(xml).toContain('<teljesitesDatum>2026-09-10</teljesitesDatum>')
    expect(xml).toContain('<szamlaSablon>SzlaMost</szamlaSablon>')
    expect(xml).toContain('<szamlaKulsoAzon>storno-42</szamlaKulsoAzon>')
    expect(xml).toContain('<adoszamEU>HU12345678</adoszamEU>')
    expect(xml.indexOf('<megjegyzes>')).toBeLessThan(xml.indexOf('<tipus>'))
  })

  test('üres számlaszámra validációs hibát dob', () => {
    expect(() => buildReverseInvoiceXml(CREDENTIALS, '  ')).toThrow(
      expect.objectContaining({ category: 'validation' }),
    )
  })

  test('ismeretlen sablonra és hibás dátumra validációs hibát dob', () => {
    expect(() =>
      buildReverseInvoiceXml(CREDENTIALS, {
        invoiceNumber: 'X-1',
        template: 'Rossz' as InvoiceTemplate,
      }),
    ).toThrow(/számlasablon/)
    expect(() =>
      buildReverseInvoiceXml(CREDENTIALS, { invoiceNumber: 'X-1', issueDate: '2026-02-30' }),
    ).toThrow(expect.objectContaining({ category: 'validation' }))
  })
})

describe.skipIf(!canValidateXsd('agentst/xmlszamlast.xsd'))('sztornó XSD szerződés', () => {
  test('a minimális kérés megfelel az XSD-nek', () => {
    const xml = buildReverseInvoiceXml(CREDENTIALS, 'E-TST-2026-1')
    expect(validateAgainstXsd(xml, 'agentst/xmlszamlast.xsd')).toEqual([])
  })

  test('a teljes kérés megfelel az XSD-nek', () => {
    const xml = buildReverseInvoiceXml(CREDENTIALS, FULL_INPUT)
    expect(validateAgainstXsd(xml, 'agentst/xmlszamlast.xsd')).toEqual([])
  })

  test('felhasználónév és jelszó hitelesítéssel is megfelel az XSD-nek', () => {
    const xml = buildReverseInvoiceXml([el('felhasznalo', 'u'), el('jelszo', 'p')], 'X-1')
    expect(validateAgainstXsd(xml, 'agentst/xmlszamlast.xsd')).toEqual([])
  })
})

describe('reverseInvoice', () => {
  test('XML válaszból kiolvassa a sztornó számla adatait és a PDF-et', async () => {
    const { ctx, agent } = createTestContext(SUCCESS_XML)

    const result = await reverseInvoice(ctx, 'E-TST-2026-1')

    expect(agent.lastCall().field).toBe('action-szamla_agent_st')
    expect(result).toEqual({
      number: 'E-TST-2026-2',
      netTotal: -30000,
      grossTotal: -38100,
      outstanding: -38100,
      buyerAccountUrl: 'https://www.szamlazz.hu/szamla/?page=vevoifiokpay&partguid=abc',
      pdf: FAKE_PDF_BYTES,
    })
  })

  test('nyers PDF törzs esetén a számlaszámot és az összegeket a fejlécből veszi', async () => {
    const { ctx } = createTestContext({
      headers: {
        szlahu_szamlaszam: encodeURIComponent('STORNO 2026/1'),
        szlahu_nettovegosszeg: '-1000',
        szlahu_bruttovegosszeg: '-1270',
        szlahu_kintlevoseg: '-1270',
      },
      body: FAKE_PDF_BYTES,
    })

    const result = await reverseInvoice(ctx, 'E-1')

    expect(result).toEqual({
      number: 'STORNO 2026/1',
      netTotal: -1000,
      grossTotal: -1270,
      outstanding: -1270,
      buyerAccountUrl: undefined,
      pdf: FAKE_PDF_BYTES,
    })
  })

  test('a DONE szöveges választ is kezeli', async () => {
    const { ctx } = createTestContext({ body: 'xmlagentresponse=DONE;STORNO-2026-7\n' })

    await expect(reverseInvoice(ctx, 'E-1')).resolves.toMatchObject({ number: 'STORNO-2026-7' })
  })

  test('DONE számlaszám nélkül a fejlécből veszi a számot', async () => {
    const { ctx } = createTestContext({
      headers: { szlahu_szamlaszam: 'STORNO-2026-8' },
      body: 'xmlagentresponse=DONE',
    })

    await expect(reverseInvoice(ctx, 'E-1')).resolves.toMatchObject({ number: 'STORNO-2026-8' })
  })

  test('ismeretlen törzs mellett a fejléc számlaszámát elfogadja', async () => {
    const { ctx } = createTestContext({ headers: { szlahu_szamlaszam: 'S-9' }, body: 'ok' })

    await expect(reverseInvoice(ctx, 'E-1')).resolves.toMatchObject({ number: 'S-9' })
  })

  test('az [ERR] szöveges hibát típusos hibává alakítja', async () => {
    const { ctx } = createTestContext({
      body: '[ERR] Sikertelen bejelentkezés ---------- t.getMessage(): x',
    })

    await expect(reverseInvoice(ctx, 'E-1')).rejects.toMatchObject({
      name: 'SzamlazzError',
      message: 'Sikertelen bejelentkezés',
    })
  })

  test('a fejlécben jelzett hibát típusos hibává alakítja', async () => {
    const { ctx } = createTestContext(textErrorResponse('Sikertelen bejelentkezés', 3))

    await expect(reverseInvoice(ctx, 'E-1')).rejects.toMatchObject({ code: 3, category: 'auth' })
  })

  test('az XML sikertelen választ típusos hibává alakítja', async () => {
    const { ctx } = createTestContext(
      invoiceXmlResponse(
        '<sikeres>false</sikeres><hibakod>7</hibakod><hibauzenet><![CDATA[Nincs ilyen számla]]></hibauzenet>',
      ),
    )

    await expect(reverseInvoice(ctx, 'E-1')).rejects.toMatchObject({
      code: 7,
      category: 'not_found',
    })
  })

  test('nem küldi újra hálózati hiba után', async () => {
    const { ctx, agent } = createTestContext(new TypeError('fetch failed'))

    await expect(reverseInvoice(ctx, 'E-1')).rejects.toMatchObject({ category: 'network' })
    expect(agent.calls).toHaveLength(1)
  })

  test('ha a válasz az eredeti bizonylatot adja vissza, hibát dob', async () => {
    const { ctx } = createTestContext(
      invoiceXmlResponse('<sikeres>true</sikeres><szamlaszam>D-2026-1</szamlaszam>'),
    )

    await expect(reverseInvoice(ctx, { invoiceNumber: 'D-2026-1' })).rejects.toMatchObject({
      category: 'validation',
      hint: expect.stringContaining('deleteProforma'),
    })
  })

  test('számlaszám nélküli sikeres válaszra unexpected_response hibát ad', async () => {
    const { ctx } = createTestContext(invoiceXmlResponse('<sikeres>true</sikeres>'))

    await expect(reverseInvoice(ctx, 'E-1')).rejects.toMatchObject({
      category: 'unexpected_response',
    })
  })

  test('értelmezhetetlen válaszra unexpected_response hibát ad', async () => {
    const { ctx } = createTestContext({ body: 'valami egészen más' })

    await expect(reverseInvoice(ctx, 'E-1')).rejects.toMatchObject({
      category: 'unexpected_response',
    })
  })

  test('HTTP 500 esetén network kategóriájú hibát ad', async () => {
    const { ctx } = createTestContext({ status: 500, body: 'Internal error' })

    await expect(reverseInvoice(ctx, 'E-1')).rejects.toMatchObject({ category: 'network' })
  })

  test('validációs hibánál nem küld kérést', async () => {
    const { ctx, agent } = createTestContext(SUCCESS_XML)

    await expect(reverseInvoice(ctx, '')).rejects.toMatchObject({ category: 'validation' })
    expect(agent.calls).toHaveLength(0)
  })
})

describe('parseReverseInvoiceResponse', () => {
  test('eredeti számlaszám nélkül is feldolgozza a választ', async () => {
    const { ctx } = createTestContext(SUCCESS_XML)

    const result = await ctx.execute(
      { action: 'reverseInvoice', xml: '<x/>' },
      parseReverseInvoiceResponse,
    )

    expect(result.number).toBe('E-TST-2026-2')
  })
})
