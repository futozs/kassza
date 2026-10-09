import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { MAX_XML_DEPTH, parseXml, XmlParseError } from '../../src/core/xml/parse'
import { buildXmlDocument, el, escapeXml } from '../../src/core/xml/serialize'
import { parseDataLinkPush } from '../../src/data-link'
import { parseIpnNotification } from '../../src/ipn'

function allowed(value: string): string {
  let result = ''
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    const ok =
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0d ||
      (code >= 0x20 && !(code >= 0xd800 && code <= 0xdfff) && code !== 0xfffe && code !== 0xffff)
    if (ok) result += char
  }
  return result
}

const anyText = fc.string({ unit: 'binary', maxLength: 200 })

describe('XML író és olvasó', () => {
  test('az escape-elt szöveg visszaolvasva az eredeti (az érvénytelen karakterek nélkül)', () => {
    fc.assert(
      fc.property(anyText, (value) => {
        expect(parseXml(`<a>${escapeXml(value)}</a>`).text).toBe(allowed(value))
      }),
      { numRuns: 1_000 },
    )
  })

  test('attribútumban is visszaolvasható', () => {
    fc.assert(
      fc.property(anyText, (value) => {
        expect(parseXml(`<a b="${escapeXml(value)}"/>`).attributes.b).toBe(allowed(value))
      }),
      { numRuns: 500 },
    )
  })

  test('a buildXmlDocument kimenete mindig visszaolvasható', () => {
    fc.assert(
      fc.property(fc.array(anyText, { maxLength: 8 }), (values) => {
        const xml = buildXmlDocument({
          root: 'gyoker',
          namespace: 'urn:teszt',
          children: values.map((value, index) => el(`e${index}`, value)),
        })
        const parsed = parseXml(xml)
        expect(parsed.children.map((child) => child.text)).toEqual(
          values.map((value) => allowed(value)),
        )
      }),
      { numRuns: 300 },
    )
  })

  test('tetszőleges bemenetre csak XmlParseError-t dob, sosem mást, és nem akad el', () => {
    const tagLike = fc
      .array(
        fc.oneof(
          fc.constantFrom(
            '<',
            '>',
            '/',
            '<a>',
            '</a>',
            '<b/>',
            '<!--',
            '-->',
            '<![CDATA[',
            ']]>',
            '<?x',
            '?>',
            '<!DOCTYPE',
            '"',
            "'",
            '&amp;',
            '&#x1F600;',
            '&#99999999;',
            '&bogus;',
          ),
          fc.string({ maxLength: 5 }),
        ),
        { maxLength: 40 },
      )
      .map((parts) => parts.join(''))
    fc.assert(
      fc.property(fc.oneof(tagLike, anyText), (input) => {
        try {
          parseXml(input)
        } catch (error) {
          expect(error).toBeInstanceOf(XmlParseError)
        }
      }),
      { numRuns: 3_000 },
    )
  })

  test('a mélységkorlátot tartja, a korlátig elfogadja', () => {
    const nested = (depth: number) => `${'<a>'.repeat(depth)}${'</a>'.repeat(depth)}`
    expect(() => parseXml(nested(MAX_XML_DEPTH))).not.toThrow()
    expect(() => parseXml(nested(MAX_XML_DEPTH + 1))).toThrow(XmlParseError)
    expect(() => parseXml(nested(200_000))).toThrow(XmlParseError)
  })

  test('saját entitást (billion laughs) nem fejt ki', () => {
    const bomb = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;">]><r>&lol2;</r>`
    let text = ''
    try {
      text = parseXml(bomb).text
    } catch (error) {
      expect(error).toBeInstanceOf(XmlParseError)
    }
    expect(text.length).toBeLessThan(100)
  })

  test('nagy, lapos dokumentumot gyorsan olvas', () => {
    const xml = `<r>${'<i>x</i>'.repeat(100_000)}</r>`
    const started = performance.now()
    expect(parseXml(xml).children).toHaveLength(100_000)
    expect(performance.now() - started).toBeLessThan(2_000)
  })
})

describe('nem megbízható bemenetek', () => {
  test('az adatkapcsolat-feldolgozó tetszőleges XML-re csak saját hibát dob', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          anyText,
          fc.constantFrom('<szamla/>', '<nyugtak><nyugta/></nyugtak>', '<banktranz/>'),
        ),
        (input) => {
          try {
            parseDataLinkPush(input)
          } catch (error) {
            expect(error).toBeInstanceOf(Error)
            expect((error as Error).name).toMatch(/DataLinkError|XmlParseError|SzamlazzError/)
          }
        },
      ),
      { numRuns: 1_000 },
    )
  })

  test('az IPN-feldolgozó tetszőleges törzsre nem dob váratlan hibát', () => {
    fc.assert(
      fc.property(anyText, (input) => {
        try {
          parseIpnNotification(input)
        } catch (error) {
          expect((error as Error).name).toMatch(/SzamlazzError|WebhookVerificationError/)
        }
      }),
      { numRuns: 1_000 },
    )
  })
})
