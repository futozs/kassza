import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { createTestContext, type MockResponse, TEST_AGENT_KEY } from '../../tests/helpers'
import { SzamlazzError } from '../core/errors'
import { el } from '../core/xml/serialize'
import {
  buildQueryTaxpayerXml,
  parseQueryTaxpayerResponse,
  queryTaxpayer,
  toTaxpayerId,
} from './query-taxpayer'

const DOCS_XSD_PAGE = join(
  import.meta.dirname,
  '..',
  '..',
  '.research',
  'docs-agent',
  'hu_agent_querying_taxpayer_xml.md',
)

function extractDocsXsd(): string | undefined {
  if (!existsSync(DOCS_XSD_PAGE)) return undefined
  const page = readFileSync(DOCS_XSD_PAGE, 'utf8')
  const start = page.lastIndexOf('<?xml', page.indexOf('<schema'))
  const end = page.indexOf('</schema>')
  if (start === -1 || end === -1) return undefined
  return page.slice(start, end + '</schema>'.length)
}

const docsXsd = extractDocsXsd()
const xmllintAvailable = spawnSync('xmllint', ['--version']).status === 0

function validateAgainstDocsXsd(xml: string): string[] {
  const directory = mkdtempSync(join(tmpdir(), 'szamlazz-taxpayer-xsd-'))
  try {
    const schemaFile = join(directory, 'xmltaxpayer.xsd')
    const xmlFile = join(directory, 'request.xml')
    writeFileSync(schemaFile, docsXsd ?? '')
    writeFileSync(xmlFile, xml)
    const result = spawnSync('xmllint', ['--noout', '--schema', schemaFile, xmlFile], {
      encoding: 'utf8',
    })
    if (result.status === 0) return []
    return result.stderr
      .split('\n')
      .filter((line) => line.trim() !== '' && !line.includes('validat'))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

const NAV_NS =
  'xmlns="http://schemas.nav.gov.hu/OSA/3.0/api" xmlns:ns2="http://schemas.nav.gov.hu/OSA/3.0/base" xmlns:ns3="http://schemas.nav.gov.hu/NTCA/1.0/common"'

function navResponse(inner: string): MockResponse {
  return {
    headers: { 'content-type': 'application/xml; charset=UTF-8' },
    body: `<?xml version="1.0" encoding="UTF-8"?>\n<QueryTaxpayerResponse ${NAV_NS}>\n${inner}\n</QueryTaxpayerResponse>`,
  }
}

const HEADER = `<header><requestId>38046_g2z6726bg67ymdt3p56bg6</requestId><timestamp>2020-11-04T11:26:50.456Z</timestamp><requestVersion>2.0</requestVersion></header>`

const DOCS_SUCCESS = navResponse(`${HEADER}
<result><funcCode>OK</funcCode></result>
<software><softwareId>SZAMLAZZHU34540973</softwareId></software>
<infoDate>2004-12-26T23:00:00.000Z</infoDate>
<taxpayerValidity>true</taxpayerValidity>
<taxpayerData>
  <taxpayerName>KBOSS.HU KERESKEDELMI ÉS SZOLGÁLTATÓ KORLÁTOLT FELELŐSSÉGŰ TÁRSASÁG</taxpayerName>
  <taxNumberDetail><ns2:taxpayerId>13421739</ns2:taxpayerId><ns2:vatCode>2</ns2:vatCode></taxNumberDetail>
  <taxpayerAddressList>
    <taxpayerAddressItem>
      <taxpayerAddressType>HQ</taxpayerAddressType>
      <taxpayerAddress>
        <ns2:countryCode>HU</ns2:countryCode>
        <ns2:postalCode>1031</ns2:postalCode>
        <ns2:city>BUDAPEST</ns2:city>
        <ns2:streetName>ZÁHONY</ns2:streetName>
        <ns2:publicPlaceCategory>UTCA</ns2:publicPlaceCategory>
        <ns2:number>7.</ns2:number>
      </taxpayerAddress>
    </taxpayerAddressItem>
  </taxpayerAddressList>
</taxpayerData>`)

const FULL_SUCCESS = navResponse(`${HEADER}
<result><funcCode>OK</funcCode></result>
<infoDate>2021-03-01T00:00:00.000Z</infoDate>
<taxpayerValidity>true</taxpayerValidity>
<taxpayerData>
  <taxpayerName>PÉLDA KERESKEDELMI KORLÁTOLT FELELŐSSÉGŰ TÁRSASÁG</taxpayerName>
  <taxpayerShortName>PÉLDA KFT.</taxpayerShortName>
  <taxNumberDetail>
    <ns2:taxpayerId>12345676</ns2:taxpayerId>
    <ns2:vatCode>4</ns2:vatCode>
    <ns2:countyCode>42</ns2:countyCode>
  </taxNumberDetail>
  <incorporation>ORGANIZATION</incorporation>
  <vatGroupMembership>17712345</vatGroupMembership>
  <taxpayerAddressList>
    <taxpayerAddressItem>
      <taxpayerAddressType>SITE</taxpayerAddressType>
      <taxpayerAddress>
        <ns2:countryCode>HU</ns2:countryCode>
        <ns2:region>PEST</ns2:region>
        <ns2:postalCode>2000</ns2:postalCode>
        <ns2:city>SZENTENDRE</ns2:city>
        <ns2:lotNumber>1234/5</ns2:lotNumber>
      </taxpayerAddress>
    </taxpayerAddressItem>
    <taxpayerAddressItem>
      <taxpayerAddressType>HQ</taxpayerAddressType>
      <taxpayerAddress>
        <ns2:countryCode>HU</ns2:countryCode>
        <ns2:postalCode>1111</ns2:postalCode>
        <ns2:city>BUDAPEST XI.</ns2:city>
        <ns2:streetName>BAJCSY-ZSILINSZKY</ns2:streetName>
        <ns2:publicPlaceCategory>ÚT</ns2:publicPlaceCategory>
        <ns2:number>12</ns2:number>
        <ns2:building>B</ns2:building>
        <ns2:staircase>2</ns2:staircase>
        <ns2:floor>3</ns2:floor>
        <ns2:door>14</ns2:door>
      </taxpayerAddress>
    </taxpayerAddressItem>
    <taxpayerAddressItem>
      <taxpayerAddressType>branch</taxpayerAddressType>
      <taxpayerAddress>
        <ns2:countryCode>at</ns2:countryCode>
        <ns2:postalCode>1010</ns2:postalCode>
        <ns2:city>Wien</ns2:city>
        <ns2:streetName>Stephansplatz</ns2:streetName>
        <ns2:number>1/A</ns2:number>
      </taxpayerAddress>
    </taxpayerAddressItem>
  </taxpayerAddressList>
</taxpayerData>`)

const DOCS_ERROR =
  navResponse(`<header><requestId>-</requestId><timestamp>2020-11-04T11:31:27.122Z</timestamp></header>
<result>
  <funcCode>ERROR</funcCode>
  <errorCode>57</errorCode>
  <message>XML beolvasási hiba. cvc-pattern-valid: Value '1342173' is not facet-valid with respect to pattern '[0-9]{8}' for type 'torszszamTipus'.</message>
</result>`)

const DOCS_INVALID = navResponse(`${HEADER}
<result><funcCode>OK</funcCode></result>
<taxpayerValidity>false</taxpayerValidity>`)

describe('toTaxpayerId', () => {
  test.each([
    ['12345678', '12345678'],
    ['12345678-2-42', '12345678'],
    ['12345678242', '12345678'],
    [' 1234 5678 - 2 - 42 ', '12345678'],
    ['HU12345678', '12345678'],
  ])('%j → %s', (input, expected) => {
    expect(toTaxpayerId(input)).toBe(expected)
  })

  test.each(['1234567', '123456789', '1234567a', '', '12345678-2-4'])(
    'érvénytelen formátumra validation hibát dob: %j',
    (input) => {
      expect(() => toTaxpayerId(input)).toThrow(
        expect.objectContaining({ category: 'validation', action: 'queryTaxpayer' }),
      )
    },
  )

  test('nem szöveg bemenetre is validation hibát dob', () => {
    expect(() => toTaxpayerId(12345678 as unknown as string)).toThrow(SzamlazzError)
  })
})

describe('buildQueryTaxpayerXml', () => {
  test('a törzsszámot és a hitelesítést a kötött sorrendben írja', () => {
    const xml = buildQueryTaxpayerXml([el('szamlaagentkulcs', TEST_AGENT_KEY)], '13421739-2-41')

    expect(xml).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<xmltaxpayer xmlns="http://www.szamlazz.hu/xmltaxpayer" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.szamlazz.hu/xmltaxpayer http://www.szamlazz.hu/docs/xsds/agent/xmltaxpayer.xsd">',
        '  <beallitasok>',
        `    <szamlaagentkulcs>${TEST_AGENT_KEY}</szamlaagentkulcs>`,
        '  </beallitasok>',
        '  <torzsszam>13421739</torzsszam>',
        '</xmltaxpayer>',
        '',
      ].join('\n'),
    )
  })

  describe.skipIf(!xmllintAvailable || docsXsd === undefined)('XSD szerződés (docs séma)', () => {
    test('Agent kulcsos kérés megfelel az XSD-nek', () => {
      const xml = buildQueryTaxpayerXml([el('szamlaagentkulcs', TEST_AGENT_KEY)], '13421739')
      expect(validateAgainstDocsXsd(xml)).toEqual([])
    })

    test('felhasználónév és jelszó párossal is megfelel az XSD-nek', () => {
      const xml = buildQueryTaxpayerXml(
        [el('felhasznalo', 'user'), el('jelszo', 'pass')],
        '12345678-2-42',
      )
      expect(validateAgainstDocsXsd(xml)).toEqual([])
    })

    test('a validátor tényleg jelez hibás kérésre', () => {
      const xml = buildQueryTaxpayerXml([], '13421739').replace('13421739', '1342173')
      expect(validateAgainstDocsXsd(xml)).not.toEqual([])
    })
  })
})

