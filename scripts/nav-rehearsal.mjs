import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runNavRehearsal } from './nav-rehearsal-core.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
if (existsSync(join(root, '.env'))) process.loadEnvFile(join(root, '.env'))
const env = (name) => process.env[name]?.trim() || undefined
const missing = [
  'NAV_TEST_LOGIN',
  'NAV_TEST_PASSWORD',
  'NAV_TEST_SIGNATURE_KEY',
  'NAV_TEST_TAX_NUMBER',
].filter((name) => !env(name))
if (missing.length > 0) {
  console.error(
    `Hiányzó NAV TESZT környezeti technikai felhasználó adatok: ${missing.join(', ')}.\nA próba kizárólag a bv-receipt-if teszt környezetben fut.`,
  )
  process.exit(1)
}
const { createNavReceiptClient } = await import('../dist/nav/index.js')
const { todayInBudapest } = await import('../dist/index.js')
const nav = createNavReceiptClient({
  environment: 'test',
  login: env('NAV_TEST_LOGIN'),
  password: env('NAV_TEST_PASSWORD'),
  signatureKey: env('NAV_TEST_SIGNATURE_KEY'),
  taxNumber: env('NAV_TEST_TAX_NUMBER'),
  softwareName: env('NAV_TEST_SOFTWARE_NAME') ?? 'KASSZAPROBA',
  allowWrite: true,
})
try {
  await runNavRehearsal(nav, {
    date: env('NAV_TEST_DATE') ?? todayInBudapest(),
    serialNumber: env('NAV_TEST_SERIAL') ?? 'KASSZAPROBA',
    softwareName: env('NAV_TEST_SOFTWARE_NAME') ?? 'KASSZAPROBA',
    log: (line) => console.log(line),
  })
  console.log(
    'A teljes NAV kör (hitelesítés → beküldés → lista → módosítás → érvénytelenítés) sikeres.',
  )
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  if (error?.cause) console.error(error.cause)
  process.exit(1)
}
