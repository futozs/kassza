import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'
import { ERROR_PAGES_DIR, hungarianSuffix, renderErrorPages } from '../scripts/error-pages-core.mjs'
import { AGENT_ERROR_CODES, errorCodeDocsUrl } from '../src/core/errors'

describe('hibakód-oldalak', () => {
  test('a weboldal oldalai szinkronban vannak a hibakód-táblával (npm run build && node scripts/error-pages.mjs)', () => {
    const files = renderErrorPages(AGENT_ERROR_CODES)
    expect(readdirSync(ERROR_PAGES_DIR).sort()).toEqual([...files.keys()].sort())
    for (const [name, content] of files) {
      expect(readFileSync(join(ERROR_PAGES_DIR, name), 'utf8'), name).toBe(content)
    }
  })

  test('minden docsUrl létező oldalra mutat', () => {
    for (const code of Object.keys(AGENT_ERROR_CODES).map(Number)) {
      const url = errorCodeDocsUrl(code) ?? ''
      expect(readdirSync(ERROR_PAGES_DIR)).toContain(`${url.split('/').at(-1)}.mdx`)
    }
  })

  test('a magyar toldalék a szám kiejtéséhez illeszkedik', () => {
    const cases: [number, string][] = [
      [1, 'es'],
      [3, 'as'],
      [5, 'ös'],
      [6, 'os'],
      [7, 'es'],
      [8, 'as'],
      [10, 'es'],
      [20, 'as'],
      [52, 'es'],
      [53, 'as'],
      [55, 'ös'],
      [56, 'os'],
      [57, 'es'],
      [68, 'as'],
      [71, 'es'],
      [100, 'as'],
      [101, 'es'],
      [200, 'as'],
      [250, 'es'],
      [260, 'as'],
      [340, 'es'],
      [1000, 'es'],
    ]
    for (const [number, suffix] of cases)
      expect(hungarianSuffix(number), String(number)).toBe(suffix)
  })

  test('a docs főmenüjében szerepel', () => {
    const meta = JSON.parse(readFileSync('web/content/docs/meta.json', 'utf8')) as {
      pages: string[]
    }
    expect(meta.pages).toContain('hibakodok')
  })
})
