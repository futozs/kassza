import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { assertTestAccount, PROBE_CHARACTERS, PROBE_LENGTHS, throttle } from './live-core.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'))
const agentKey = process.env.SZAMLAZZ_TEST_AGENT_KEY?.trim()
if (!agentKey) {
  console.error('Hiányzik a SZAMLAZZ_TEST_AGENT_KEY (csak TESZTFIÓK kulcs!).')
  process.exit(1)
}
const delayMs = Number(process.env.PROBE_DELAY_MS ?? 1500)
const { createKassza, isSzamlazzError } = await import('../dist/index.js')
const kassza = createKassza({
  agentKey,
  fetch: throttle(globalThis.fetch, delayMs),
  maxAttempts: 1,
})
await assertTestAccount(kassza, `PROBE-GUARD-${Date.now()}`)

const base = {
  buyer: { name: 'Szonda Kft.', zip: '1111', city: 'Budapest', address: 'Szonda utca 1.' },
  items: [{ name: 'Szonda tétel', netUnitPrice: 100, vat: 27 }],
}
const FIELDS = {
  'buyer.name': (value) => ({ ...base, buyer: { ...base.buyer, name: value } }),
  'buyer.address': (value) => ({ ...base, buyer: { ...base.buyer, address: value } }),
  comment: (value) => ({ ...base, comment: value }),
  'item.name': (value) => ({ ...base, items: [{ ...base.items[0], name: value }] }),
  'item.comment': (value) => ({ ...base, items: [{ ...base.items[0], comment: value }] }),
  orderNumber: (value) => ({ ...base, orderNumber: value }),
  externalId: (value) => ({ ...base, externalId: value }),
}

async function attempt(input) {
  try {
    await kassza.invoices.preview(input)
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      code: isSzamlazzError(error) ? error.code : undefined,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

const result = { probedAt: new Date().toISOString(), fields: {} }
for (const [field, build] of Object.entries(FIELDS)) {
  const lengths = {}
  let maxAccepted = 0
  for (const length of PROBE_LENGTHS) {
    const outcome = await attempt(build('x'.repeat(length)))
    lengths[length] = outcome
    if (outcome.ok) maxAccepted = length
    else break
  }
  const characters = {}
  for (const [name, value] of Object.entries(PROBE_CHARACTERS)) {
    characters[name] = await attempt(build(value))
  }
  result.fields[field] = { maxAccepted, lengths, characters }
  console.log(`${field}: legalább ${maxAccepted} karakter elfogadva`)
}
const output = join(root, 'probe-limits.result.json')
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`)
console.log(
  `Eredmény: ${output}. Nézd át, és a mezőhatárokat vidd át a docsba és a kliensoldali ellenőrzésbe.`,
)
