import { describe, expect, test } from 'vitest'
import { canValidateXsd, validateAgainstXsd } from '../../tests/xsd'
import {
  childText,
  findChild,
  findChildren,
  findPath,
  parseXml,
  type XmlElement,
} from '../core/xml/parse'
import { el } from '../core/xml/serialize'
import { resolveInvoice } from './create-resolve'
import type { CreateInvoiceInput, InvoiceDefaults } from './create-types'
import { buildCreateInvoiceXml, renderInvoiceXml } from './create-xml'

const CREDENTIALS = [el('szamlaagentkulcs', 'tesztkulcs')]
const NOW = new Date('2026-09-16T10:00:00Z')

const BUYER = {
  name: 'Vevő Kft.',
  zip: '1234',
  city: 'Budapest',
  address: 'Fő utca 1.',
} as const

const MINIMAL: CreateInvoiceInput = {
  buyer: BUYER,
  items: [{ name: 'Termék', quantity: 2, unit: 'db', netUnitPrice: 10000, vat: 27 }],
}

const FULL: CreateInvoiceInput = {
  type: 'final',
  advanceInvoiceNumber: 'E-2026-1',
  issueDate: '2026-09-16',
  fulfillmentDate: '2026-09-15',
  dueDate: '2026-09-30',
  paymentMethod: 'Bankkártya',
  currency: 'EUR',
  exchangeRate: 395.12,
  exchangeBank: 'OTP',
  language: 'en',
  comment: 'Megjegyzés',
  orderNumber: 'R-1',
  proformaNumber: 'D-2026-1',
  prefix: 'WEB',
  paid: true,
  eInvoice: true,
  downloadPdf: true,
  externalId: 'ext-1',
  template: 'SzlaMost',
  simpleItems: true,
  logoExtra: 'logo',
  paymentCorrection: -0.5,
  marginVat: false,
  euVat: false,
  aggregator: 'agg',
  guardian: true,
  articleIdentifierInvoice: true,
  seller: {
    bank: 'OTP',
    bankAccount: '11111111-22222222-33333333',
    emailReplyTo: 'info@elado.hu',
    emailSubject: 'Számla',
    emailText: 'Szöveg',
    signatoryName: 'Eladó Aláíró',
  },
  buyer: {
    ...BUYER,
    country: 'Magyarország',
    email: 'a@b.hu',
    sendEmail: true,
    taxpayerType: 'hungarianTaxNumber',
    taxNumber: '12345678-2-42',
    groupTaxNumber: '17781234-5-44',
    euTaxNumber: 'HU12345678',
    postal: {
      name: 'Posta Név',
      country: 'Magyarország',
      zip: '2040',
      city: 'Budaörs',
      address: 'Szivárvány utca 8.',
    },
    ledger: {
      bookingDate: '2026-09-16',
      buyerId: 'V-1',
      ledgerAccount: '311',
      continuousFulfillment: true,
      settlementPeriodStart: '2026-09-01',
      settlementPeriodEnd: '2026-09-30',
    },
    identifier: '1234',
    signatoryName: 'Vevő Aláíró',
    phone: '+36301234567',
    comment: 'Vevő megjegyzés',
  },
  waybill: {
    courier: 'MPL',
    barcode: 'VK123',
    comment: 'Törékeny',
    transOFlex: {
      id: '12345',
      shipmentId: 'S1',
      packageCount: 1,
      countryCode: 'HU',
      zip: '1234',
      service: 'EXP',
    },
    pickPackPoint: { barcodePrefix: 'ABC', barcodePostfix: '1234567' },
    sprinter: {
      id: 'SPR',
      senderCode: '1234567890',
      directionCode: '106',
      packageCount: 2,
      barcodePostfix: '1234567',
      deliveryTime: '1 munkanap',
    },
    mpl: {
      customerCode: 'MPL1',
      barcode: 'MPLBAR',
      weight: 1.5,
      services: 'K',
      declaredValue: 10000,
    },
  },
  items: [
    {
      name: 'Utazás',
      identifier: 'CIKK-1',
      quantity: 1,
      unit: 'fő',
      netUnitPrice: 100,
      vat: 27,
      marginVatBase: 80,
      comment: 'Tétel megjegyzés',
      ledger: {
        economicEvent: 'E1',
        vatEconomicEvent: 'EA1',
        revenueLedgerAccount: '911',
        vatLedgerAccount: '467',
        settlementPeriodStart: '2026-09-01',
        settlementPeriodEnd: '2026-09-30',
      },
      dataDeletionCode: 123,
    },
  ],
}

