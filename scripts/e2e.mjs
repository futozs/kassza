import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const envFile = join(root, '.env')

if (existsSync(envFile)) process.loadEnvFile(envFile)

const agentKey = process.env.SZAMLAZZ_TEST_AGENT_KEY?.trim()

if (!agentKey) {
  process.stderr.write(
    [
      'Hiányzik a SZAMLAZZ_TEST_AGENT_KEY: az e2e a Számlázz.hu TESZTFIÓK Agent kulcsát kéri.',
      'Add meg a környezetben vagy a .env fájlban (lásd .env.example), majd futtasd újra.',
      '',
    ].join('\n'),
  )
  process.exit(1)
}

if (agentKey !== agentKey.toLowerCase()) {
  process.stderr.write(
    'A SZAMLAZZ_TEST_AGENT_KEY nagybetűt tartalmaz, a Számlázz.hu csak kisbetűs kulcsot fogad el.\n',
  )
  process.exit(1)
}

if (!process.env.SZAMLAZZ_E2E_EMAIL?.trim()) {
  process.stderr.write(
    'Figyelem: a SZAMLAZZ_E2E_EMAIL nincs megadva, ezért a nyugta e-mailes küldése kimarad, és a lefedettség-teszt elbukik.\n',
  )
}

process.stdout.write(
  'Élő e2e a Számlázz.hu tesztfiókján. Az első lépés ellenőrzi, hogy tényleg tesztfiók-e, különben leáll.\n',
)

const vitest = join(root, 'node_modules', 'vitest', 'vitest.mjs')
const result = spawnSync(
  process.execPath,
  [vitest, 'run', '--config', 'vitest.e2e.config.ts', ...process.argv.slice(2)],
  { cwd: root, stdio: 'inherit', env: process.env },
)

process.exit(result.status ?? 1)
