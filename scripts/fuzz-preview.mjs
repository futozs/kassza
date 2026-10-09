import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertTestAccount,
  capturingFetch,
  compareTotals,
  localTotals,
  mulberry32,
  randomCart,
  serverTotals,
  throttle,
} from './live-core.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'))
const args = new Map(
  process.argv.slice(2).flatMap((arg) => {
    const match = /^--([a-z-]+)=(.*)$/.exec(arg)
    return match ? [[match[1], match[2]]] : []
  }),
)
const count = Number(args.get('count') ?? 50)
const seed = Number(args.get('seed') ?? Date.now() % 2 ** 31)
const delayMs = Number(args.get('delay-ms') ?? 1500)
const agentKey = process.env.SZAMLAZZ_TEST_AGENT_KEY?.trim()
if (!agentKey) {
  console.error('Hiányzik a SZAMLAZZ_TEST_AGENT_KEY (csak TESZTFIÓK kulcs!).')
  process.exit(1)
}

const { createKassza } = await import('../dist/index.js')
const money = await import('../dist/money/index.js')
const { fetch, captured } = capturingFetch(throttle(globalThis.fetch, delayMs))
const kassza = createKassza({ agentKey, fetch, maxAttempts: 1 })
await assertTestAccount(kassza, `FUZZ-GUARD-${seed}`)

const rng = mulberry32(seed)
const buyer = { name: 'Kassza fuzz', zip: '1111', city: 'Budapest', address: 'Fuzz utca 1.' }
const counts = { match: 0, mismatch: 0, inconclusive: 0, error: 0 }
const regressions = []
for (let index = 0; index < count; index++) {
  const cart = randomCart(rng, index)
  const local = localTotals(cart, money)
  try {
    const { index: _position, ...input } = cart
    await kassza.invoices.preview({ buyer, ...input })
    const server = serverTotals(captured.headers ?? new Headers())
    const outcome = compareTotals(local, server)
    counts[outcome] += 1
    if (outcome === 'mismatch') regressions.push({ seed, cart, local, server })
  } catch (error) {
    counts.error += 1
    console.error(`#${index}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

console.log(`seed=${seed} kosár=${count}`, counts)
if (regressions.length > 0) {
  const fixture = join(root, 'tests', 'fixtures', 'rounding-regressions.json')
  const existing = existsSync(fixture) ? JSON.parse(readFileSync(fixture, 'utf8')) : []
  writeFileSync(fixture, `${JSON.stringify([...existing, ...regressions], null, 2)}\n`)
  console.error(
    `${regressions.length} eltérés került a ${fixture} fájlba. A rounding-regressions teszt most piros.`,
  )
  process.exit(1)
}
