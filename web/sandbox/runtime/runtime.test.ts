import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { SzamlazzError } from 'kassza'
import { describe, expect, test } from 'vitest'
import { EXAMPLES } from '../examples/catalog'
import { compile, SandboxSyntaxError } from './execute'
import { runSandboxCode } from './run'
import { formatPreview, serialize } from './serialize'

describe('sandbox futtatókörnyezet', () => {
  test('a közös hivatkozás nem körkörös, a valódi kör igen', () => {
    const cim = { varos: 'Budapest' }
    const kor: Record<string, unknown> = { nev: 'kör' }
    kor.onmaga = kor

    expect(formatPreview(serialize({ cim, cimek: [cim] }))).not.toContain('Körkörös')
    expect(formatPreview(serialize(kor))).toContain('[Körkörös]')
  })

  test('a PDF bájtokat felismeri, a SzamlazzError mezőit megtartja', () => {
    const pdf = new TextEncoder().encode('%PDF-1.4 minta')
    const hiba = new SzamlazzError('[57] XML beolvasási hiba.', {
      category: 'validation',
      code: 57,
    })

    expect(serialize(pdf)).toMatchObject({ t: 'bytes', pdf: true })
    expect(formatPreview(serialize(hiba))).toContain("category: 'validation'")
  })

  test('szintaktikai hibánál sort és oszlopot ad vissza', () => {
    expect(() => compile('const x = {\n  a: 1,\n  b: \n}')).toThrow(SandboxSyntaxError)
  })

  test('nem létező modul importja érthető hibát ad', async () => {
    const result = await runSandboxCode("import leftpad from 'left-pad'\nconsole.log(leftpad)", {
      onConsole: () => undefined,
      onCall: () => undefined,
    })

    expect(result.ok).toBe(false)
    expect(result.error && formatPreview(result.error.preview)).toContain(
      'nem érhető el a sandboxban',
    )
  })

  test.each(EXAMPLES.map((example) => example.slug))(
    'a(z) %s példa hiba nélkül lefut',
    async (slug) => {
      const code = await readFile(join(import.meta.dirname, '../examples', `${slug}.ts`), 'utf8')
      const result = await runSandboxCode(code, {
        onConsole: () => undefined,
        onCall: () => undefined,
      })

      expect(result.error && formatPreview(result.error.preview)).toBeUndefined()
      expect(result.ok).toBe(true)
    },
  )
})
