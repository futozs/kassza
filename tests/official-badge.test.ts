import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

const FILE = 'hivatalos-szamlazz-plugin.svg'
const COPIES = ['assets', 'readme/assets', 'web/public'].map((dir) =>
  join(import.meta.dirname, '..', dir, FILE),
)

describe('hivatalos Számlázz.hu plugin jelvény', () => {
  test('mindhárom példány bájtra azonos', () => {
    const [first, ...rest] = COPIES.map((path) => readFileSync(path, 'utf8'))
    for (const copy of rest) expect(copy).toBe(first)
  })

  test('érvényes, akadálymentes SVG', () => {
    const svg = readFileSync(COPIES[0] ?? '', 'utf8')
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true)
    expect(svg).toContain('<title>Hivatalos Számlázz.hu plugin</title>')
    expect(svg).toContain('role="img"')
  })
})
