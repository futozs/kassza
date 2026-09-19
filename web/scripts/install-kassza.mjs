import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const versionFile = join(root, 'kassza-version.json')
const modulesDir = join(root, 'node_modules')
const target = join(modulesDir, 'kassza')
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

function positiveNumber(value, fallback) {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const MAX_WAIT_MS = positiveNumber(process.env.KASSZA_INSTALL_MAX_WAIT_MS, 20 * 60_000)
const DELAY_MS = positiveNumber(process.env.KASSZA_INSTALL_DELAY_MS, 15_000)

function log(message) {
  process.stdout.write(`▸ ${message}\n`)
}

function readVersion(path) {
  try {
    const { version } = JSON.parse(readFileSync(path, 'utf8'))
    return typeof version === 'string' ? version : undefined
  } catch {
    return undefined
  }
}

function pack(version, directory) {
  const result = spawnSync(
    'npm',
    [
      'pack',
      `kassza@${version}`,
      '--pack-destination',
      directory,
      '--prefer-online',
      '--ignore-scripts',
      '--loglevel',
      'error',
    ],
    { cwd: root, encoding: 'utf8' },
  )
  if (result.status === 0) return undefined
  const output = `${result.stderr ?? ''}${result.error?.message ?? ''}`.trim()
  const lines = output.split('\n').map((line) => line.replace(/^npm error\s*/, '').trim())
  const summary = lines.filter((line) => line !== '').slice(0, 2)
  return summary.length > 0 ? summary.join(' · ') : `az npm pack kilépési kódja: ${result.status}`
}

async function downloadTarball(version, directory) {
  const startedAt = Date.now()
  for (let attempt = 1; ; attempt++) {
    const failure = pack(version, directory)
    if (failure === undefined) return
    const elapsed = Date.now() - startedAt
    if (elapsed + DELAY_MS > MAX_WAIT_MS) {
      throw new Error(
        `${Math.round(elapsed / 1000)} mp alatt sem lett elérhető az npm-en. Az utolsó npm hiba: ${failure}`,
      )
    }
    log(
      `A kassza@${version} még nem érhető el az npm-en (${attempt}. próba, ${Math.round(elapsed / 1000)} mp), ${DELAY_MS / 1000} mp múlva újra. npm: ${failure}`,
    )
    await sleep(DELAY_MS)
  }
}

async function install(version) {
  mkdirSync(modulesDir, { recursive: true })
  const staging = mkdtempSync(join(modulesDir, '.kassza-install-'))
  try {
    await downloadTarball(version, staging)
    const extracted = join(staging, 'extracted')
    mkdirSync(extracted)
    execFileSync('tar', ['-xzf', join(staging, `kassza-${version}.tgz`), '-C', extracted])
    const unpacked = join(extracted, 'package')
    if (readVersion(join(unpacked, 'package.json')) !== version) {
      throw new Error('A letöltött csomag verziója nem egyezik a kért verzióval.')
    }
    rmSync(target, { recursive: true, force: true })
    renameSync(unpacked, target)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
}

const version = readVersion(versionFile)
if (version === undefined || !SEMVER.test(version)) {
  process.stderr.write('✖ A web/kassza-version.json hiányzik vagy érvénytelen verziót tartalmaz.\n')
  process.exit(1)
}

if (readVersion(join(target, 'package.json')) === version) {
  process.exit(0)
}

log(`kassza@${version} telepítése a web/node_modules-ba`)
try {
  await install(version)
  log(`kassza@${version} kész`)
} catch (error) {
  process.stderr.write(`✖ A kassza@${version} telepítése nem sikerült: ${error.message}\n`)
  process.exit(1)
}
