import { describe, expect, test } from 'vitest'
import {
  createTestContext,
  FAKE_PDF_BYTES,
  invoiceXmlResponse,
  type MockResponse,
  TEST_AGENT_KEY,
  textErrorResponse,
} from '../../tests/helpers'
import { canValidateXsd, validateAgainstXsd } from '../../tests/xsd'
import { bytesToBase64 } from '../core/binary'
import { el } from '../core/xml/serialize'
import { buildGetInvoiceXml, getInvoice, parseGetInvoiceResponse } from './get'

const CREDENTIALS = [el('szamlaagentkulcs', TEST_AGENT_KEY)]

function szamlaResponse(inner: string): MockResponse {
  return {
    headers: { 'content-type': 'application/xml; charset=UTF-8' },
    body: `<?xml version="1.0" encoding="UTF-8"?>\n<szamla xmlns="http://www.szamlazz.hu/szamla" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.szamlazz.hu/szamla szamla.xsd ">\n${inner}\n</szamla>`,
  }
}

const DOCS_SAMPLE = szamlaResponse(`
    <szallito>
        <id>201</id>
        <nev>Lorem ipsum dolor sit amet, consectetur cs amet., 512356234</nev>
        <cim>
            <orszag>Hungary</orszag>
            <irsz>1086</irsz>
            <telepules>Budapest</telepules>
            <cim>Szerdahelyi utca 4-8</cim>
        </cim>
        <adoszam>202 336 0856</adoszam>
        <adoszameu>DPH:SK2023360856</adoszameu>
        <bank>
            <nev>UniCredit Bank Hungary Zrt.</nev>
            <bankszamla></bankszamla>
        </bank>
    </szallito>
    <alap>
        <id>529992</id>
        <szamlaszam>D-LOLO-66</szamlaszam>
        <tipus>D</tipus>
        <eszamla>0</eszamla>
        <kelt>2024-10-09</kelt>
        <telj>2024-10-09</telj>
        <fizh>2024-10-09</fizh>
        <fizmod>credit_card</fizmod>
        <fizmodunified>other</fizmodunified>
        <nyelv>hu</nyelv>
        <devizanem>HUF</devizanem>
        <devizaarf>0</devizaarf>
        <megjegyzes></megjegyzes>
        <penzforg>false</penzforg>
        <kata>true</kata>
        <email>vevo@example.com</email>
        <teszt>false</teszt>
    </alap>
    <vevo>
        <id>221216</id>
        <nev>Customer name</nev>
        <cim>
            <orszag>Hungary</orszag>
            <irsz>1324</irsz>
            <telepules>Debrecen</telepules>
            <cim>1234</cim>
        </cim>
     <email>vevo@example.com</email>
        <adoszam></adoszam>
        <fokonyv>
            <vevo></vevo>
            <vevoazon></vevoazon>
        </fokonyv>
    </vevo>
    <tetelek>
        <tetel>
            <nev>Apple</nev>
            <mennyiseg>1</mennyiseg>
            <mennyisegiegyseg>pieces</mennyisegiegyseg>
            <nettoegysegar>380</nettoegysegar>
            <afakulcs>20</afakulcs>
            <netto>380</netto>
            <arresafaalap>0</arresafaalap>
            <afa>76</afa>
            <brutto>456</brutto>
            <megjegyzes>Apple comment</megjegyzes>
            <fokonyv>
                <arbevetel></arbevetel>
                <afa></afa>
                <gazdasagiesemeny></gazdasagiesemeny>
                <gazdasagiesemenyafa></gazdasagiesemenyafa>
            </fokonyv>
        </tetel>
    </tetelek>
    <osszegek>
        <afakulcsossz>
            <afakulcs>20</afakulcs>
            <netto>464</netto>
            <afa>93</afa>
            <brutto>557</brutto>
        </afakulcsossz>
        <totalossz>
            <netto>464</netto>
            <afa>93</afa>
            <brutto>557</brutto>
        </totalossz>
    </osszegek>
    <kifizetesek>
        <kifizetes>
            <datum>2020-09-22</datum>
            <jogcim>transfer</jogcim>
            <osszeg>15</osszeg>
            <megjegyzes>comment</megjegyzes>
            <bankszamlaszam>-</bankszamlaszam>
        </kifizetes>
    </kifizetesek>`)

