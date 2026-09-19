import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const versionFile = join(root, 'kassza-version.json')
const target = join(root, 'node_modules', 'kassza')
const ATTEMPTS = 12
const DELAY_MS = 10_000
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/

function readVersion(path) {
  try {
    const { version } = JSON.parse(readFileSync(path, 'utf8'))
    return typeof version === 'string' ? version : undefined
  } catch {
    return undefined
  }
}

function log(message) {
  process.stdout.write(`▸ ${message}\n`)
}

function download(version, directory) {
  execFileSync(
    'npm',
    [
      'pack',
      `kassza@${version}`,
      '--pack-destination',
      directory,
      '--prefer-online',
      '--ignore-scripts',
      '--silent',
    ],
    { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] },
  )
  const staging = join(directory, 'extracted')
  mkdirSync(staging)
  execFileSync('tar', ['-xzf', join(directory, `kassza-${version}.tgz`), '-C', staging])
  return join(staging, 'package')
}

async function install(version) {
  const directory = mkdtempSync(join(tmpdir(), 'kassza-'))
  try {
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        const extracted = download(version, directory)
        if (readVersion(join(extracted, 'package.json')) !== version) {
          throw new Error('A letöltött csomag verziója nem egyezik a kért verzióval.')
        }
        rmSync(target, { recursive: true, force: true })
        mkdirSync(dirname(target), { recursive: true })
        renameSync(extracted, target)
        return
      } catch (error) {
        if (attempt === ATTEMPTS) throw error
        log(
          `A kassza@${version} még nem érhető el az npm-en (${attempt}/${ATTEMPTS}), ${DELAY_MS / 1000} mp múlva újra.`,
        )
        rmSync(join(directory, 'extracted'), { recursive: true, force: true })
        await sleep(DELAY_MS)
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

const version = readVersion(versionFile)
if (version === undefined || !SEMVER.test(version)) {
  process.stderr.write(`✖ A web/kassza-version.json hiányzik vagy érvénytelen verziót tartalmaz.\n`)
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