function build(
  input: CreateInvoiceInput,
  defaults: InvoiceDefaults = {},
  now: Date = NOW,
): XmlElement {
  return parseXml(buildCreateInvoiceXml(CREDENTIALS, defaults, input, now))
}

function names(element: XmlElement | undefined): string[] {
  return element?.children.map((child) => child.name) ?? []
}

function stripDocsOnlyElements(xml: string): string {
  return xml
    .split('\n')
    .filter((line) => !/<(csoportazonosito|torloKod)>/.test(line))
    .join('\n')
}

describe.skipIf(!canValidateXsd('agent/xmlszamla.xsd'))('XSD szerződés', () => {
  test('a minimális kérés megfelel az xmlszamla.xsd-nek', () => {
    const xml = buildCreateInvoiceXml(CREDENTIALS, {}, MINIMAL, NOW)

    expect(validateAgainstXsd(xml, 'agent/xmlszamla.xsd')).toEqual([])
  })

  test('a minden mezőt kitöltő kérés megfelel az xmlszamla.xsd-nek', () => {
    const xml = buildCreateInvoiceXml(CREDENTIALS, {}, FULL, NOW)

    expect(validateAgainstXsd(stripDocsOnlyElements(xml), 'agent/xmlszamla.xsd')).toEqual([])
  })

  test('az előnézeti és minden bizonylattípusú kérés is XSD-helyes', () => {
    const types: CreateInvoiceInput[] = [
      { ...MINIMAL, type: 'proforma' },
      { ...MINIMAL, type: 'advance' },
      { ...MINIMAL, type: 'corrective', correctedInvoiceNumber: 'A-1' },
      { ...MINIMAL, type: 'deliveryNote' },
    ]
    for (const input of types) {
      const xml = renderInvoiceXml(CREDENTIALS, resolveInvoice({}, input, NOW), { preview: true })
      expect(validateAgainstXsd(xml, 'agent/xmlszamla.xsd')).toEqual([])
    }
  })
})

