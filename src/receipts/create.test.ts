import { describe, expect, test } from 'vitest'
import { createTestContext, FAKE_PDF_BYTES, TEST_AGENT_KEY } from '../../tests/helpers'
import { canValidateXsd, validateAgainstXsd } from '../../tests/xsd'
import { el } from '../core/xml/serialize'
import { buildCreateReceiptXml, calculateReceiptItems, createReceipt } from './create'
import { RECEIPT_WITH_PDF_RESPONSE, receiptErrorResponse } from './test-fixtures'
import type { CreateReceiptInput, ReceiptDefaults } from './types'

const CREDENTIALS = [el('szamlaagentkulcs', TEST_AGENT_KEY)]
const SCHEMA = 'nyugtacreate/xmlnyugtacreate.xsd'

const MINIMAL_INPUT: CreateReceiptInput = {
  prefix: 'NYGT',
  paymentMethod: 'készpénz',
  items: [{ name: 'Nevezési díj', grossUnitPrice: 1000, vat: 27 }],
}

const FULL_INPUT: CreateReceiptInput = {
  prefix: 'WEB2026',
  paymentMethod: 'bankkártya',
  currency: 'EUR',
  exchangeRate: 395.12,
  exchangeBank: 'MNB',
  callId: 'order-42-receipt',
  comment: 'Köszönjük a vásárlást! <3 & viszlát',
  template: 'N',
  customerLedgerId: '311',
  orderNumber: 'ORD-2026-001',
  downloadPdf: false,
  items: [
    {
      name: 'Cicás lábtörlő',
      identifier: 'CICA-1',
      quantity: 2,
      unit: 'darab',
      netUnitPrice: 10,
      vat: 27,
      comment: 'Piros',
      ledger: { revenue: '911', vat: '467' },
    },
    { name: 'Kutyás lábtörlő', quantity: 1, grossUnitPrice: 5.5, vat: 'ÁKK' },
  ],
  payments: [
    { method: 'SZÉP kártya', amount: 20, description: 'OTP SZÉP kártya' },
    { method: 'bankkártya', amount: 10.9 },
  ],
}

function build(input: CreateReceiptInput, defaults: ReceiptDefaults = {}): string {
  return buildCreateReceiptXml(CREDENTIALS, defaults, input)
}

function buildError(input: CreateReceiptInput, defaults: ReceiptDefaults = {}): unknown {
  try {
    build(input, defaults)
  } catch (error) {
    return error
  }
  throw new Error('Validációs hibát vártunk')
}

describe.skipIf(!canValidateXsd(SCHEMA))('buildCreateReceiptXml XSD szerződés', () => {
  test('a minimális kérés megfelel az XSD-nek', () => {
    expect(validateAgainstXsd(build(MINIMAL_INPUT), SCHEMA)).toEqual([])
  })

  test('a teljes kérés megfelel az XSD-nek', () => {
    expect(validateAgainstXsd(build(FULL_INPUT), SCHEMA)).toEqual([])
  })

  test('a torloKod a docs XSD-jében szerepel, a letölthető XSD-ben még nem', () => {
    const xml = build({
      ...MINIMAL_INPUT,
      items: [{ name: 'Tétel', grossUnitPrice: 1000, vat: 27, dataDeletionCode: 123 }],
    })

    expect(validateAgainstXsd(xml, SCHEMA).join('\n')).toContain('torloKod')
  })
})

