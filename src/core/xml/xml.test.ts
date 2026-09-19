import { describe, expect, test } from 'vitest'
import {
  childBoolean,
  childNumber,
  childText,
  findChildren,
  findPath,
  parseXml,
  XmlParseError,
} from './parse'
import { buildXmlDocument, el, escapeXml, formatXmlNumber, optionalEl } from './serialize'

const BOM = String.fromCharCode(0xfeff)

describe('escapeXml', () => {
  test('az öt XML speciális karaktert escape-eli', () => {
    expect(escapeXml(`Kiss & Fia <"Bt.">'`)).toBe('Kiss &amp; Fia &lt;&quot;Bt.&quot;&gt;&apos;')
  })

  test('kiszűri az XML-ben tiltott vezérlőkaraktereket, a tabot és sortörést megtartja', () => {
    const dirty = [
      'a',
      String.fromCharCode(0),
      'b',
      String.fromCharCode(8),
      'c\td\ne\rf',
      String.fromCharCode(0xfffe),
      'g',
    ].join('')
    expect(escapeXml(dirty)).toBe('abc\td\ne\rfg')
  })

  test('az ékezetes és emoji karaktereket változatlanul hagyja', () => {
    expect(escapeXml('Árvíztűrő tükörfúrógép 🧾')).toBe('Árvíztűrő tükörfúrógép 🧾')
  })
})

describe('formatXmlNumber', () => {
  test('egész számot tizedesjegy nélkül ír', () => {
    expect(formatXmlNumber(1500)).toBe('1500')
    expect(formatXmlNumber(-3)).toBe('-3')
  })

  test('tört számot exponenciális alak és lebegőpontos zaj nélkül ír', () => {
    expect(formatXmlNumber(393.66)).toBe('393.66')
    expect(formatXmlNumber(0.1 + 0.2)).toBe('0.3')
    expect(formatXmlNumber(1e-7)).toBe('0.0000001')
  })

  test('negatív nullát nullaként ír', () => {
    expect(formatXmlNumber(-0.00000000001)).toBe('0')
  })

  test('nem véges számra RangeError-t dob', () => {
    expect(() => formatXmlNumber(Number.NaN)).toThrow(RangeError)
    expect(() => formatXmlNumber(Number.POSITIVE_INFINITY)).toThrow(RangeError)
  })

  test('a biztonságos egész tartományon kívüli számra RangeError-t dob', () => {
    expect(formatXmlNumber(Number.MAX_SAFE_INTEGER)).toBe('9007199254740991')
    expect(() => formatXmlNumber(1e21)).toThrow(RangeError)
    expect(() => formatXmlNumber(-(2 ** 60))).toThrow(RangeError)
  })
})

describe('buildXmlDocument', () => {
  test('sorrendtartóan építi fel a dokumentumot, és kihagyja a hiányzó elemeket', () => {
    const xml = buildXmlDocument({
      root: 'xmlszamla',
      namespace: 'http://www.szamlazz.hu/xmlszamla',
      schemaLocation: 'https://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamla.xsd',
      children: [
        el('beallitasok', [
          el('eszamla', false),
          optionalEl('aggregator', undefined),
          el('valaszVerzio', 2),
        ]),
        undefined,
        false,
        el('fejlec', [el('megjegyzes', 'A & B'), el('ures', ''), el('nincs', null)]),
        optionalEl('ures_csoport', [undefined, false]),
      ],
    })

    expect(xml).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<xmlszamla xmlns="http://www.szamlazz.hu/xmlszamla" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.szamlazz.hu/xmlszamla https://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamla.xsd">',
        '  <beallitasok>',
        '    <eszamla>false</eszamla>',
        '    <valaszVerzio>2</valaszVerzio>',
        '  </beallitasok>',
        '  <fejlec>',
        '    <megjegyzes>A &amp; B</megjegyzes>',
        '    <ures></ures>',
        '    <nincs></nincs>',
        '  </fejlec>',
        '</xmlszamla>',
        '',
      ].join('\n'),
    )
  })

  test('schemaLocation nélkül csak az alap névteret írja ki', () => {
    const xml = buildXmlDocument({
      root: 'xmlnyugtaget',
      namespace: 'http://www.szamlazz.hu/xmlnyugtaget',
      children: [el('csoport', [])],
    })

    expect(xml).toContain('<xmlnyugtaget xmlns="http://www.szamlazz.hu/xmlnyugtaget">')
    expect(xml).toContain('<csoport></csoport>')
    expect(xml).not.toContain('xsi:')
  })

  test('az optionalEl üres csoportot és null értéket kihagy, a nem üreset megtartja', () => {
    expect(optionalEl('a', null)).toBeUndefined()
    expect(optionalEl('a', [undefined])).toBeUndefined()
    expect(optionalEl('a', 0)).toEqual({ name: 'a', content: 0 })
    expect(optionalEl('a', [el('b', 1)])).toEqual({
      name: 'a',
      content: [{ name: 'b', content: 1 }],
    })
  })

  test('a saját kimenetét a parser vissza tudja olvasni', () => {
    const xml = buildXmlDocument({
      root: 'gyoker',
      namespace: 'urn:teszt',
      children: [el('nev', `Kovács & <Társa> "Kft."`), el('osszeg', 1234.5), el('aktiv', true)],
    })

    const root = parseXml(xml)

    expect(childText(root, 'nev')).toBe('Kovács & <Társa> "Kft."')
    expect(childNumber(root, 'osszeg')).toBe(1234.5)
    expect(childBoolean(root, 'aktiv')).toBe(true)
  })
})

