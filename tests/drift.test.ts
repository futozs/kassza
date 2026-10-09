import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import {
  compareSnapshots,
  consistencyProblems,
  decodeEntities,
  ipv4Addresses,
  mainText,
  renderReport,
  sha256,
  sourceErrorCodes,
  sourceIps,
  tableCodes,
} from '../scripts/drift-core.mjs'
import { AGENT_ERROR_CODES } from '../src/core/errors'
import { SZAMLAZZ_OUTBOUND_IPS } from '../src/ipn/ip'

const PAGE = `<html><head><script>var build = "abc"</script></head><body>
<nav>menü</nav><article><h1>Hibakódok</h1>
<table><tr><td>57</td><td>XML hiba &amp; leírás</td></tr><tr><td> 3 </td><td>Belépés</td></tr>
<tr><td>57</td><td>dupla</td></tr><tr><td>12345</td><td>túl hosszú</td></tr></table>
<p>IP: 3.73.214.98, 999.1.1.1 és 18.153.156.51&nbsp;cím</p></article></body></html>`

describe('drift watcher', () => {
  test('a cikk szövegét kinyeri, a scriptet és a menüt elhagyja', () => {
    const text = mainText(PAGE)
    expect(text).toContain('XML hiba & leírás')
    expect(text).not.toContain('build')
    expect(text).not.toContain('menü')
    expect(mainText('<main><b>fő</b></main>')).toBe('fő')
    expect(mainText('<p>csak</p>')).toBe('csak')
  })

  test('a táblázat hibakódjait és az IPv4 címeket egyedien, rendezve adja', () => {
    expect(tableCodes(PAGE)).toEqual([3, 57])
    expect(ipv4Addresses(mainText(PAGE))).toEqual(['18.153.156.51', '3.73.214.98'])
  })

  test('a HTML entitásokat dekódolja', () => {
    expect(decodeEntities('&lt;a&gt; &#337; &#x171; &ismeretlen;')).toBe('<a> ő ű &ismeretlen;')
  })

  test('a forráskódból a hibakód-táblát és az IP-listát olvassa', () => {
    const errors = readFileSync('src/core/errors.ts', 'utf8')
    const ip = readFileSync('src/ipn/ip.ts', 'utf8')
    expect(sourceErrorCodes(errors).sort((a, b) => a - b)).toEqual(
      Object.keys(AGENT_ERROR_CODES).map(Number),
    )
    expect(sourceIps(ip)).toEqual([...SZAMLAZZ_OUTBOUND_IPS].sort())
  })

  test('a zárolt és a friss állapot különbségét leírja', () => {
    const changes = compareSnapshots(
      { a: 'x', codes: [1, 2], gone: 'y' },
      { a: 'z', codes: [2, 3], fresh: 'q' },
    )
    expect(changes).toEqual([
      { name: 'a', kind: 'changed', detail: 'A tartalom ujjlenyomata megváltozott.' },
      { name: 'codes', kind: 'changed', detail: 'új: 3; eltűnt: 1' },
      { name: 'fresh', kind: 'new', detail: 'Új figyelt forrás, nincs zárolt értéke.' },
      { name: 'gone', kind: 'missing', detail: 'A forrás nem volt elérhető.' },
    ])
    expect(compareSnapshots({ a: [1] }, { a: [1] })).toEqual([])
  })

  test('jelzi az ismeretlen hibakódot és az eltűnt IP-címet', () => {
    expect(
      consistencyProblems({
        documentedCodes: [1, 999],
        knownCodes: [1],
        pageIps: ['1.1.1.1'],
        knownIps: ['1.1.1.1', '2.2.2.2'],
      }),
    ).toEqual([
      'A docs hibakódjai közül ezeket a kassza nem ismeri: 999.',
      'A kassza IPN IP-címei közül ezek már nem szerepelnek a docsban: 2.2.2.2.',
    ])
  })

  test('a jelentés eltérés nélkül és eltéréssel is olvasható', () => {
    expect(renderReport([], [])).toContain('Nincs eltérés.')
    const report = renderReport(
      [{ name: 'xsd:agent/xmlszamla.xsd', kind: 'changed', detail: 'x' }],
      ['probléma'],
    )
    expect(report).toContain('**xsd:agent/xmlszamla.xsd** (changed)')
    expect(report).toContain('- probléma')
    expect(report).toContain('npm run drift -- --update')
  })

  test('a zárfájl csak hash-t, kódszámot és IP-t tartalmaz', () => {
    const lock = JSON.parse(readFileSync('scripts/drift.lock.json', 'utf8')) as Record<
      string,
      unknown
    >
    for (const [name, value] of Object.entries(lock)) {
      if (Array.isArray(value)) {
        expect(
          value.every((item) => typeof item === 'number' || /^[\d.]+$/.test(String(item))),
        ).toBe(true)
      } else {
        expect(String(value), name).toMatch(/^[0-9a-f]{40,64}$/)
      }
    }
    expect(sha256('a')).toHaveLength(64)
  })
})