describe('buildCreateReceiptXml', () => {
  test('a minimális kérés alapértékekkel épül fel', () => {
    const xml = build(MINIMAL_INPUT)

    expect(xml).toContain(
      '<xmlnyugtacreate xmlns="http://www.szamlazz.hu/xmlnyugtacreate" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.szamlazz.hu/xmlnyugtacreate https://www.szamlazz.hu/szamla/docs/xsds/nyugtacreate/xmlnyugtacreate.xsd">',
    )
    expect(xml).toContain(
      `  <beallitasok>\n    <szamlaagentkulcs>${TEST_AGENT_KEY}</szamlaagentkulcs>\n    <pdfLetoltes>true</pdfLetoltes>\n  </beallitasok>`,
    )
    expect(xml).toContain(
      '  <fejlec>\n    <elotag>NYGT</elotag>\n    <fizmod>készpénz</fizmod>\n    <penznem>HUF</penznem>\n  </fejlec>',
    )
    expect(xml).not.toContain('hivasAzonosito')
    expect(xml).not.toContain('kifizetesek')
  })

  test('a docs kerekítési példáját (1000 Ft bruttó, 27%) szó szerint 787.40 / 212.60 / 1000 alakban küldi', () => {
    const xml = build(MINIMAL_INPUT)

    expect(xml).toContain(
      [
        '    <tetel>',
        '      <megnevezes>Nevezési díj</megnevezes>',
        '      <mennyiseg>1</mennyiseg>',
        '      <mennyisegiEgyseg>db</mennyisegiEgyseg>',
        '      <nettoEgysegar>787.4</nettoEgysegar>',
        '      <afakulcs>27</afakulcs>',
        '      <netto>787.40</netto>',
        '      <afa>212.60</afa>',
        '      <brutto>1000</brutto>',
        '    </tetel>',
      ].join('\n'),
    )
  })

  test('a teljes kérés minden mezőt a docs szerinti helyen és sorrendben tartalmaz', () => {
    const xml = build(FULL_INPUT)

    expect(xml).toContain('<pdfLetoltes>false</pdfLetoltes>')
    expect(xml).toContain(
      [
        '  <fejlec>',
        '    <hivasAzonosito>order-42-receipt</hivasAzonosito>',
        '    <elotag>WEB2026</elotag>',
        '    <fizmod>bankkártya</fizmod>',
        '    <penznem>EUR</penznem>',
        '    <devizaarf>395.12</devizaarf>',
        '    <devizabank>MNB</devizabank>',
        '    <megjegyzes>Köszönjük a vásárlást! &lt;3 &amp; viszlát</megjegyzes>',
        '    <pdfSablon>N</pdfSablon>',
        '    <fokonyvVevo>311</fokonyvVevo>',
        '    <rendelesSzam>ORD-2026-001</rendelesSzam>',
        '  </fejlec>',
      ].join('\n'),
    )
    expect(xml).toContain(
      [
        '      <megnevezes>Cicás lábtörlő</megnevezes>',
        '      <azonosito>CICA-1</azonosito>',
        '      <mennyiseg>2</mennyiseg>',
        '      <mennyisegiEgyseg>darab</mennyisegiEgyseg>',
        '      <nettoEgysegar>10</nettoEgysegar>',
        '      <afakulcs>27</afakulcs>',
        '      <netto>20</netto>',
        '      <afa>5.4</afa>',
        '      <brutto>25.4</brutto>',
        '      <fokonyv>',
        '        <arbevetel>911</arbevetel>',
        '        <afa>467</afa>',
        '      </fokonyv>',
        '      <megjegyzes>Piros</megjegyzes>',
      ].join('\n'),
    )
    expect(xml).toContain('<afakulcs>ÁKK</afakulcs>')
    expect(xml).toContain(
      [
        '  <kifizetesek>',
        '    <kifizetes>',
        '      <fizetoeszkoz>SZÉP kártya</fizetoeszkoz>',
        '      <osszeg>20</osszeg>',
        '      <leiras>OTP SZÉP kártya</leiras>',
        '    </kifizetes>',
        '    <kifizetes>',
        '      <fizetoeszkoz>bankkártya</fizetoeszkoz>',
        '      <osszeg>10.9</osszeg>',
        '    </kifizetes>',
        '  </kifizetesek>',
      ].join('\n'),
    )
  })

  test('az adattörlő kódot a tétel végén torloKod elemben küldi', () => {
    const xml = build({
      ...MINIMAL_INPUT,
      items: [{ name: 'Tétel', grossUnitPrice: 1000, vat: 27, dataDeletionCode: 123 }],
    })

    expect(xml).toContain(
      '      <brutto>1000</brutto>\n      <torloKod>123</torloKod>\n    </tetel>',
    )
  })

  test('az üres főkönyvi adatokat kihagyja', () => {
    const xml = build({
      ...MINIMAL_INPUT,
      items: [{ name: 'Tétel', grossUnitPrice: 1000, vat: 27, ledger: { revenue: ' ' } }],
    })

    expect(xml).not.toContain('fokonyv')
  })

  test('a hiányzó mezőket az alapbeállításokból veszi, a hívás felülírja őket', () => {
    const defaults: ReceiptDefaults = {
      prefix: 'ALAP',
      paymentMethod: 'bankkártya',
      currency: 'Ft',
      downloadPdf: false,
      template: 'J',
      unit: 'alkalom',
      customerLedgerId: '311',
    }

    const fromDefaults = build({ items: MINIMAL_INPUT.items }, defaults)
    const overridden = build({ ...MINIMAL_INPUT, template: 'A', downloadPdf: true }, defaults)

    expect(fromDefaults).toContain('<elotag>ALAP</elotag>')
    expect(fromDefaults).toContain('<fizmod>bankkártya</fizmod>')
    expect(fromDefaults).toContain('<penznem>Ft</penznem>')
    expect(fromDefaults).toContain('<pdfLetoltes>false</pdfLetoltes>')
    expect(fromDefaults).toContain('<pdfSablon>J</pdfSablon>')
    expect(fromDefaults).toContain('<mennyisegiEgyseg>alkalom</mennyisegiEgyseg>')
    expect(fromDefaults).toContain('<fokonyvVevo>311</fokonyvVevo>')
    expect(overridden).toContain('<elotag>NYGT</elotag>')
    expect(overridden).toContain('<fizmod>készpénz</fizmod>')
    expect(overridden).toContain('<pdfSablon>A</pdfSablon>')
    expect(overridden).toContain('<pdfLetoltes>true</pdfLetoltes>')
  })

  test('forintos nyugtán nem küld árfolyamot és bankot', () => {
    const xml = build({ ...MINIMAL_INPUT, exchangeRate: 400, exchangeBank: 'MNB' })

    expect(xml).not.toContain('devizaarf')
    expect(xml).not.toContain('devizabank')
  })

  test.each([
    [{ ...MINIMAL_INPUT, prefix: undefined }, /előtagját/],
    [{ ...MINIMAL_INPUT, prefix: 'nygt' }, /nagybetűt és számot/],
    [{ ...MINIMAL_INPUT, prefix: 'NY-GT' }, /nagybetűt és számot/],
    [{ ...MINIMAL_INPUT, paymentMethod: ' ' }, /fizetési módot/],
    [{ ...MINIMAL_INPUT, items: [] }, /legalább egy tétel/],
    [{ ...MINIMAL_INPUT, items: undefined as never }, /legalább egy tétel/],
    [{ ...MINIMAL_INPUT, items: [{ name: '', grossUnitPrice: 1, vat: 27 }] }, /megnevezése/],
    [{ ...MINIMAL_INPUT, currency: 'EUR' }, /árfolyamot \(exchangeRate\)/],
    [{ ...MINIMAL_INPUT, currency: 'EUR', exchangeRate: 0 }, /árfolyamot \(exchangeRate\)/],
    [{ ...MINIMAL_INPUT, currency: 'EUR', exchangeRate: 400 }, /exchangeBank/],
    [{ ...MINIMAL_INPUT, template: 'X' as never }, /PDF sablon/],
    [
      {
        ...MINIMAL_INPUT,
        items: [{ name: 'T', grossUnitPrice: 1, vat: 27, dataDeletionCode: -1 }],
      },
      /dataDeletionCode/,
    ],
    [
      {
        ...MINIMAL_INPUT,
        items: [{ name: 'T', grossUnitPrice: 1, vat: 27, dataDeletionCode: 1.5 }],
      },
      /dataDeletionCode/,
    ],
    [{ ...MINIMAL_INPUT, payments: [{ method: 'készpénz', amount: 999 }] }, /eltér.*\(340\)/],
    [{ ...MINIMAL_INPUT, payments: [{ method: '', amount: 1000 }] }, /fizetési eszköze/],
    [{ ...MINIMAL_INPUT, payments: [{ method: 'kp', amount: Number.NaN }] }, /nem érvényes szám/],
    [{ ...MINIMAL_INPUT, items: [{ name: 'Ár nélkül', vat: 27 }] }, /1\. tétel \(Ár nélkül\)/],
    [{ ...MINIMAL_INPUT, items: [{ name: 'T', grossUnitPrice: 1, vat: 99 }] }, /áfakulcs/],
  ])('kliensoldali validációs hibát dob: %#', (input, message) => {
    const error = buildError(input as CreateReceiptInput)

    expect(error).toMatchObject({ name: 'SzamlazzError', category: 'validation' })
    expect((error as Error).message).toMatch(message)
  })

  test.each([
    [{ netAmount: 787.4, vatAmount: 212.6, grossAmount: 1000.5 }, /egész számnak.*\(363\)/],
    [{ netAmount: 787.401, vatAmount: 212.599, grossAmount: 1000 }, /nettó.*\(364\)/],
    [{ netAmount: 787.4, vatAmount: 212.601, grossAmount: 1000 }, /áfa.*\(365\)/],
    [{ netAmount: 787.4, vatAmount: 212.5, grossAmount: 1000 }, /pontosan.*\(261\)/],
    [
      { netUnitPrice: 700, netAmount: 787.4, vatAmount: 212.6, grossAmount: 1000 },
      /egységár.*\(259\)/,
    ],
    [{ netAmount: 800, vatAmount: 200, grossAmount: 1000 }, /áfakulcs.*\(260\)/],
  ])('forintos nyugtán az explicit összegek szabálysértését jelzi: %#', (amounts, message) => {
    const error = buildError({
      ...MINIMAL_INPUT,
      items: [{ name: 'Explicit', vat: 27, ...amounts }],
    })

    expect(error).toMatchObject({ category: 'validation' })
    expect((error as Error).message).toMatch(message)
  })

  test('a helyes explicit összegeket változatlanul elküldi', () => {
    const xml = build({
      ...MINIMAL_INPUT,
      items: [{ name: 'Explicit', vat: 27, netAmount: 787.4, vatAmount: 212.6, grossAmount: 1000 }],
    })

    expect(xml).toContain('<netto>787.40</netto>')
    expect(xml).toContain('<afa>212.60</afa>')
    expect(xml).toContain('<brutto>1000</brutto>')
  })
})