describe('queryTaxpayer', () => {
  test('a megfelelő form mezőben küldi a kérést, és feldolgozza a docs minta válaszát', async () => {
    const { ctx, agent } = createTestContext(DOCS_SUCCESS)

    const result = await queryTaxpayer(ctx, '13421739-2-41')

    expect(agent.lastCall().field).toBe('action-szamla_agent_taxpayer')
    expect(agent.lastCall().xml).toContain('<torzsszam>13421739</torzsszam>')
    expect(result).toEqual({
      valid: true,
      name: 'KBOSS.HU KERESKEDELMI ÉS SZOLGÁLTATÓ KORLÁTOLT FELELŐSSÉGŰ TÁRSASÁG',
      shortName: undefined,
      taxNumber: {
        taxpayerId: '13421739',
        vatCode: '2',
        countyCode: undefined,
        formatted: undefined,
      },
      address: result.addresses[0],
      addresses: [
        {
          type: 'HQ',
          countryCode: 'HU',
          region: undefined,
          postalCode: '1031',
          city: 'Budapest',
          street: 'Záhony',
          publicPlaceCategory: 'utca',
          number: '7.',
          building: undefined,
          staircase: undefined,
          floor: undefined,
          door: undefined,
          lotNumber: undefined,
          formatted: '1031 Budapest, Záhony utca 7.',
          raw: {
            countryCode: 'HU',
            region: undefined,
            postalCode: '1031',
            city: 'BUDAPEST',
            streetName: 'ZÁHONY',
            publicPlaceCategory: 'UTCA',
            number: '7.',
            building: undefined,
            staircase: undefined,
            floor: undefined,
            door: undefined,
            lotNumber: undefined,
          },
        },
      ],
      incorporation: undefined,
      vatGroupMembership: undefined,
      infoDate: '2004-12-26T23:00:00.000Z',
      requestId: '38046_g2z6726bg67ymdt3p56bg6',
    })
  })

  test('érvénytelen formátumnál nem küld kérést', async () => {
    const { ctx, agent } = createTestContext(DOCS_SUCCESS)

    await expect(queryTaxpayer(ctx, '1234')).rejects.toMatchObject({ category: 'validation' })
    expect(agent.calls).toHaveLength(0)
  })

  test('lekérdezésként hálózati hiba után újrapróbálható', async () => {
    const { ctx, agent } = createTestContext([new TypeError('fetch failed'), DOCS_INVALID])

    await expect(queryTaxpayer(ctx, '13421739')).resolves.toMatchObject({ valid: false })
    expect(agent.calls).toHaveLength(2)
  })

  test('továbbadja az AbortSignalt', async () => {
    const { ctx } = createTestContext(DOCS_SUCCESS)
    const controller = new AbortController()
    controller.abort(new Error('megszakítva'))

    await expect(queryTaxpayer(ctx, '13421739', { signal: controller.signal })).rejects.toThrow(
      'megszakítva',
    )
  })
})