const FULL_SAMPLE = szamlaResponse(`
  <szallito>
    <id>1</id>
    <nev>Minta Kft.</nev>
    <cim><orszag>Magyarország</orszag><irsz>1111</irsz><telepules>Budapest</telepules><cim>Fő utca 1.</cim></cim>
    <postacim><irsz>1112</irsz><telepules>Budapest</telepules><cim>Pf. 12</cim></postacim>
    <adoszam>12345678-2-42</adoszam>
    <csoportazonosito>17777777-5-44</csoportazonosito>
    <adoszameu>HU12345678</adoszameu>
    <bank><nev>OTP</nev><bankszamla>11111111-22222222</bankszamla></bank>
  </szallito>
  <alap>
    <id>987</id>
    <szamlaszam>SZT-2026-2</szamlaszam>
    <gazdEsemAzon>986</gazdEsemAzon>
    <forras>34</forras>
    <iktatoszam>IK-1</iktatoszam>
    <tipus>SS</tipus>
    <eszamla>3</eszamla>
    <hivszamlaszam>SZT-2026-1</hivszamlaszam>
    <hivdijbekszam>D-2026-1</hivdijbekszam>
    <kelt>2026-09-16</kelt>
    <telj>2026-09-10</telj>
    <fizh>2026-09-24</fizh>
    <fizmod>Átutalás</fizmod>
    <fizmodunified>átutalás</fizmodunified>
    <keszpenz>false</keszpenz>
    <rendelesszam>RND-1</rendelesszam>
    <nyelv>en</nyelv>
    <devizanem>EUR</devizanem>
    <devizabank>MNB</devizabank>
    <devizaarf>395,5</devizaarf>
    <megjegyzes>Sztornó</megjegyzes>
    <afatipus>EU</afatipus>
    <penzforg>true</penzforg>
    <kata>false</kata>
    <katafokonyv>false</katafokonyv>
    <email>szamla@example.hu</email>
    <teszt>true</teszt>
    <sztornozott>false</sztornozott>
  </alap>
  <vevo>
    <id>55</id>
    <nev>Vevő &amp; Társa Bt.</nev>
    <azonosito>V-55</azonosito>
    <cim><irsz>4000</irsz><telepules>Debrecen</telepules><cim>Piac u. 2.</cim></cim>
    <postacim><nev>Vevő Bt. posta</nev><orszag>HU</orszag><irsz>4001</irsz><telepules>Debrecen</telepules><cim>Pf. 1</cim></postacim>
    <email>vevo@example.hu</email>
    <adoszam>87654321-1-09</adoszam>
    <csoportazonosito>18888888-5-09</csoportazonosito>
    <adoszameu>HU87654321</adoszameu>
    <lokacio>1</lokacio>
    <privatePersonIndicator>false</privatePersonIndicator>
    <fokonyv>
      <vevo>311</vevo><vevoazon>VA-1</vevoazon><datum>2026-09-16</datum>
      <folyamatostelj>true</folyamatostelj><elszDatTol>2026-09-01</elszDatTol><elszDatIg>2026-09-30</elszDatIg>
    </fokonyv>
  </vevo>
  <tetelek>
    <tetel>
      <nev>Szolgáltatás</nev><azonosito>SKU-1</azonosito><mennyiseg>-2</mennyiseg>
      <mennyisegiegyseg>óra</mennyisegiegyseg><nettoegysegar>100</nettoegysegar><afatipus>EUT</afatipus>
      <afakulcs>0</afakulcs><netto>-200</netto><arresafaalap>0</arresafaalap><afa>0</afa><brutto>-200</brutto>
      <megjegyzes>megj</megjegyzes><sztetordering>1</sztetordering>
      <fokonyv>
        <arbevetel>911</arbevetel><afa>467</afa><gazdasagiesemeny>GE</gazdasagiesemeny>
        <gazdasagiesemenyafa>GEA</gazdasagiesemenyafa><elszdattol>2026-09-01</elszdattol><elszdatig>2026-09-30</elszdatig>
      </fokonyv>
    </tetel>
    <tetel>
      <nev>Termék</nev><mennyiseg>1</mennyiseg><mennyisegiegyseg>db</mennyisegiegyseg>
      <nettoegysegar>10</nettoegysegar><afakulcs>27</afakulcs><netto>10</netto><afa>2.7</afa><brutto>12.7</brutto>
      <sztetordering>2</sztetordering>
    </tetel>
  </tetelek>
  <qutetek>
    <qutet>
      <nev>Pénzügyi tétel</nev><afatipus>EUT</afatipus><afakulcs>0</afakulcs><netto>-200</netto><afa>0</afa>
      <brutto>-200</brutto><elszdattol>2026-09-01</elszdattol><elszdatig>2026-09-30</elszdatig><afalevon>1</afalevon>
      <cimkek><cimke>projekt-a</cimke></cimkek>
    </qutet>
  </qutetek>
  <cimkek><cimke>kiemelt</cimke></cimkek>
  <osszegek>
    <afakulcsossz><afatipus>EUT</afatipus><afakulcs>0</afakulcs><netto>-200</netto><afa>0</afa><brutto>-200</brutto></afakulcsossz>
    <afakulcsossz><afakulcs>27</afakulcs><netto>10</netto><afa>2.7</afa><brutto>12.7</brutto></afakulcsossz>
    <totalossz><netto>-190</netto><afa>2.7</afa><brutto>-187.3</brutto></totalossz>
  </osszegek>
  <kifizetesek>
    <kifizetes>
      <datum>2026-09-16</datum><jogcim>átutalás</jogcim><osszeg>-187.3</osszeg><megjegyzes>vissza</megjegyzes>
      <bankszamlaszam>11111111-22222222</bankszamlaszam><banktranzid>42</banktranzid><devizaarf>395.5</devizaarf>
    </kifizetes>
  </kifizetesek>
  <pdf>${bytesToBase64(FAKE_PDF_BYTES)}</pdf>`)

