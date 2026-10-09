import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { devNull, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

interface VercelConfig {
  readonly ignoreCommand?: string
}

const SKIP_BUILD = 0
const RUN_BUILD = 1
const UNREACHABLE_SHA = '0123456789abcdef0123456789abcdef01234567'

const vercelConfig = JSON.parse(
  readFileSync(new URL('../web/vercel.json', import.meta.url), 'utf8'),
) as VercelConfig

const isolatedGit = {
  GIT_CONFIG_GLOBAL: devNull,
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'teszt',
  GIT_AUTHOR_EMAIL: 'teszt@example.com',
  GIT_COMMITTER_NAME: 'teszt',
  GIT_COMMITTER_EMAIL: 'teszt@example.com',
}

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...isolatedGit },
  })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`)
  return result.stdout.trim()
}

function commitFile(repo: string, file: string, content: string): string {
  mkdirSync(dirname(join(repo, file)), { recursive: true })
  writeFileSync(join(repo, file), content)
  git(repo, 'add', '-A')
  git(repo, 'commit', '-q', '-m', `módosítás: ${file}`)
  return git(repo, 'rev-parse', 'HEAD')
}

function ignoreCommandExitCode(cwd: string, previousSha: string | undefined): number | null {
  const { VERCEL_GIT_PREVIOUS_SHA: _inherited, ...inherited } = process.env
  const env =
    previousSha === undefined
      ? { ...inherited, ...isolatedGit }
      : { ...inherited, ...isolatedGit, VERCEL_GIT_PREVIOUS_SHA: previousSha }
  return spawnSync('sh', ['-c', vercelConfig.ignoreCommand ?? ''], { cwd, env }).status
}

describe.skipIf(process.platform === 'win32')('a weboldal ignoreCommand-ja', () => {
  let repo = ''

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'kassza-ignore-'))
    git(repo, 'init', '-q', '-b', 'main')
  })

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true })
  })

  test('meg van adva a web/vercel.json-ban', () => {
    expect(vercelConfig.ignoreCommand).toBeTypeOf('string')
  })

  test.each([
    ['a gyökérmappából', ''],
    ['a web/ mappából', 'web'],
  ])(
    'kihagyja a buildet, ha a web/ nem változott a legutóbbi sikeres deployment óta (%s)',
    (_label, folder) => {
      commitFile(repo, 'web/oldal.txt', 'a')
      const deployed = commitFile(repo, 'src/konyvtar.txt', 'a')
      commitFile(repo, 'src/konyvtar.txt', 'b')

      expect(ignoreCommandExitCode(join(repo, folder), deployed)).toBe(SKIP_BUILD)
    },
  )

  test.each([
    ['a gyökérmappából', ''],
    ['a web/ mappából', 'web'],
  ])('épít, ha a web/ változott a legutóbbi sikeres deployment óta (%s)', (_label, folder) => {
    const deployed = commitFile(repo, 'web/oldal.txt', 'a')
    commitFile(repo, 'web/oldal.txt', 'b')

    expect(ignoreCommandExitCode(join(repo, folder), deployed)).toBe(RUN_BUILD)
  })

  test('épít akkor is, ha a web/ változása nem az utolsó commitban van', () => {
    const deployed = commitFile(repo, 'web/oldal.txt', 'a')
    commitFile(repo, 'web/oldal.txt', 'b')
    commitFile(repo, 'src/konyvtar.txt', 'a')

    expect(ignoreCommandExitCode(join(repo, 'web'), deployed)).toBe(RUN_BUILD)
  })

  test.each([undefined, ''])('épít, ha nincs előző sikeres deployment (%j)', (previousSha) => {
    commitFile(repo, 'web/oldal.txt', 'a')

    expect(ignoreCommandExitCode(repo, previousSha)).toBe(RUN_BUILD)
  })

  test('épít, ha az előző deployment commitja nem érhető el a klónban', () => {
    commitFile(repo, 'web/oldal.txt', 'a')

    expect(ignoreCommandExitCode(repo, UNREACHABLE_SHA)).toBe(RUN_BUILD)
  })
})