describe('parseQueryTaxpayerResponse', () => {
  async function parse(response: MockResponse) {
    const { ctx } = createTestContext(response)
    return ctx.execute({ action: 'queryTaxpayer', xml: '<x/>' }, parseQueryTaxpayerResponse)
  }

  test('a NAV összes ismert mezőjét feldolgozza', async () => {
    const result = await parse(FULL_SUCCESS)

    expect(result).toMatchObject({
      valid: true,
      name: 'PÉLDA KERESKEDELMI KORLÁTOLT FELELŐSSÉGŰ TÁRSASÁG',
      shortName: 'PÉLDA KFT.',
      taxNumber: {
        taxpayerId: '12345676',
        vatCode: '4',
        countyCode: '42',
        formatted: '12345676-4-42',
      },
      incorporation: 'ORGANIZATION',
      vatGroupMembership: '17712345',
      infoDate: '2021-03-01T00:00:00.000Z',
    })
    expect(result.addresses).toHaveLength(3)
    expect(result.address?.type).toBe('HQ')
  })

  test('a HQ címet olvasható formára hozza, és megőrzi az eredetit', async () => {
    const { address } = await parse(FULL_SUCCESS)

    expect(address).toMatchObject({
      postalCode: '1111',
      city: 'Budapest XI.',
      street: 'Bajcsy-Zsilinszky',
      publicPlaceCategory: 'út',
      number: '12',
      building: 'B',
      staircase: '2',
      floor: '3',
      door: '14',
      formatted: '1111 Budapest XI., Bajcsy-Zsilinszky út 12. B ép. 2. lh. 3. em. 14. ajtó',
      raw: { city: 'BUDAPEST XI.', streetName: 'BAJCSY-ZSILINSZKY', publicPlaceCategory: 'ÚT' },
    })
  })

  test('helyrajzi számos telephelyet és régiót kezel', async () => {
    const { addresses } = await parse(FULL_SUCCESS)

    expect(addresses[0]).toMatchObject({
      type: 'SITE',
      region: 'Pest',
      city: 'Szentendre',
      street: undefined,
      lotNumber: '1234/5',
      formatted: '2000 Szentendre, hrsz. 1234/5',
    })
  })

  test('a vegyes kis- és nagybetűs értékeket nem alakítja át, a külföldi országkódot kiírja', async () => {
    const { addresses } = await parse(FULL_SUCCESS)

    expect(addresses[2]).toMatchObject({
      type: 'BRANCH',
      countryCode: 'AT',
      city: 'Wien',
      street: 'Stephansplatz',
      formatted: '1010 Wien, Stephansplatz 1/A, AT',
    })
  })

  test('HQ hiányában az első címet adja vissza', async () => {
    const result = await parse(
      navResponse(`<result><funcCode>OK</funcCode></result>
<taxpayerData>
  <taxpayerName>Minta Bt.</taxpayerName>
  <taxNumberDetail><taxpayerId>12345676</taxpayerId></taxNumberDetail>
  <taxpayerAddressList>
    <taxpayerAddressItem><taxpayerAddressType>SITE</taxpayerAddressType><taxpayerAddress><city>GYŐR</city></taxpayerAddress></taxpayerAddressItem>
    <taxpayerAddressItem><taxpayerAddress><postalCode>9000</postalCode></taxpayerAddress></taxpayerAddressItem>
  </taxpayerAddressList>
</taxpayerData>`),
    )

    expect(result.valid).toBe(true)
    expect(result.requestId).toBeUndefined()
    expect(result.address).toMatchObject({
      type: 'SITE',
      countryCode: '',
      postalCode: '',
      city: 'Győr',
      formatted: 'Győr',
    })
    expect(result.addresses[1]).toMatchObject({ type: '', city: '', formatted: '9000' })
  })

  test('cím és adószám részletek nélkül is toleráns', async () => {
    const result = await parse(
      navResponse(`<result><funcCode>OK</funcCode></result>
<taxpayerValidity>true</taxpayerValidity>
<taxpayerData><taxpayerName>Minta</taxpayerName></taxpayerData>`),
    )

    expect(result).toMatchObject({ valid: true, name: 'Minta', addresses: [] })
    expect(result.taxNumber).toBeUndefined()
    expect(result.address).toBeUndefined()
  })

  test('taxpayerValidity=false esetén nem hiba, hanem valid: false', async () => {
    await expect(parse(DOCS_INVALID)).resolves.toEqual({
      valid: false,
      addresses: [],
      infoDate: undefined,
      requestId: '38046_g2z6726bg67ymdt3p56bg6',
    })
  })

  test('taxpayerValidity=true, de adatok nélkül valid: true, üres címlistával', async () => {
    const result = await parse(
      navResponse(
        '<result><funcCode>OK</funcCode></result><taxpayerValidity>true</taxpayerValidity>',
      ),
    )

    expect(result).toMatchObject({ valid: true, addresses: [] })
  })

  test('funcCode ERROR esetén a hibakód alapján típusos hibát dob', async () => {
    const error = await parse(DOCS_ERROR).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(SzamlazzError)
    expect(error).toMatchObject({ code: 57, category: 'validation', action: 'queryTaxpayer' })
    expect((error as SzamlazzError).message).toMatch(/^\[57\] XML beolvasási hiba\. cvc-pattern/)
  })

  test('szöveges NAV hibakódot az üzenetbe tesz', async () => {
    const error = await parse(
      navResponse(
        '<result><funcCode>ERROR</funcCode><errorCode>INVALID_SECURITY_USER</errorCode><message>Helytelen authentikációs adatok</message></result>',
      ),
    ).catch((caught: unknown) => caught)

    expect(error).toMatchObject({
      code: undefined,
      category: 'unknown',
      message: 'INVALID_SECURITY_USER: Helytelen authentikációs adatok',
    })
  })

  test('csak hibakóddal vagy csak funcCode-dal is hibát dob', async () => {
    await expect(
      parse(navResponse('<result><funcCode>error</funcCode></result>')),
    ).rejects.toMatchObject({ message: 'Ismeretlen hiba a Számlázz.hu válaszában.' })
    await expect(
      parse(
        navResponse(
          '<result><funcCode>ERROR</funcCode><errorCode>OPERATION_FAILED</errorCode></result>',
        ),
      ),
    ).rejects.toMatchObject({ message: 'OPERATION_FAILED' })
  })

  test('a Számlázz.hu szöveges és fejléces hibáit is kezeli', async () => {
    await expect(
      parse({
        headers: { szlahu_error_code: '3', szlahu_error: 'Sikertelen%20bejelentkez%C3%A9s' },
        body: '[ERR] Sikertelen bejelentkezés',
      }),
    ).rejects.toMatchObject({ code: 3, category: 'auth' })
  })

  test('Számlázz.hu XML hibaválaszt is típusos hibává alakít', async () => {
    await expect(
      parse({
        body: '<?xml version="1.0"?><xmlszamlavalasz><sikeres>false</sikeres><hibakod>136</hibakod><hibauzenet>Belépési hiba</hibauzenet></xmlszamlavalasz>',
      }),
    ).rejects.toMatchObject({ code: 136, category: 'account' })
  })

  test('más gyökérelemű XML-re váratlan válasz hibát dob', async () => {
    await expect(parse({ body: '<?xml version="1.0"?><valami/>' })).rejects.toMatchObject({
      category: 'unexpected_response',
    })
  })

  test('nem XML válaszra váratlan válasz hibát dob', async () => {
    await expect(parse({ body: 'hello' })).rejects.toMatchObject({
      category: 'unexpected_response',
    })
  })
})
