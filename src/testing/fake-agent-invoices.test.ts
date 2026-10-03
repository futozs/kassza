import { describe, expect, test } from 'vitest'
import { FAKE_CREDENTIALS, FAKE_NOW, fakeKassza, rawAgentRequest } from '../../tests/fake-agent'
import { canValidateXsd, validateAgainstXsd } from '../../tests/xsd'
import { isPdf } from '../core/binary'
import { buildCreateInvoiceXml } from '../invoices/create'
import type { InvoiceBuyer, InvoiceItemInput } from '../invoices/create-types'
import { buildGetInvoiceXml } from '../invoices/get'
import { buildInvoicePdfXml } from '../invoices/pdf'

const BUYER: InvoiceBuyer = {
  name: 'Vevő Kft.',
  zip: '1111',
  city: 'Budapest',
  address: 'Fő utca 1.',
  email: 'vevo@pelda.hu',
  taxNumber: '12345678-2-42',
}

const ITEM: InvoiceItemInput = {
  name: 'Tanácsadás',
  quantity: 2,
  unit: 'óra',
  netUnitPrice: 10_000,
  vat: 27,
}

const ITEMS: readonly InvoiceItemInput[] = [ITEM]

const DAY_MS = 86_400_000

describe('createFakeAgentFetch: számlák', () => {
  test('számla kiállítása, befizetése, lekérése és sztornója a valódi klienssel', async () => {
    const { agent, kassza } = fakeKassza()

    const created = await kassza.invoices.create({
      orderNumber: 'WEB-1',
      externalId: 'WEB-1',
      buyer: BUYER,
      items: ITEMS,
    })
    const payment = await kassza.invoices.registerPayment({
      invoiceNumber: created.number,
      amount: 25_400,
      date: '2026-10-02',
    })
    const details = await kassza.invoices.get({ externalId: 'WEB-1' })
    const reversal = await kassza.invoices.reverse({
      invoiceNumber: created.number,
      externalId: 'WEB-1/SS',
    })
    const reversed = await kassza.invoices.get({ externalId: 'WEB-1/SS' })
    const original = await kassza.invoices.get(created.number)

    expect(created).toMatchObject({
      number: 'KASSZA-2026-1',
      netTotal: 20_000,
      grossTotal: 25_400,
      outstanding: 25_400,
    })
    expect(created.pdf && isPdf(created.pdf)).toBe(true)
    expect(payment).toMatchObject({ invoiceNumber: 'KASSZA-2026-1', outstanding: 0 })
    expect(details.header).toMatchObject({
      number: 'KASSZA-2026-1',
      type: 'invoice',
      orderNumber: 'WEB-1',
      eInvoice: false,
      test: true,
      reversed: false,
    })
    expect(details.buyer).toMatchObject({ name: 'Vevő Kft.', taxNumber: '12345678-2-42' })
    expect(details.items).toMatchObject([
      { name: 'Tanácsadás', quantity: 2, unit: 'óra', netAmount: 20_000, grossAmount: 25_400 },
    ])
    expect(details.payments).toMatchObject([
      { date: '2026-10-02', method: 'átutalás', amount: 25_400 },
    ])
    expect(reversal).toMatchObject({
      number: 'KASSZA-2026-2',
      netTotal: -20_000,
      grossTotal: -25_400,
    })
    expect(reversed.header).toMatchObject({
      type: 'reversal',
      typeCode: 'SS',
      referencedInvoiceNumber: 'KASSZA-2026-1',
      orderNumber: 'WEB-1',
    })
    expect(reversed.items).toMatchObject([{ quantity: -2, netAmount: -20_000 }])
    expect(reversed.totals).toMatchObject({ grossAmount: -25_400 })
    expect(original.header.reversed).toBe(true)
    expect(agent.invoices.get('KASSZA-2026-1')).toMatchObject({ reversed: true })
    expect(agent.requests.map((request) => request.action)).toEqual([
      'createInvoice',
      'registerPayment',
      'getInvoiceXml',
      'reverseInvoice',
      'getInvoiceXml',
      'getInvoiceXml',
    ])
  })

  test('díjbekérő, e-számla és szállítólevél külön számsorozatot kap', async () => {
    const { kassza } = fakeKassza()

    const proforma = await kassza.invoices.create({
      type: 'proforma',
      orderNumber: 'WEB-2',
      buyer: BUYER,
      items: ITEMS,
    })
    const invoice = await kassza.invoices.create({
      eInvoice: true,
      paid: true,
      orderNumber: 'WEB-2',
      proformaNumber: proforma.number,
      buyer: BUYER,
      items: ITEMS,
    })
    const deliveryNote = await kassza.invoices.create({
      type: 'deliveryNote',
      buyer: BUYER,
      items: ITEMS,
    })
    const details = await kassza.invoices.get(invoice.number)

    expect([proforma.number, invoice.number, deliveryNote.number]).toEqual([
      'D-KASSZA-2026-1',
      'E-KASSZA-2026-1',
      'SZL-KASSZA-2026-1',
    ])
    expect(invoice.outstanding).toBe(0)
    expect(details.header).toMatchObject({
      type: 'invoice',
      eInvoice: true,
      referencedProformaNumber: 'D-KASSZA-2026-1',
    })
    expect(details.payments).toMatchObject([{ amount: 25_400 }])
  })

  test('díjbekérő sztornójára az eredeti számot adja vissza, amit a kliens elutasít', async () => {
    const { agent, kassza } = fakeKassza()
    const proforma = await kassza.invoices.create({ type: 'proforma', buyer: BUYER, items: ITEMS })

    await expect(kassza.invoices.reverse(proforma.number)).rejects.toMatchObject({
      category: 'validation',
    })
    expect(agent.invoices.size).toBe(1)
  })

  test('díjbekérő törlése után a díjbekérő nem kérdezhető le, újabb törlése 335', async () => {
    const { kassza } = fakeKassza()
    const proforma = await kassza.invoices.create({
      type: 'proforma',
      orderNumber: 'WEB-3',
      buyer: BUYER,
      items: ITEMS,
    })

    await kassza.invoices.deleteProforma({ orderNumber: 'WEB-3' })

    expect(await kassza.invoices.find(proforma.number)).toBeNull()
    await expect(kassza.invoices.deleteProforma(proforma.number)).rejects.toMatchObject({
      code: 335,
      category: 'not_found',
    })
  })

  test('számlát nem töröl díjbekérőként', async () => {
    const { kassza } = fakeKassza()
    const invoice = await kassza.invoices.create({ buyer: BUYER, items: ITEMS })

    await expect(kassza.invoices.deleteProforma(invoice.number)).rejects.toMatchObject({
      code: 335,
    })
    expect(await kassza.invoices.find(invoice.number)).not.toBeNull()
  })

  test('az előnézet PDF-et és összegeket ad, de nem hoz létre bizonylatot', async () => {
    const { agent, kassza } = fakeKassza()

    const preview = await kassza.invoices.preview({ buyer: BUYER, items: ITEMS })

    expect(preview).toMatchObject({ netTotal: 20_000, grossTotal: 25_400 })
    expect(isPdf(preview.pdf)).toBe(true)
    expect(agent.invoices.size).toBe(0)
  })

  test('PDF lekérése rendelésszám alapján, a legutóbbi egyező bizonylatot adja', async () => {
    const { kassza } = fakeKassza()
    await kassza.invoices.create({ orderNumber: 'WEB-4', buyer: BUYER, items: ITEMS })
    const second = await kassza.invoices.create({
      orderNumber: 'WEB-4',
      buyer: BUYER,
      items: ITEMS,
    })

    const pdf = await kassza.invoices.getPdf({ orderNumber: 'WEB-4' })

    expect(pdf).toMatchObject({ number: second.number, grossTotal: 25_400 })
    expect(isPdf(pdf.pdf)).toBe(true)
  })

  test('ismeretlen számlára 7-es hibakódot ad, a find null-t', async () => {
    const { kassza } = fakeKassza()

    await expect(kassza.invoices.get('NINCS-2026-1')).rejects.toMatchObject({
      code: 7,
      category: 'not_found',
    })
    expect(await kassza.invoices.find({ orderNumber: 'NINCS' })).toBeNull()
    await expect(kassza.invoices.getPdf({ externalId: 'NINCS' })).rejects.toMatchObject({
      code: 7,
    })
    await expect(kassza.invoices.reverse('NINCS-2026-1')).rejects.toMatchObject({ code: 7 })
    await expect(
      kassza.invoices.registerPayment({ invoiceNumber: 'NINCS-2026-1', amount: 1 }),
    ).rejects.toMatchObject({ code: 7 })
  })

  test('sztornó számla és már sztornózott számla újbóli sztornója hibát ad', async () => {
    const { agent, kassza } = fakeKassza()
    const invoice = await kassza.invoices.create({ buyer: BUYER, items: ITEMS })
    const reversal = await kassza.invoices.reverse(invoice.number)

    await expect(kassza.invoices.reverse(invoice.number)).rejects.toMatchObject({
      message: expect.stringContaining('már sztornózták'),
    })
    await expect(kassza.invoices.reverse(reversal.number)).rejects.toMatchObject({
      message: expect.stringContaining('nem sztornózható'),
    })
    expect(agent.invoices.size).toBe(2)
  })

  test('nem regisztrált számlaelőtagra 202-t ad, alapértelmezésnek az első előtagot használja', async () => {
    const { kassza } = fakeKassza({ invoicePrefixes: ['WEB', 'BOLT'] })

    await expect(
      kassza.invoices.create({ prefix: 'MAS', buyer: BUYER, items: ITEMS }),
    ).rejects.toMatchObject({ code: 202, category: 'validation' })
    const withoutPrefix = await kassza.invoices.create({ buyer: BUYER, items: ITEMS })
    const shop = await kassza.invoices.create({ prefix: 'BOLT', buyer: BUYER, items: ITEMS })

    expect(withoutPrefix.number).toBe('WEB-2026-1')
    expect(shop.number).toBe('BOLT-2026-1')
  })

  test('rendelésszám-tiltásnál az azonos kérés a meglévő számlát adja, az eltérő 152-t', async () => {
    const { agent, kassza } = fakeKassza({ rejectDuplicateOrderNumbers: true })
    const first = await kassza.invoices.create({ orderNumber: 'WEB-5', buyer: BUYER, items: ITEMS })
    const replay = await kassza.invoices.create({
      orderNumber: 'WEB-5',
      buyer: BUYER,
      items: ITEMS,
    })
    const changed = { orderNumber: 'WEB-5', buyer: BUYER, items: [{ ...ITEM, quantity: 3 }] }

    await expect(kassza.invoices.create(changed)).rejects.toMatchObject({
      code: 152,
      category: 'duplicate',
      message: expect.stringContaining('WEB-5'),
    })
    const proforma = await kassza.invoices.create({
      type: 'proforma',
      orderNumber: 'WEB-5',
      buyer: BUYER,
      items: ITEMS,
    })
    await kassza.invoices.reverse(first.number)
    const reissued = await kassza.invoices.create(changed)

    expect(replay.number).toBe(first.number)
    expect(proforma.number).toBe('D-KASSZA-2026-1')
    expect(reissued.number).toBe('KASSZA-2026-3')
    expect(agent.invoices.size).toBe(4)
  })

  test('rendelésszám-tiltásnál két napnál régebbi azonos számlára is 152-t ad', async () => {
    let current = FAKE_NOW()
    const { kassza } = fakeKassza({ rejectDuplicateOrderNumbers: true, now: () => current })
    await kassza.invoices.create({ orderNumber: 'WEB-6', buyer: BUYER, items: ITEMS })

    current = new Date(current.getTime() + 3 * DAY_MS)

    await expect(
      kassza.invoices.create({ orderNumber: 'WEB-6', buyer: BUYER, items: ITEMS }),
    ).rejects.toMatchObject({ code: 152 })
  })

  test('csak számlára kapcsolható be a rendelésszám-tiltás', async () => {
    const { kassza } = fakeKassza({ rejectDuplicateOrderNumbers: { receipts: true } })

    await kassza.invoices.create({ orderNumber: 'WEB-7', buyer: BUYER, items: ITEMS })
    const second = await kassza.invoices.create({
      orderNumber: 'WEB-7',
      buyer: { ...BUYER, name: 'Másik Kft.' },
      items: ITEMS,
    })

    expect(second.number).toBe('KASSZA-2026-2')
  })

  test.each([
    [259, { netUnitPrice: 1000, netAmount: 900, vatAmount: 243, grossAmount: 1143 }],
    [260, { netUnitPrice: 1000, netAmount: 1000, vatAmount: 200, grossAmount: 1200 }],
    [261, { netUnitPrice: 1000, netAmount: 1000, vatAmount: 270, grossAmount: 1300 }],
  ])('hibás tételösszegre %i-es hibakódot ad', async (code, amounts) => {
    const { agent, kassza } = fakeKassza()

    await expect(
      kassza.invoices.create({
        buyer: BUYER,
        items: [{ name: 'Termék', vat: 27, ...amounts }],
      }),
    ).rejects.toMatchObject({
      code,
      category: 'validation',
      message: expect.stringContaining('Termék'),
    })
    expect(agent.invoices.size).toBe(0)
  })

  test('devizás számlán a tételösszegeket centes tűréssel ellenőrzi, és megőrzi az árfolyamot', async () => {
    const { kassza } = fakeKassza()

    const invoice = await kassza.invoices.create({
      currency: 'EUR',
      exchangeBank: 'MNB',
      exchangeRate: 395.5,
      language: 'en',
      buyer: BUYER,
      items: [{ name: 'Consulting', grossUnitPrice: 99.99, quantity: 3, vat: 27 }],
    })
    const details = await kassza.invoices.get(invoice.number)

    expect(details.header).toMatchObject({
      currency: 'EUR',
      exchangeBank: 'MNB',
      exchangeRate: 395.5,
      language: 'en',
    })
    expect(details.totals.grossAmount).toBe(299.97)
  })

  test('valaszVerzio 1-nél szöveges DONE vagy PDF választ ad', async () => {
    const { agent } = fakeKassza()
    const toVersion1 = (xml: string): string =>
      xml.replace('<valaszVerzio>2</valaszVerzio>', '<valaszVerzio>1</valaszVerzio>')

    const text = await rawAgentRequest(
      agent,
      'createInvoice',
      toVersion1(
        buildCreateInvoiceXml(
          FAKE_CREDENTIALS,
          {},
          { buyer: BUYER, items: ITEMS, downloadPdf: false },
        ),
      ),
    )
    const pdf = await rawAgentRequest(
      agent,
      'getInvoicePdf',
      toVersion1(buildInvoicePdfXml(FAKE_CREDENTIALS, 'KASSZA-2026-1')),
    )
    const missing = await rawAgentRequest(
      agent,
      'getInvoicePdf',
      toVersion1(buildInvoicePdfXml(FAKE_CREDENTIALS, 'NINCS-2026-1')),
    )

    expect(await text.text()).toBe('xmlagentresponse=DONE;KASSZA-2026-1\n')
    expect(text.headers.get('szlahu_szamlaszam')).toBe('KASSZA-2026-1')
    expect(text.headers.get('szlahu_bruttovegosszeg')).toBe('25400')
    expect(pdf.headers.get('content-type')).toBe('application/pdf')
    expect(isPdf(new Uint8Array(await pdf.arrayBuffer()))).toBe(true)
    expect(missing.headers.get('szlahu_error_code')).toBe('7')
    expect(await missing.text()).toMatch(/^\[ERR\] \[7\] Hiányzó adat: számla pdf/)
  })

  test.skipIf(!canValidateXsd('szamla/szamla.xsd'))(
    'a számla XML válasz megfelel a szamla.xsd sémának',
    async () => {
      const { agent, kassza } = fakeKassza()
      const invoice = await kassza.invoices.create({
        paid: true,
        comment: 'Köszönjük & viszlát <3',
        buyer: { ...BUYER, country: 'Magyarország' },
        items: [...ITEMS, { name: 'Tárgyi adómentes', netUnitPrice: 5000, vat: 'TAM' }],
      })
      const reversal = await kassza.invoices.reverse(invoice.number)
      const foreign = await kassza.invoices.create({
        currency: 'EUR',
        exchangeBank: 'MNB',
        exchangeRate: 395.5,
        buyer: { ...BUYER, taxNumber: undefined },
        items: [{ name: 'Service', netUnitPrice: 12.34, vat: 27 }],
      })

      for (const number of [invoice.number, reversal.number, foreign.number]) {
        const response = await rawAgentRequest(
          agent,
          'getInvoiceXml',
          buildGetInvoiceXml(FAKE_CREDENTIALS, number, { includePdf: true }),
        )
        expect(validateAgainstXsd(await response.text(), 'szamla/szamla.xsd')).toEqual([])
      }
    },
  )

  test.skipIf(!canValidateXsd('agent/xmlszamlavalasz.xsd'))(
    'a számlaválasz és a hibaválasz megfelel az xmlszamlavalasz.xsd sémának',
    async () => {
      const { agent } = fakeKassza()
      const success = await rawAgentRequest(
        agent,
        'createInvoice',
        buildCreateInvoiceXml(FAKE_CREDENTIALS, {}, { buyer: BUYER, items: ITEMS }),
      )
      const failure = await rawAgentRequest(
        agent,
        'getInvoiceXml',
        buildGetInvoiceXml(FAKE_CREDENTIALS, 'NINCS-2026-1'),
      )

      const failureXml = await failure.text()
      expect(validateAgainstXsd(await success.text(), 'agent/xmlszamlavalasz.xsd')).toEqual([])
      expect(validateAgainstXsd(failureXml, 'agent/xmlszamlavalasz.xsd')).toEqual([])
      expect(failureXml).toContain('<hibakod>7</hibakod>')
      expect(failure.headers.get('szlahu_error_code')).toBe('7')
    },
  )
})