describe('buildGetInvoiceXml', () => {
  test('számlaszám alapján, PDF kérés nélkül építi a kérést', () => {
    const xml = buildGetInvoiceXml(CREDENTIALS, 'E-TST-2026-1')

    expect(xml).toContain('<szamlaszam>E-TST-2026-1</szamlaszam>')
    expect(xml).not.toContain('<pdf>')
    expect(xml).not.toContain('<beallitasok>')
  })

  test('rendelésszám, külső azonosító és PDF kérés esetén az XSD sorrendjét tartja', () => {
    const byOrder = buildGetInvoiceXml(CREDENTIALS, { orderNumber: 'R-1' }, { includePdf: true })
    expect(byOrder).toContain('<rendelesSzam>R-1</rendelesSzam>')
    expect(byOrder.indexOf('<rendelesSzam>')).toBeLessThan(byOrder.indexOf('<pdf>true</pdf>'))

    const byExternalId = buildGetInvoiceXml(
      CREDENTIALS,
      { externalId: 'ext-1' },
      { includePdf: false },
    )
    expect(byExternalId.indexOf('<pdf>false</pdf>')).toBeLessThan(
      byExternalId.indexOf('<szamlaKulsoAzon>ext-1</szamlaKulsoAzon>'),
    )
  })

  test('hibás hivatkozásra validációs hibát dob', () => {
    expect(() => buildGetInvoiceXml(CREDENTIALS, { invoiceNumber: ' ' })).toThrow(
      expect.objectContaining({ category: 'validation' }),
    )
  })
})