describe('buildCreateInvoiceXml', () => {
  test('a minimális inputból a kötelező elemeket és az alapértékeket írja', () => {
    const root = build(MINIMAL)

    expect(root.name).toBe('xmlszamla')
    expect(root.attributes.xmlns).toBe('http://www.szamlazz.hu/xmlszamla')
    expect(names(root)).toEqual(['beallitasok', 'fejlec', 'elado', 'vevo', 'tetelek'])
    expect(names(findChild(root, 'beallitasok'))).toEqual([
      'szamlaagentkulcs',
      'eszamla',
      'szamlaLetoltes',
      'valaszVerzio',
    ])
    const settings = findChild(root, 'beallitasok')
    expect(childText(settings, 'eszamla')).toBe('false')
    expect(childText(settings, 'szamlaLetoltes')).toBe('true')
    expect(childText(settings, 'valaszVerzio')).toBe('2')
    const header = findChild(root, 'fejlec')
    expect(names(header)).toEqual([
      'keltDatum',
      'teljesitesDatum',
      'fizetesiHataridoDatum',
      'fizmod',
      'penznem',
      'szamlaNyelve',
    ])
    expect(childText(header, 'keltDatum')).toBe('2026-09-16')
    expect(childText(header, 'teljesitesDatum')).toBe('2026-09-16')
    expect(childText(header, 'fizetesiHataridoDatum')).toBe('2026-09-16')
    expect(childText(header, 'fizmod')).toBe('Átutalás')
    expect(childText(header, 'penznem')).toBe('HUF')
    expect(childText(header, 'szamlaNyelve')).toBe('hu')
    expect(names(findChild(root, 'elado'))).toEqual([])
    expect(names(findChild(root, 'vevo'))).toEqual(['nev', 'irsz', 'telepules', 'cim', 'sendEmail'])
    expect(childText(findChild(root, 'vevo'), 'sendEmail')).toBe('false')
  })

  test('a teljes input minden mezőt az XSD sorrendjében ír ki', () => {
    const root = build(FULL)

    expect(names(findChild(root, 'beallitasok'))).toEqual([
      'szamlaagentkulcs',
      'eszamla',
      'szamlaLetoltes',
      'valaszVerzio',
      'aggregator',
      'guardian',
      'cikkazoninvoice',
      'szamlaKulsoAzon',
    ])
    expect(names(findChild(root, 'fejlec'))).toEqual([
      'keltDatum',
      'teljesitesDatum',
      'fizetesiHataridoDatum',
      'fizmod',
      'penznem',
      'szamlaNyelve',
      'megjegyzes',
      'arfolyamBank',
      'arfolyam',
      'rendelesSzam',
      'dijbekeroSzamlaszam',
      'vegszamla',
      'elolegSzamlaszam',
      'logoExtra',
      'szamlaszamElotag',
      'fizetendoKorrekcio',
      'fizetve',
      'arresAfa',
      'eusAfa',
      'szamlaSablon',
      'simpleItems',
    ])
    expect(names(findChild(root, 'vevo'))).toEqual([
      'nev',
      'orszag',
      'irsz',
      'telepules',
      'cim',
      'email',
      'sendEmail',
      'adoalany',
      'adoszam',
      'csoportazonosito',
      'adoszamEU',
      'postazasiNev',
      'postazasiOrszag',
      'postazasiIrsz',
      'postazasiTelepules',
      'postazasiCim',
      'vevoFokonyv',
      'azonosito',
      'alairoNeve',
      'telefonszam',
      'megjegyzes',
    ])
    expect(childText(findChild(root, 'vevo'), 'adoalany')).toBe('1')
    expect(names(findPath(root, 'vevo', 'vevoFokonyv'))).toEqual([
      'konyvelesDatum',
      'vevoAzonosito',
      'vevoFokonyviSzam',
      'folyamatosTelj',
      'elszDatumTol',
      'elszDatumIg',
    ])
    expect(names(findChild(root, 'elado'))).toEqual([
      'bank',
      'bankszamlaszam',
      'emailReplyto',
      'emailTargy',
      'emailSzoveg',
      'alairoNeve',
    ])
    expect(names(findChild(root, 'fuvarlevel'))).toEqual([
      'futarSzolgalat',
      'vonalkod',
      'megjegyzes',
      'tof',
      'ppp',
      'sprinter',
      'mpl',
    ])
    expect(names(findPath(root, 'fuvarlevel', 'tof'))).toEqual([
      'azonosito',
      'shipmentID',
      'csomagszam',
      'countryCode',
      'zip',
      'service',
    ])
    expect(names(findPath(root, 'fuvarlevel', 'sprinter'))).toEqual([
      'azonosito',
      'feladokod',
      'iranykod',
      'csomagszam',
      'vonalkodPostfix',
      'szallitasiIdo',
    ])
    expect(names(findPath(root, 'fuvarlevel', 'mpl'))).toEqual([
      'vevokod',
      'vonalkod',
      'tomeg',
      'kulonszolgaltatasok',
      'erteknyilvanitas',
    ])
    expect(childText(findPath(root, 'fuvarlevel', 'mpl'), 'tomeg')).toBe('1.5')
    expect(names(findPath(root, 'tetelek', 'tetel'))).toEqual([
      'megnevezes',
      'azonosito',
      'mennyiseg',
      'mennyisegiEgyseg',
      'nettoEgysegar',
      'afakulcs',
      'arresAfaAlap',
      'nettoErtek',
      'afaErtek',
      'bruttoErtek',
      'megjegyzes',
      'tetelFokonyv',
      'torloKod',
    ])
    expect(names(findPath(root, 'tetelek', 'tetel', 'tetelFokonyv'))).toEqual([
      'gazdasagiEsem',
      'gazdasagiEsemAfa',
      'arbevetelFokonyviSzam',
      'afaFokonyviSzam',
      'elszDatumTol',
      'elszDatumIg',
    ])
  })

  test('nettó alapú tételnél a docs Kerekítés példáját adja (3 × 500, 27%)', () => {
    const root = build({
      buyer: BUYER,
      items: [{ name: 'Könyv', quantity: 3, netUnitPrice: 500, vat: 27 }],
    })
    const item = findPath(root, 'tetelek', 'tetel')

    expect(childText(item, 'mennyiseg')).toBe('3')
    expect(childText(item, 'mennyisegiEgyseg')).toBe('db')
    expect(childText(item, 'nettoEgysegar')).toBe('500')
    expect(childText(item, 'afakulcs')).toBe('27')
    expect(childText(item, 'nettoErtek')).toBe('1500')
    expect(childText(item, 'afaErtek')).toBe('405')
    expect(childText(item, 'bruttoErtek')).toBe('1905')
  })

  test('bruttó alapú tételnél a docs Kerekítés példájának összegeit adja (3 × 500 bruttó, 27%)', () => {
    const root = build({
      buyer: BUYER,
      items: [{ name: 'Könyv', quantity: 3, grossUnitPrice: 500, vat: 27 }],
    })
    const item = findPath(root, 'tetelek', 'tetel')

    expect(childText(item, 'nettoErtek')).toBe('1181')
    expect(childText(item, 'afaErtek')).toBe('319')
    expect(childText(item, 'bruttoErtek')).toBe('1500')
    expect(Math.round(Number(childText(item, 'nettoEgysegar')) * 3)).toBe(1181)
    expect(Number(childText(item, 'nettoEgysegar'))).toBeCloseTo(393.66, 1)
  })

  test('explicit összegekkel a docs bruttó példája bájtra reprodukálható (393.66)', () => {
    const root = build({
      buyer: BUYER,
      items: [
        {
          name: 'Könyv',
          quantity: 3,
          vat: 27,
          netUnitPrice: 393.66,
          netAmount: 1181,
          vatAmount: 319,
          grossAmount: 1500,
        },
      ],
    })
    const item = findPath(root, 'tetelek', 'tetel')

    expect(childText(item, 'nettoEgysegar')).toBe('393.66')
    expect(childText(item, 'nettoErtek')).toBe('1181')
    expect(childText(item, 'afaErtek')).toBe('319')
    expect(childText(item, 'bruttoErtek')).toBe('1500')
  })

  test('negatív egységárú kedvezmény tételt is helyesen számol', () => {
    const root = build({
      buyer: BUYER,
      items: [{ name: 'Kedvezmény', netUnitPrice: -2000, vat: 27 }],
    })
    const item = findPath(root, 'tetelek', 'tetel')

    expect(childText(item, 'nettoErtek')).toBe('-2000')
    expect(childText(item, 'afaErtek')).toBe('-540')
    expect(childText(item, 'bruttoErtek')).toBe('-2540')
  })

  test('devizás számlán tizedes összegeket, árfolyamot és bankot ír', () => {
    const root = build({
      ...MINIMAL,
      currency: 'EUR',
      exchangeRate: 400.5,
      items: [{ name: 'Szolgáltatás', quantity: 3, netUnitPrice: 10.5, vat: 27 }],
    })
    const header = findChild(root, 'fejlec')
    const item = findPath(root, 'tetelek', 'tetel')

    expect(childText(header, 'penznem')).toBe('EUR')
    expect(childText(header, 'arfolyamBank')).toBe('MNB')
    expect(childText(header, 'arfolyam')).toBe('400.5')
    expect(childText(item, 'nettoErtek')).toBe('31.5')
    expect(childText(item, 'afaErtek')).toBe('8.51')
    expect(childText(item, 'bruttoErtek')).toBe('40.01')
  })

  test('devizás számlán árfolyam nélkül az MNB automatikus árfolyamát kéri', () => {
    const header = findChild(build({ ...MINIMAL, currency: 'USD' }), 'fejlec')

    expect(childText(header, 'arfolyamBank')).toBe('MNB')
    expect(findChild(header, 'arfolyam')).toBeUndefined()
  })

  test.each([
    [{ type: 'invoice' }, []],
    [{ type: 'proforma' }, ['dijbekero']],
    [{ type: 'advance' }, ['elolegszamla']],
    [{ type: 'final', orderNumber: 'R-1' }, ['vegszamla']],
    [{ type: 'final', advanceInvoiceNumber: 'E-1' }, ['vegszamla', 'elolegSzamlaszam']],
    [
      { type: 'corrective', correctedInvoiceNumber: 'A-1' },
      ['helyesbitoszamla', 'helyesbitettSzamlaszam'],
    ],
    [{ type: 'deliveryNote' }, ['szallitolevel']],
  ] as const)('%o bizonylattípus fejléc jelzői: %o', (typeFields, expected) => {
    const header = findChild(build({ ...MINIMAL, ...typeFields } as CreateInvoiceInput), 'fejlec')
    const typeFlags = [
      'elolegszamla',
      'vegszamla',
      'elolegSzamlaszam',
      'helyesbitoszamla',
      'helyesbitettSzamlaszam',
      'dijbekero',
      'szallitolevel',
    ]

    expect(names(header).filter((name) => typeFlags.includes(name))).toEqual(expected)
    for (const flag of [
      'elolegszamla',
      'vegszamla',
      'helyesbitoszamla',
      'dijbekero',
      'szallitolevel',
    ]) {
      if (expected.includes(flag as never)) expect(childText(header, flag)).toBe('true')
    }
  })

  test('a helyesbített és az előlegszámla számát beírja', () => {
    const corrective = findChild(
      build({ ...MINIMAL, type: 'corrective', correctedInvoiceNumber: 'A-2026-7' }),
      'fejlec',
    )
    const final = findChild(
      build({ ...MINIMAL, type: 'final', advanceInvoiceNumber: 'E-2026-3' }),
      'fejlec',
    )

    expect(childText(corrective, 'helyesbitettSzamlaszam')).toBe('A-2026-7')
    expect(childText(final, 'elolegSzamlaszam')).toBe('E-2026-3')
  })

  test('a kliensszintű alapértékeket használja, az input felülírja őket, a seller mezőnként merge-elődik', () => {
    const defaults: InvoiceDefaults = {
      seller: { bank: 'OTP', bankAccount: '1111', emailSubject: 'Alap tárgy' },
      prefix: 'ALAP',
      language: 'de',
      currency: 'EUR',
      exchangeBank: 'MNB',
      paymentMethod: 'Készpénz',
      paymentDueInDays: 8,
      eInvoice: true,
      downloadPdf: false,
      template: 'SzlaAlap',
      logoExtra: 'alaplogo',
      simpleItems: false,
      euVat: true,
      aggregator: 'alapagg',
      guardian: false,
      articleIdentifierInvoice: false,
    }
    const fromDefaults = build(MINIMAL, defaults)
    const overridden = build(
      {
        ...MINIMAL,
        seller: { bankAccount: '2222', emailText: 'Egyedi szöveg' },
        prefix: 'WEB',
        language: 'en',
        currency: 'HUF',
        paymentMethod: 'Átutalás',
        paymentDueInDays: 3,
        eInvoice: false,
        downloadPdf: true,
        template: 'SzlaMost',
      },
      defaults,
    )

    const header = findChild(fromDefaults, 'fejlec')
    expect(childText(findChild(fromDefaults, 'beallitasok'), 'eszamla')).toBe('true')
    expect(childText(findChild(fromDefaults, 'beallitasok'), 'szamlaLetoltes')).toBe('false')
    expect(childText(findChild(fromDefaults, 'beallitasok'), 'aggregator')).toBe('alapagg')
    expect(childText(header, 'szamlaszamElotag')).toBe('ALAP')
    expect(childText(header, 'szamlaNyelve')).toBe('de')
    expect(childText(header, 'penznem')).toBe('EUR')
    expect(childText(header, 'fizmod')).toBe('Készpénz')
    expect(childText(header, 'fizetesiHataridoDatum')).toBe('2026-09-24')
    expect(childText(header, 'szamlaSablon')).toBe('SzlaAlap')
    expect(childText(header, 'logoExtra')).toBe('alaplogo')
    expect(childText(header, 'eusAfa')).toBe('true')

    const overriddenHeader = findChild(overridden, 'fejlec')
    expect(childText(findChild(overridden, 'beallitasok'), 'eszamla')).toBe('false')
    expect(childText(findChild(overridden, 'beallitasok'), 'szamlaLetoltes')).toBe('true')
    expect(childText(overriddenHeader, 'szamlaszamElotag')).toBe('WEB')
    expect(childText(overriddenHeader, 'szamlaNyelve')).toBe('en')
    expect(childText(overriddenHeader, 'penznem')).toBe('HUF')
    expect(findChild(overriddenHeader, 'arfolyamBank')).toBeUndefined()
    expect(childText(overriddenHeader, 'fizmod')).toBe('Átutalás')
    expect(childText(overriddenHeader, 'fizetesiHataridoDatum')).toBe('2026-09-19')
    expect(childText(overriddenHeader, 'szamlaSablon')).toBe('SzlaMost')
    const seller = findChild(overridden, 'elado')
    expect(childText(seller, 'bank')).toBe('OTP')
    expect(childText(seller, 'bankszamlaszam')).toBe('2222')
    expect(childText(seller, 'emailTargy')).toBe('Alap tárgy')
    expect(childText(seller, 'emailSzoveg')).toBe('Egyedi szöveg')
  })

  test.each([
    [{ email: 'a@b.hu' }, {}, 'true'],
    [{ email: 'a@b.hu', sendEmail: false }, {}, 'false'],
    [{ email: 'a@b.hu' }, { sendEmail: false }, 'false'],
    [{ email: 'a@b.hu', sendEmail: true }, { sendEmail: false }, 'true'],
    [{}, {}, 'false'],
    [{ email: '   ' }, { sendEmail: true }, 'false'],
  ] as const)('sendEmail logika: vevő %o, alapérték %o → %s', (buyer, defaults, expected) => {
    const root = build({ ...MINIMAL, buyer: { ...BUYER, ...buyer } }, defaults)

    expect(childText(findChild(root, 'vevo'), 'sendEmail')).toBe(expected)
  })

  test('a speciális karaktereket escape-eli a nevekben', () => {
    const xml = buildCreateInvoiceXml(
      CREDENTIALS,
      {},
      {
        buyer: { ...BUYER, name: 'Kovács & Fia <Bt.> "idézet"' },
        items: [{ name: 'A < B & C > D', netUnitPrice: 100, vat: 27 }],
      },
      NOW,
    )

    expect(xml).toContain('<nev>Kovács &amp; Fia &lt;Bt.&gt; &quot;idézet&quot;</nev>')
    expect(xml).toContain('<megnevezes>A &lt; B &amp; C &gt; D</megnevezes>')
    const root = parseXml(xml)
    expect(childText(findChild(root, 'vevo'), 'nev')).toBe('Kovács & Fia <Bt.> "idézet"')
  })

  test('éjfél után UTC szerint még előző nap van, de a kelt a magyar dátum', () => {
    const header = findChild(build(MINIMAL, {}, new Date('2026-09-15T22:30:00Z')), 'fejlec')

    expect(childText(header, 'keltDatum')).toBe('2026-09-16')
    expect(childText(header, 'teljesitesDatum')).toBe('2026-09-16')
  })

  test('éjfél előtt magyar idő szerint még az aznapi dátumot írja', () => {
    const header = findChild(build(MINIMAL, {}, new Date('2026-12-31T22:59:59Z')), 'fejlec')

    expect(childText(header, 'keltDatum')).toBe('2026-12-31')
  })

  test('a fizetési határidőt a kelt napjához adja hozzá hónap- és évváltáson át', () => {
    const header = findChild(
      build({ ...MINIMAL, paymentDueInDays: 8 }, {}, new Date('2026-12-31T23:30:00Z')),
      'fejlec',
    )

    expect(childText(header, 'keltDatum')).toBe('2027-01-01')
    expect(childText(header, 'fizetesiHataridoDatum')).toBe('2027-01-09')
  })

  test('explicit dátumokat Date objektumként is elfogad, magyar idő szerint', () => {
    const header = findChild(
      build({
        ...MINIMAL,
        issueDate: new Date('2026-09-15T23:00:00Z'),
        fulfillmentDate: '2026-09-10',
        dueDate: new Date('2026-10-01T10:00:00Z'),
      }),
      'fejlec',
    )

    expect(childText(header, 'keltDatum')).toBe('2026-09-16')
    expect(childText(header, 'teljesitesDatum')).toBe('2026-09-10')
    expect(childText(header, 'fizetesiHataridoDatum')).toBe('2026-10-01')
  })

  test('az üres szöveges mezőket kihagyja, így nem küld üres előtagot', () => {
    const root = build({
      ...MINIMAL,
      prefix: '',
      comment: '  ',
      orderNumber: '',
      buyer: { ...BUYER, taxNumber: '', postal: {}, ledger: {} },
      waybill: {},
      items: [{ name: 'Termék', netUnitPrice: 100, vat: 27, identifier: '', ledger: {} }],
    })

    expect(names(findChild(root, 'fejlec'))).not.toContain('szamlaszamElotag')
    expect(names(findChild(root, 'fejlec'))).not.toContain('megjegyzes')
    expect(names(findChild(root, 'vevo'))).toEqual(['nev', 'irsz', 'telepules', 'cim', 'sendEmail'])
    expect(names(findChild(root, 'fuvarlevel'))).toEqual([])
    expect(names(findPath(root, 'tetelek', 'tetel'))).not.toContain('tetelFokonyv')
  })

  test('több tételt a megadott sorrendben, speciális áfakulccsal is kiír', () => {
    const root = build({
      ...MINIMAL,
      items: [
        { name: 'Első', netUnitPrice: 1000, vat: 'AAM' },
        { name: 'Második', quantity: 2.5, unit: 'óra', netUnitPrice: 1000.4, vat: 5 },
      ],
    })
    const items = findChildren(findChild(root, 'tetelek'), 'tetel')

    expect(items.map((item) => childText(item, 'megnevezes'))).toEqual(['Első', 'Második'])
    expect(childText(items[0], 'afakulcs')).toBe('AAM')
    expect(childText(items[0], 'afaErtek')).toBe('0')
    expect(childText(items[1], 'mennyisegiEgyseg')).toBe('óra')
    expect(childText(items[1], 'nettoErtek')).toBe('2501')
    expect(childText(items[1], 'afaErtek')).toBe('125')
  })

  test('a felhasználónév-jelszó hitelesítést is a beállítások elejére teszi', () => {
    const xml = buildCreateInvoiceXml(
      [el('felhasznalo', 'user'), el('jelszo', 'pass')],
      {},
      MINIMAL,
      NOW,
    )

    expect(names(findChild(parseXml(xml), 'beallitasok')).slice(0, 3)).toEqual([
      'felhasznalo',
      'jelszo',
      'eszamla',
    ])
  })

  test('now nélkül az aktuális időt használja', () => {
    const xml = buildCreateInvoiceXml(CREDENTIALS, {}, MINIMAL)

    expect(childText(findChild(parseXml(xml), 'fejlec'), 'keltDatum')).toMatch(
      /^\d{4}-\d{2}-\d{2}$/,
    )
  })
})

describe('renderInvoiceXml előnézet', () => {
  test('előnézetnél elonezetpdf-et és PDF letöltést kér, a simpleItems elé', () => {
    const invoice = resolveInvoice({}, { ...MINIMAL, downloadPdf: false, simpleItems: true }, NOW)
    const root = parseXml(renderInvoiceXml(CREDENTIALS, invoice, { preview: true }))
    const header = findChild(root, 'fejlec')

    expect(childText(findChild(root, 'beallitasok'), 'szamlaLetoltes')).toBe('true')
    expect(childText(header, 'elonezetpdf')).toBe('true')
    expect(names(header).slice(-2)).toEqual(['elonezetpdf', 'simpleItems'])
  })

  test('előnézet nélkül nem ír elonezetpdf elemet', () => {
    const invoice = resolveInvoice({}, MINIMAL, NOW)
    const root = parseXml(renderInvoiceXml(CREDENTIALS, invoice))

    expect(names(findChild(root, 'fejlec'))).not.toContain('elonezetpdf')
  })
})
