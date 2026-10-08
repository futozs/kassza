import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

interface PackageJson {
  readonly exports: Readonly<
    Record<string, string | { readonly import: { readonly default: string } }>
  >
}

interface EntryApi {
  readonly values: readonly string[]
  readonly types: readonly string[]
}

const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as PackageJson

function entries(): [string, string][] {
  return Object.entries(packageJson.exports)
    .filter(([subpath, target]) => subpath !== './package.json' && typeof target !== 'string')
    .map(([subpath, target]) => {
      const dist = (target as { import: { default: string } }).import.default
      const source = dist.replace(/^\.\/dist\//, 'src/').replace(/\.js$/, '.ts')
      return [subpath === '.' ? 'kassza' : `kassza/${subpath.slice(2)}`, source]
    })
}

function resolveModule(from: string, specifier: string): string {
  const base = resolve(dirname(from), specifier)
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    try {
      readFileSync(candidate)
      return candidate
    } catch {}
  }
  throw new Error(`Nem található modul: ${specifier} (${from})`)
}

function exportedNames(file: string, seen: Set<string> = new Set()): EntryApi {
  if (seen.has(file)) return { values: [], types: [] }
  seen.add(file)
  const source = readFileSync(file, 'utf8')
  const values = new Set<string>()
  const types = new Set<string>()
  for (const match of source.matchAll(/export\s+(type\s+)?\{([^}]*)\}/g)) {
    const typeOnly = Boolean(match[1])
    for (const raw of (match[2] ?? '').split(',')) {
      const part = raw.trim()
      if (!part) continue
      const isType = typeOnly || part.startsWith('type ')
      const name = part
        .replace(/^type\s+/, '')
        .split(/\s+as\s+/)
        .pop()
        ?.trim()
      if (!name) continue
      ;(isType ? types : values).add(name)
    }
  }
  for (const match of source.matchAll(
    /^export\s+(?:declare\s+)?(?:async\s+)?(function|const|let|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm,
  )) {
    const kind = match[1]
    const name = match[2] as string
    ;(kind === 'interface' || kind === 'type' ? types : values).add(name)
  }
  for (const match of source.matchAll(/export\s*\*\s*from\s*'([^']+)'/g)) {
    const nested = exportedNames(resolveModule(file, match[1] as string), seen)
    for (const name of nested.values) values.add(name)
    for (const name of nested.types) types.add(name)
  }
  return { values: [...values].sort(), types: [...types].sort() }
}

describe('nyilvános API', () => {
  test('minden belépési pont futásidejű exportja megegyezik a forrásban deklarálttal', async () => {
    for (const [name, source] of entries()) {
      const module = (await import(join(root, source))) as Record<string, unknown>
      expect(Object.keys(module).sort(), name).toEqual(exportedNames(join(root, source)).values)
    }
  })

  test('a publikus felület csak tudatos döntéssel változik (pillanatkép)', async () => {
    const api = Object.fromEntries(
      entries().map(([name, source]) => [name, exportedNames(join(root, source))]),
    )
    await expect(`${JSON.stringify(api, null, 2)}\n`).toMatchFileSnapshot(
      './__snapshots__/public-api.json',
    )
  })
})