describe('calculateReceiptItems', () => {
  test('a csak nyugtán használt áfakódokat 0%-kal számolja', () => {
    const [item] = calculateReceiptItems(
      [{ name: 'Mentes', grossUnitPrice: 5000, vat: 'MAA' }],
      'HUF',
    )

    expect(item?.vat).toBe('MAA')
    expect(item?.amounts).toMatchObject({ netAmount: 5000, vatAmount: 0, grossAmount: 5000 })
  })

  test('devizás nyugtán nem alkalmazza a forintos kerekítési szabályokat', () => {
    const [item] = calculateReceiptItems(
      [{ name: 'Deviza', vat: 27, netAmount: 10.123, vatAmount: 2.733, grossAmount: 12.856 }],
      'EUR',
    )

    expect(item?.amounts.grossAmount).toBe(12.856)
  })
})

describe('createReceipt', () => {
  test('a create mezőben küldi a kérést és a nyugtát PDF-fel adja vissza', async () => {
    const { ctx, agent } = createTestContext(RECEIPT_WITH_PDF_RESPONSE)

    const receipt = await createReceipt(ctx, {}, MINIMAL_INPUT)

    expect(agent.lastCall().field).toBe('action-szamla_agent_nyugta_create')
    expect(agent.lastCall().xml).toBe(buildCreateReceiptXml(ctx.credentials, {}, MINIMAL_INPUT))
    expect(receipt.number).toBe('NYGT-2017-123')
    expect(receipt.pdf).toEqual(FAKE_PDF_BYTES)
  })

  test('validációs hibánál nem küld kérést', async () => {
    const { ctx, agent } = createTestContext(RECEIPT_WITH_PDF_RESPONSE)

    await expect(createReceipt(ctx, {}, { ...MINIMAL_INPUT, prefix: 'rossz' })).rejects.toThrow(
      /nagybetűt/,
    )
    expect(agent.calls).toHaveLength(0)
  })

  test('hívásazonosító nélkül hálózati hiba után sem küldi újra', async () => {
    const { ctx, agent } = createTestContext(new TypeError('fetch failed'), { maxAttempts: 3 })

    await expect(createReceipt(ctx, {}, MINIMAL_INPUT)).rejects.toMatchObject({
      category: 'network',
    })
    expect(agent.calls).toHaveLength(1)
  })

  test('hívásazonosítóval hálózati hiba után biztonságosan újrapróbálja', async () => {
    const { ctx, agent } = createTestContext(
      [new TypeError('fetch failed'), RECEIPT_WITH_PDF_RESPONSE],
      { maxAttempts: 3 },
    )

    const receipt = await createReceipt(ctx, {}, { ...MINIMAL_INPUT, callId: 'order-42' })

    expect(receipt.number).toBe('NYGT-2017-123')
    expect(agent.calls).toHaveLength(2)
    expect(agent.calls[0]?.xml).toBe(agent.calls[1]?.xml)
  })

  test('a 338-as duplikált hívásazonosítót isDuplicate hibaként, beszédes tippel dobja', async () => {
    const { ctx } = createTestContext(receiptErrorResponse(338, 'Hívásazonosító már létezik'))

    const error = await createReceipt(ctx, {}, { ...MINIMAL_INPUT, callId: 'order-42' }).catch(
      (caught: unknown) => caught,
    )

    expect(error).toMatchObject({
      name: 'SzamlazzError',
      code: 338,
      category: 'duplicate',
      isDuplicate: true,
      retryable: false,
      action: 'createReceipt',
      message: '[338] Hívásazonosító már létezik',
    })
    expect((error as { hint: string }).hint).toContain('order-42')
    expect((error as { hint: string }).hint).toContain('Számlázz.hu felületén')
    expect((error as Error).cause).toMatchObject({ code: 338 })
  })

  test('338-as hibánál rendelésszám megadásakor a getReceipt lekérdezést javasolja', async () => {
    const { ctx } = createTestContext(receiptErrorResponse(338, 'Hívásazonosító már létezik'))

    const error = await createReceipt(
      ctx,
      {},
      { ...MINIMAL_INPUT, callId: 'order-42', orderNumber: 'ORD-42' },
    ).catch((caught: unknown) => caught)

    expect((error as { hint: string }).hint).toContain("getReceipt({ orderNumber: 'ORD-42' })")
  })

  test('más üzleti hibát változatlanul továbbad', async () => {
    const { ctx } = createTestContext(receiptErrorResponse(336, 'Az előtag számlához foglalt'))

    await expect(createReceipt(ctx, {}, MINIMAL_INPUT)).rejects.toMatchObject({
      code: 336,
      category: 'validation',
    })
  })

  test('a felhasználói AbortSignal-t továbbadja', async () => {
    const { ctx, agent } = createTestContext(RECEIPT_WITH_PDF_RESPONSE)
    const controller = new AbortController()
    controller.abort(new Error('megszakítva'))

    await expect(
      createReceipt(ctx, {}, MINIMAL_INPUT, { signal: controller.signal }),
    ).rejects.toThrow('megszakítva')
    expect(agent.calls).toHaveLength(0)
  })
})
