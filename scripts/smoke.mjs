import { runSmoke } from './smoke-core.mjs'

const ENTRIES = {
  root: '../dist/index.js',
  testing: '../dist/testing/index.js',
  reports: '../dist/reports/index.js',
  journal: '../dist/journal/index.js',
  stores: '../dist/stores/index.js',
  money: '../dist/money/index.js',
  observe: '../dist/observe/index.js',
}

function runtimeName() {
  if (typeof globalThis.Bun !== 'undefined') return `Bun ${globalThis.Bun.version}`
  if (typeof globalThis.Deno !== 'undefined') return `Deno ${globalThis.Deno.version.deno}`
  if (typeof globalThis.EdgeRuntime !== 'undefined') return 'Edge Runtime'
  return `Node.js ${globalThis.process?.versions?.node ?? '?'}`
}

async function loadEsm() {
  const modules = {}
  for (const [name, path] of Object.entries(ENTRIES)) {
    modules[name] = await import(new URL(path, import.meta.url).href)
  }
  return modules
}

async function loadCjs() {
  const { createRequire } = await import('node:module')
  const require = createRequire(import.meta.url)
  const modules = {}
  for (const [name, path] of Object.entries(ENTRIES)) {
    modules[name] = require(path.replace(/\.js$/, '.cjs'))
  }
  return modules
}

const runtime = runtimeName()
const esm = await runSmoke(await loadEsm())
console.log(`✓ ${runtime} ESM: ${esm.length} ellenőrzés`)
if (runtime.startsWith('Node.js') || runtime.startsWith('Bun')) {
  const cjs = await runSmoke(await loadCjs())
  console.log(`✓ ${runtime} CommonJS: ${cjs.length} ellenőrzés`)
}
