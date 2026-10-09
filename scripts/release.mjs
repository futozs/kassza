import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import {
  detectBump as chooseBump,
  isStableJump,
  nextVersion,
  prependEntry,
  renderChangelogEntry,
  splitChangelog,
} from './changelog-core.mjs'
import { isConventional } from './commitlint-core.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const packagePath = join(root, 'package.json')
const changelogPath = join(root, 'CHANGELOG.md')
const webRoot = join(root, 'web')
const webVersionPath = join(webRoot, 'kassza-version.json')
const REGISTRY_WAIT_MS = 10 * 60_000
const REGISTRY_POLL_MS = 15_000

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const skipChecks = args.includes('--skip-checks')
const ciMode = args.includes('--ci')
const requestedBump = args.find((arg) => ['patch', 'minor', 'major'].includes(arg))
const allowStable = args.includes('--allow-stable') || process.env.KASSZA_ALLOW_STABLE === '1'

const ESC = String.fromCharCode(27)
const GREEN = `${ESC}[32m`
const RED = `${ESC}[31m`
const RESET = `${ESC}[0m`
const RECORD_SEPARATOR = String.fromCharCode(30)
const UNIT_SEPARATOR = String.fromCharCode(31)

const RELEASE_TYPES = new Set(['feat', 'fix', 'perf'])
const NON_LIBRARY_PATHSPEC = ['--', '.', ':(exclude)web']

function log(message) {
  process.stdout.write(`${GREEN}▸${RESET} ${message}\n`)
}

function fail(message) {
  process.stderr.write(`${RED}✖ ${message}${RESET}\n`)
  process.exit(1)
}

function git(...gitArgs) {
  return execFileSync('git', gitArgs, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function isPublished(name, version) {
  try {
    return (
      execFileSync('npm', ['view', `${name}@${version}`, 'version'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() === version
    )
  } catch {
    return false
  }
}

function isVisibleOnRegistry(name, version) {
  try {
    return (
      execFileSync('npm', ['view', `${name}@${version}`, 'version', '--prefer-online'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim() === version
    )
  } catch {
    return false
  }
}

async function waitForRegistry(name, version) {
  const startedAt = Date.now()
  while (!isVisibleOnRegistry(name, version)) {
    const elapsed = Date.now() - startedAt
    if (elapsed >= REGISTRY_WAIT_MS) {
      log(
        `A ${name}@${version} ${Math.round(elapsed / 60_000)} perc után sem látszik az npm registryben, a kiadással tovább megyek. A weboldal build a saját újrapróbálásával várja meg.`,
      )
      return
    }
    log(
      `A ${name}@${version} még nem látszik az npm registryben, ${REGISTRY_POLL_MS / 1000} mp múlva újra.`,
    )
    await sleep(REGISTRY_POLL_MS)
  }
  log(`A ${name}@${version} elérhető az npm registryben.`)
}

function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, { cwd: root, stdio: 'inherit' })
  return result.status === 0
}

function writeWebVersion(version) {
  if (!existsSync(webRoot)) return []
  writeFileSync(webVersionPath, `${JSON.stringify({ version }, null, 2)}\n`)
  log(`Weboldal: web/kassza-version.json → ${version}`)
  return ['web/kassza-version.json']
}

function lastTag() {
  try {
    return git('describe', '--tags', '--abbrev=0', '--match', 'v*')
  } catch {
    return undefined
  }
}

function isReleasable(commit) {
  return commit.breaking || RELEASE_TYPES.has(commit.type)
}

function readCommits(since) {
  const range = since ? [`${since}..HEAD`] : []
  const raw = git(
    'log',
    ...range,
    '--no-merges',
    '--pretty=format:%h%x1f%s%x1f%b%x1e',
    ...NON_LIBRARY_PATHSPEC,
  )
  return raw
    .split(RECORD_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash = '', subject = '', body = ''] = entry.split(UNIT_SEPARATOR)
      const match = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/.exec(subject)
      const type = match?.[1]?.toLowerCase() ?? 'other'
      const breaking = Boolean(match?.[3]) || /BREAKING CHANGE/.test(body)
      const scope = match?.[2]
      const text = match?.[4] ?? subject
      return { hash, type, breaking, text: scope ? `**${scope}:** ${text}` : text }
    })
    .filter(isReleasable)
}

function nonConventionalSubjects(since) {
  const range = since ? [`${since}..HEAD`] : []
  return git('log', ...range, '--no-merges', '--pretty=format:%h %s', ...NON_LIBRARY_PATHSPEC)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isConventional(line.slice(line.indexOf(' ') + 1)))
}

function readChangelog() {
  return existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : undefined
}

function writeChangelog(entry) {
  writeFileSync(changelogPath, prependEntry(readChangelog(), entry))
}

const pkg = JSON.parse(readFileSync(packagePath, 'utf8'))

if (git('status', '--porcelain') !== '' && !dryRun) {
  fail('Van nem commitolt változás. Commitold vagy stash-eld, aztán futtasd újra.')
}

const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
if (branch !== 'main' && !dryRun) fail(`Csak a main branchről lehet kiadni (most: ${branch}).`)

if (!dryRun && !ciMode) {
  try {
    log(`npm fiók: ${execFileSync('npm', ['whoami'], { encoding: 'utf8' }).trim()}`)
  } catch {
    fail('Nem vagy bejelentkezve az npm-be. Futtasd: npm login')
  }
}
if (ciMode) log('CI mód: publikálás OIDC Trusted Publisher-en keresztül, npm token nélkül.')

const previousTag = lastTag()
const commits = readCommits(previousTag)
if (ciMode && commits.length === 0 && !requestedBump) {
  log('Nincs kiadásra érdemes változás (feat, fix, perf vagy törő változás a web/ mappán kívül).')
  process.exit(0)
}
const skippedSubjects = nonConventionalSubjects(previousTag)
if (skippedSubjects.length > 0) {
  log(
    `Figyelem: ${skippedSubjects.length} commit nem Conventional Commits formátumú, ezért kimarad a változásnaplóból és a verziólépésből:`,
  )
  for (const subject of skippedSubjects) log(`  ${subject}`)
}
const bump = chooseBump(commits, pkg.version, requestedBump)
const version = nextVersion(pkg.version, bump)
if (isStableJump(pkg.version, version) && !allowStable) {
  fail(
    `A kassza béta (0.x), ez a kiadás stabil verzió lenne (${version}). Az 1.0 tudatos döntés: futtasd --allow-stable kapcsolóval (vagy KASSZA_ALLOW_STABLE=1), ha valóban itt az ideje.`,
  )
}
const releaseDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' }).format(
  new Date(),
)
const entry = renderChangelogEntry(
  version,
  commits,
  splitChangelog(readChangelog()).unreleased,
  releaseDate,
)

