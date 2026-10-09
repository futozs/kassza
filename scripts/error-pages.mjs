import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ERROR_PAGES_DIR, renderErrorPages } from './error-pages-core.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const { AGENT_ERROR_CODES } = await import('../dist/index.js')
const target = join(root, ERROR_PAGES_DIR)
const files = renderErrorPages(AGENT_ERROR_CODES)
mkdirSync(target, { recursive: true })
for (const name of readdirSync(target)) if (!files.has(name)) rmSync(join(target, name))
for (const [name, content] of files) writeFileSync(join(target, name), content)
console.log(`${files.size} fájl: ${ERROR_PAGES_DIR}`)