describe('parseXml', () => {
  test('levágja a namespace prefixet, és beolvassa az attribútumokat', () => {
    const root = parseXml(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
      <ns1:Valasz xmlns:ns1="urn:a" xmlns:ns2='urn:b' tipus="teszt">
        <ns2:taxpayerId>13421739</ns2:taxpayerId>
      </ns1:Valasz>`,
    )

    expect(root.name).toBe('Valasz')
    expect(root.attributes).toEqual({ 'xmlns:ns1': 'urn:a', 'xmlns:ns2': 'urn:b', tipus: 'teszt' })
    expect(childText(root, 'taxpayerId')).toBe('13421739')
  })

  test('kezeli a CDATA-t, a kommentet, a DOCTYPE-ot és a BOM-ot', () => {
    const root = parseXml(
      `${BOM}<!DOCTYPE valasz><valasz><!-- megjegyzés --><hibauzenet><![CDATA[Hiba <b> & vége]]></hibauzenet></valasz>`,
    )

    expect(childText(root, 'hibauzenet')).toBe('Hiba <b> & vége')
  })

  test('dekódolja a nevesített és a numerikus entitásokat, az ismeretlent érintetlenül hagyja', () => {
    const root = parseXml('<a><b>&lt;&gt;&amp;&quot;&apos;&#337;&#x171;&nbsp;</b></a>')

    expect(childText(root, 'b')).toBe(`<>&"'őű&nbsp;`)
  })

  test('az érvénytelen kódpontú numerikus entitást érintetlenül hagyja', () => {
    const root = parseXml('<a><b>&#x110000;&#99999999999999999999;&#xD800;&#65;</b></a>')

    expect(childText(root, 'b')).toBe('&#x110000;&#99999999999999999999;&#xD800;A')
  })

  test('a > jelet tartalmazó attribútumértéket nem vágja el', () => {
    const root = parseXml('<a title="x > y" note=\'a>b\'><b>szöveg</b></a>')

    expect(root.attributes).toEqual({ title: 'x > y', note: 'a>b' })
    expect(childText(root, 'b')).toBe('szöveg')
  })

  test('lezáratlan idézőjelű attribútumnál XmlParseError-t dob', () => {
    expect(() => parseXml('<a title="x>y</a>')).toThrow(XmlParseError)
  })

  test('önzáró elemeket és azonos nevű testvéreket is kezel', () => {
    const root = parseXml(
      '<tetelek><tetel><nev>A</nev></tetel><ures/><tetel><nev>B</nev></tetel></tetelek>',
    )

    expect(findChildren(root, 'tetel').map((tetel) => childText(tetel, 'nev'))).toEqual(['A', 'B'])
    expect(childText(root, 'ures')).toBeUndefined()
    expect(findChildren(undefined, 'tetel')).toEqual([])
  })

  test('mélyen beágyazott útvonalat is megtalál', () => {
    const root = parseXml('<a><b><c><d>érték</d></c></b></a>')

    expect(findPath(root, 'b', 'c', 'd')?.text).toBe('érték')
    expect(findPath(root, 'b', 'x', 'd')).toBeUndefined()
  })

  test.each([
    ['lezáratlan elem', '<a><b></b>'],
    ['rossz záró tag', '<a></b>'],
    ['két gyökérelem', '<a></a><b></b>'],
    ['üres dokumentum', '   '],
    ['lezáratlan CDATA', '<a><![CDATA[x</a>'],
    ['lezáratlan komment', '<a><!-- x </a>'],
    ['lezáratlan tag', '<a'],
    ['név nélküli tag', '< ></>'],
  ])('hibás XML-re XmlParseError-t dob: %s', (_name, xml) => {
    expect(() => parseXml(xml)).toThrow(XmlParseError)
  })
})

describe('child helperek', () => {
  const root = parseXml(
    '<r><szam> 1234,5 </szam><rossz>abc</rossz><igaz>TRUE</igaz><egy>1</egy><hamis>false</hamis><nulla>0</nulla><mas>igen</mas><ures>  </ures></r>',
  )

  test('a childText levágja a whitespace-t, az üreset undefined-ként adja', () => {
    expect(childText(root, 'szam')).toBe('1234,5')
    expect(childText(root, 'ures')).toBeUndefined()
    expect(childText(root, 'nincs')).toBeUndefined()
  })

  test('a childNumber a tizedesvesszőt is kezeli, a nem számot undefined-ként adja', () => {
    expect(childNumber(root, 'szam')).toBe(1234.5)
    expect(childNumber(root, 'rossz')).toBeUndefined()
    expect(childNumber(root, 'nincs')).toBeUndefined()
  })

  test('a childBoolean a true/false és 1/0 értékeket ismeri fel', () => {
    expect(childBoolean(root, 'igaz')).toBe(true)
    expect(childBoolean(root, 'egy')).toBe(true)
    expect(childBoolean(root, 'hamis')).toBe(false)
    expect(childBoolean(root, 'nulla')).toBe(false)
    expect(childBoolean(root, 'mas')).toBeUndefined()
  })
})