if (isPublished(pkg.name, version)) {
  fail(
    `A ${pkg.name}@${version} már kint van az npm-en. Adj meg nagyobb lépést: patch, minor vagy major.`,
  )
}

log(
  `${pkg.name}: ${pkg.version} → ${version} (${previousTag ? `${commits.length} commit ${previousTag} óta` : 'első kiadás'})`,
)
process.stdout.write(`\n${entry}\n`)

if (dryRun) {
  log('Próbafuttatás (--dry-run): semmi nem változott, semmi nem ment ki.')
  process.exit(0)
}

if (!skipChecks) {
  log('Ellenőrzések: lint, typecheck, tesztek, build, publint, attw')
  if (!run('npm', ['run', 'ci'])) fail('A CI elbukott, nem adom ki a csomagot.')
}

const restore = () => {
  const current = JSON.parse(readFileSync(packagePath, 'utf8'))
  if (current.version === version) {
    writeFileSync(packagePath, `${JSON.stringify({ ...current, version: pkg.version }, null, 2)}\n`)
  }
  if (!existsSync(changelogPath)) return
  const changelog = readFileSync(changelogPath, 'utf8')
  if (!changelog.includes(entry)) return
  const withoutEntry = changelog.replace(`${entry}\n`, '')
  if (withoutEntry.trim() === '# Változásnapló') unlinkSync(changelogPath)
  else writeFileSync(changelogPath, withoutEntry)
}

const abort = () => {
  restore()
  fail('Megszakítva: a verziót és a changelogot visszaállítottam, semmi nem ment ki.')
}
process.once('SIGINT', abort)
process.once('SIGTERM', abort)

writeFileSync(packagePath, `${JSON.stringify({ ...pkg, version }, null, 2)}\n`)
writeChangelog(entry)

log(
  ciMode
    ? `Publikálás: ${pkg.name}@${version} (OIDC Trusted Publisher, automatikus)`
    : `Publikálás: ${pkg.name}@${version} (az npm kérheti a 2FA kódot vagy a böngészős megerősítést)`,
)
if (!run('npm', ['publish', '--ignore-scripts'])) {
  restore()
  fail('Az npm publish nem sikerült, a verziót és a changelogot visszaállítottam.')
}

process.removeListener('SIGINT', abort)
process.removeListener('SIGTERM', abort)

await waitForRegistry(pkg.name, version)

git('add', 'package.json', 'CHANGELOG.md', ...writeWebVersion(version))
git('commit', '-m', `release: v${version}`)
git('tag', '-a', `v${version}`, '-m', `v${version}`)
log(`Kész: https://www.npmjs.com/package/${pkg.name}/v/${version}`)

if (run('git', ['push', '--follow-tags'])) {
  log('A release commit és a tag felment a GitHubra.')
} else {
  fail(
    'A kiadás kint van az npm-en, de a git push nem sikerült. Futtasd kézzel: git push --follow-tags',
  )
}
