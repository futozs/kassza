import { readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const limits = JSON.parse(readFileSync(join(root, 'scripts', 'size-limits.json'), 'utf8'))
const IMPORT_PATTERN =
  /(?:^|[;\n])\s*(?:import|export)\s*(?:[^'"]*?\sfrom\s*)?['"](\.{1,2}\/[^'"]+)['"]/g

function closure(entry, seen = new Set()) {
  if (seen.has(entry)) return seen
  seen.add(entry)
  const source = readFileSync(entry, 'utf8')
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    closure(resolve(dirname(entry), match[1]), seen)
  }
  return seen
}

function measure(files) {
  let raw = 0
  let gzip = 0
  for (const file of files) {
    const content = readFileSync(file)
    raw += content.byteLength
    gzip += gzipSync(content, { level: 9 }).byteLength
  }
  return { raw, gzip }
}

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`
const update = process.argv.includes('--print')
let failed = 0
const rows = []
for (const [subpath, target] of Object.entries(pkg.exports)) {
  if (typeof target === 'string') continue
  const entry = join(root, target.import.default)
  const files = closure(entry)
  const { raw, gzip } = measure(files)
  const name = subpath === '.' ? 'kassza' : `kassza/${subpath.slice(2)}`
  const limit = limits.gzipKb[name]
  const forbidden = (limits.forbidden[name] ?? []).filter((path) =>
    [...files].some((file) => relative(root, file).startsWith(path)),
  )
  const over = limit !== undefined && gzip > limit * 1024
  if (over || forbidden.length > 0 || limit === undefined) failed += 1
  rows.push(
    `${over || forbidden.length > 0 || limit === undefined ? '✗' : '✓'} ${name.padEnd(28)} ${kb(gzip).padStart(9)} gzip  ${kb(raw).padStart(9)} nyers  keret: ${limit === undefined ? 'nincs megadva' : `${limit} KB`}${forbidden.length > 0 ? `  tiltott: ${forbidden.join(', ')}` : ''}`,
  )
}
console.log(rows.join('\n'))
if (failed > 0 && !update) {
  console.error(
    `\n${failed} belépési pont túllépte a méretkeretet, tiltott modult húz be, vagy nincs kerete (scripts/size-limits.json).`,
  )
  process.exit(1)
}