describe.skipIf(!canValidateXsd('agentxml/xmlszamlaxml.xsd'))('XML lekérés XSD szerződés', () => {
  test('a minimális kérés megfelel az XSD-nek', () => {
    const xml = buildGetInvoiceXml(CREDENTIALS, 'E-1')
    expect(validateAgainstXsd(xml, 'agentxml/xmlszamlaxml.xsd')).toEqual([])
  })

  test.each([
    ['rendelésszám', { orderNumber: 'R-1' }],
    ['külső azonosító', { externalId: 'ext-1' }],
  ] as const)('a PDF-et is kérő, %s alapú kérés megfelel az XSD-nek', (_label, reference) => {
    const xml = buildGetInvoiceXml(CREDENTIALS, reference, { includePdf: true })
    expect(validateAgainstXsd(xml, 'agentxml/xmlszamlaxml.xsd')).toEqual([])
  })
})

describe('getInvoice', () => {
  test('a docs mintáját típusos objektummá alakítja', async () => {
    const { ctx, agent } = createTestContext(DOCS_SAMPLE)

    const invoice = await getInvoice(ctx, 'D-LOLO-66')

    expect(agent.lastCall().field).toBe('action-szamla_agent_xml')
    expect(invoice.seller).toMatchObject({
      id: 201,
      taxNumber: '202 336 0856',
      address: {
        country: 'Hungary',
        zip: '1086',
        city: 'Budapest',
        address: 'Szerdahelyi utca 4-8',
      },
      bank: { name: 'UniCredit Bank Hungary Zrt.', accountNumber: undefined },
    })
    expect(invoice.header).toMatchObject({
      id: 529992,
      number: 'D-LOLO-66',
      type: 'proforma',
      typeCode: 'D',
      eInvoice: false,
      appearanceCode: 0,
      issueDate: '2024-10-09',
      paymentMethod: 'credit_card',
      unifiedPaymentMethod: 'other',
      currency: 'HUF',
      exchangeRate: 0,
      comment: undefined,
      cashAccounting: false,
      kata: true,
      test: false,
    })
    expect(invoice.buyer).toMatchObject({
      name: 'Customer name',
      taxNumber: undefined,
      ledger: { ledgerAccount: undefined, buyerId: undefined },
    })
    expect(invoice.items).toEqual([
      expect.objectContaining({
        name: 'Apple',
        quantity: 1,
        unit: 'pieces',
        netUnitPrice: 380,
        vat: 20,
        netAmount: 380,
        vatAmount: 76,
        grossAmount: 456,
        marginVatBase: 0,
        comment: 'Apple comment',
      }),
    ])
    expect(invoice.totals).toEqual({
      netAmount: 464,
      vatAmount: 93,
      grossAmount: 557,
      byVat: [{ vat: 20, vatCode: undefined, netAmount: 464, vatAmount: 93, grossAmount: 557 }],
    })
    expect(invoice.payments).toEqual([
      {
        date: '2020-09-22',
        method: 'transfer',
        amount: 15,
        comment: 'comment',
        bankAccountNumber: '-',
        bankTransactionId: undefined,
        exchangeRate: undefined,
      },
    ])
    expect(invoice.financialItems).toEqual([])
    expect(invoice.labels).toEqual([])
    expect(invoice.pdf).toBeUndefined()
  })

  test('a szamla.xsd minden mezőjét leképezi', async () => {
    const { ctx, agent } = createTestContext(FULL_SAMPLE)

    const invoice = await getInvoice(ctx, { orderNumber: 'RND-1' }, { includePdf: true })

    expect(agent.lastCall().xml).toContain('<pdf>true</pdf>')
    expect(invoice).toEqual({
      seller: {
        id: 1,
        name: 'Minta Kft.',
        address: {
          name: undefined,
          country: 'Magyarország',
          zip: '1111',
          city: 'Budapest',
          address: 'Fő utca 1.',
        },
        postalAddress: {
          name: undefined,
          country: undefined,
          zip: '1112',
          city: 'Budapest',
          address: 'Pf. 12',
        },
        taxNumber: '12345678-2-42',
        groupTaxNumber: '17777777-5-44',
        euTaxNumber: 'HU12345678',
        bank: { name: 'OTP', accountNumber: '11111111-22222222' },
      },
      header: {
        id: 987,
        number: 'SZT-2026-2',
        economicEventId: 986,
        sourceSystem: 34,
        registrationNumber: 'IK-1',
        type: 'reversal',
        typeCode: 'SS',
        eInvoice: true,
        appearanceCode: 3,
        referencedInvoiceNumber: 'SZT-2026-1',
        referencedProformaNumber: 'D-2026-1',
        issueDate: '2026-09-16',
        fulfillmentDate: '2026-09-10',
        dueDate: '2026-09-24',
        paymentMethod: 'Átutalás',
        unifiedPaymentMethod: 'átutalás',
        cash: false,
        orderNumber: 'RND-1',
        language: 'en',
        currency: 'EUR',
        exchangeBank: 'MNB',
        exchangeRate: 395.5,
        comment: 'Sztornó',
        vatType: 'EU',
        cashAccounting: true,
        kata: false,
        kataLedger: false,
        email: 'szamla@example.hu',
        test: true,
        reversed: false,
      },
      buyer: {
        id: 55,
        name: 'Vevő & Társa Bt.',
        identifier: 'V-55',
        address: {
          name: undefined,
          country: undefined,
          zip: '4000',
          city: 'Debrecen',
          address: 'Piac u. 2.',
        },
        postalAddress: {
          name: 'Vevő Bt. posta',
          country: 'HU',
          zip: '4001',
          city: 'Debrecen',
          address: 'Pf. 1',
        },
        email: 'vevo@example.hu',
        taxNumber: '87654321-1-09',
        groupTaxNumber: '18888888-5-09',
        euTaxNumber: 'HU87654321',
        location: 1,
        privatePerson: false,
        ledger: {
          ledgerAccount: '311',
          buyerId: 'VA-1',
          bookingDate: '2026-09-16',
          continuousFulfillment: true,
          settlementPeriodStart: '2026-09-01',
          settlementPeriodEnd: '2026-09-30',
        },
      },
      items: [
        {
          name: 'Szolgáltatás',
          identifier: 'SKU-1',
          quantity: -2,
          unit: 'óra',
          netUnitPrice: 100,
          vat: 0,
          vatCode: 'EUT',
          netAmount: -200,
          marginVatBase: 0,
          vatAmount: 0,
          grossAmount: -200,
          comment: 'megj',
          position: 1,
          ledger: {
            revenueLedgerAccount: '911',
            vatLedgerAccount: '467',
            economicEvent: 'GE',
            vatEconomicEvent: 'GEA',
            settlementPeriodStart: '2026-09-01',
            settlementPeriodEnd: '2026-09-30',
          },
        },
        {
          name: 'Termék',
          identifier: undefined,
          quantity: 1,
          unit: 'db',
          netUnitPrice: 10,
          vat: 27,
          vatCode: undefined,
          netAmount: 10,
          marginVatBase: undefined,
          vatAmount: 2.7,
          grossAmount: 12.7,
          comment: undefined,
          position: 2,
          ledger: undefined,
        },
      ],
      financialItems: [
        {
          name: 'Pénzügyi tétel',
          vat: 0,
          vatCode: 'EUT',
          netAmount: -200,
          vatAmount: 0,
          grossAmount: -200,
          settlementPeriodStart: '2026-09-01',
          settlementPeriodEnd: '2026-09-30',
          vatDeduction: 1,
          labels: ['projekt-a'],
        },
      ],
      labels: ['kiemelt'],
      totals: {
        netAmount: -190,
        vatAmount: 2.7,
        grossAmount: -187.3,
        byVat: [
          { vat: 0, vatCode: 'EUT', netAmount: -200, vatAmount: 0, grossAmount: -200 },
          { vat: 27, vatCode: undefined, netAmount: 10, vatAmount: 2.7, grossAmount: 12.7 },
        ],
      },
      payments: [
        {
          date: '2026-09-16',
          method: 'átutalás',
          amount: -187.3,
          comment: 'vissza',
          bankAccountNumber: '11111111-22222222',
          bankTransactionId: 42,
          exchangeRate: 395.5,
        },
      ],
      pdf: FAKE_PDF_BYTES,
    })
  })

  test('ismeretlen bizonylattípust unknown-ként, a nyers kóddal ad vissza', async () => {
    const body = String(FULL_SAMPLE.body).replace('<tipus>SS</tipus>', '<tipus>XY</tipus>')
    const { ctx } = createTestContext({ ...FULL_SAMPLE, body })

    const invoice = await getInvoice(ctx, 'E-1')

    expect(invoice.header).toMatchObject({ type: 'unknown', typeCode: 'XY' })
  })

  test('hiányzó kötelező elemre unexpected_response hibát dob', async () => {
    const cases = [
      ['<szallito>', '<nincsszallito>', '</szallito>', '</nincsszallito>'],
      ['<szamlaszam>SZT-2026-2</szamlaszam>', ''],
      ['<totalossz><netto>-190</netto>', '<totalossz><netto></netto>'],
    ]
    for (const [from, to, from2, to2] of cases) {
      let body = String(FULL_SAMPLE.body).replace(from ?? '', to ?? '')
      if (from2 !== undefined) body = body.replace(from2, to2 ?? '')
      const { ctx } = createTestContext({ ...FULL_SAMPLE, body })

      await expect(getInvoice(ctx, 'E-1')).rejects.toMatchObject({
        category: 'unexpected_response',
        message: expect.stringContaining('Hiányzik'),
      })
    }
  })

  test('a 7-es kódú xmlszamlavalasz hibát not_found hibaként adja vissza', async () => {
    const { ctx } = createTestContext(
      invoiceXmlResponse(
        '<sikeres>false</sikeres><hibakod>7</hibakod><hibauzenet><![CDATA[Hiányzó adat: számla xml]]></hibauzenet>',
      ),
    )

    await expect(getInvoice(ctx, 'NINCS-1')).rejects.toMatchObject({
      code: 7,
      category: 'not_found',
    })
  })

  test('a fejléc és a szöveges hibát is kezeli', async () => {
    const header = createTestContext(textErrorResponse('Sikertelen bejelentkezés', 3))
    const text = createTestContext({ body: '[ERR] Sikertelen bejelentkezés ---------- x' })

    await expect(getInvoice(header.ctx, 'E-1')).rejects.toMatchObject({ category: 'auth' })
    await expect(getInvoice(text.ctx, 'E-1')).rejects.toThrow('Sikertelen bejelentkezés')
  })

  test('nem számla gyökérelemre és nem XML válaszra unexpected_response hibát dob', async () => {
    const other = createTestContext(invoiceXmlResponse('<sikeres>true</sikeres>'))
    const plain = createTestContext({ body: 'nem xml' })

    await expect(getInvoice(other.ctx, 'E-1')).rejects.toMatchObject({
      category: 'unexpected_response',
    })
    await expect(getInvoice(plain.ctx, 'E-1')).rejects.toMatchObject({
      category: 'unexpected_response',
    })
  })

  test('hálózati hiba után újrapróbál, mert a lekérdezés biztonságos', async () => {
    const { ctx, agent } = createTestContext([new TypeError('fetch failed'), DOCS_SAMPLE])

    await expect(getInvoice(ctx, 'D-LOLO-66')).resolves.toMatchObject({
      header: { number: 'D-LOLO-66' },
    })
    expect(agent.calls).toHaveLength(2)
  })

  test('a parseGetInvoiceResponse közvetlenül is használható', async () => {
    const { ctx } = createTestContext(DOCS_SAMPLE)

    const invoice = await ctx.execute(
      { action: 'getInvoiceXml', xml: '<x/>' },
      parseGetInvoiceResponse,
    )

    expect(invoice.header.number).toBe('D-LOLO-66')
  })
})
