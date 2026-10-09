import { describe, expect, test } from 'vitest'
import { COMMIT_TYPES, isConventional, lintCommitMessage } from '../scripts/commitlint-core.mjs'

describe('commit-lint', () => {
  test.each([
    'feat: új funkció',
    'fix(receipts): a 338-as hiba visszakeresése',
    'feat(stores)!: a CookieStore átnevezése',
    'release: v0.14.0',
    'docs: README',
    'Merge pull request #10 from futozs/claude/x',
    'Revert "feat: valami"',
    '# megjegyzés\n\nchore: függőségek',
  ])('elfogadja: %s', (message) => {
    expect(lintCommitMessage(message)).toEqual({ ok: true, problems: [] })
  })

  test.each([
    ['nem konvencionális', 'Add NAV receipt reporting'],
    ['értelmetlen', 'asd'],
    ['ismeretlen típus', 'feature: valami'],
    ['nagybetűs típus', 'Feat: valami'],
    ['hiányzó szóköz', 'fix:valami'],
    ['üres hatókör', 'fix(): valami'],
    ['üres', '   \n# csak megjegyzés'],
    ['túl hosszú', `fix: ${'x'.repeat(100)}`],
  ])('elutasítja: %s', (_label, message) => {
    const result = lintCommitMessage(message)
    expect(result.ok).toBe(false)
    expect(result.problems.length).toBeGreaterThan(0)
  })

  test('a kiadási típusok benne vannak', () => {
    for (const type of ['feat', 'fix', 'perf']) expect(COMMIT_TYPES).toContain(type)
    expect(isConventional('perf: gyorsabb')).toBe(true)
  })
})
