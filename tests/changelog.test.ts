import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import {
  CHANGELOG_HEADER,
  detectBump,
  isStableJump,
  nextVersion,
  prependEntry,
  renderChangelogEntry,
  splitChangelog,
} from '../scripts/changelog-core.mjs'

const feat = { hash: 'a1', type: 'feat', breaking: false, text: 'új funkció' }
const fix = { hash: 'b2', type: 'fix', breaking: false, text: 'javítás' }
const breaking = { hash: 'c3', type: 'feat', breaking: true, text: 'törés' }

describe('változásnapló és verziólépés', () => {
  test('a Kiadatlan szakaszt leválasztja, a többit megtartja', () => {
    const content = `${CHANGELOG_HEADER}## Kiadatlan\n\n### Mi változott\n\nSok minden.\n\n## 0.13.0 (2026-10-03)\n\n- régi\n`
    expect(splitChangelog(content)).toEqual({
      unreleased: '### Mi változott\n\nSok minden.',
      rest: '## 0.13.0 (2026-10-03)\n\n- régi\n',
    })
    expect(splitChangelog(`${CHANGELOG_HEADER}## 0.1.0\n`)).toEqual({
      unreleased: '',
      rest: '## 0.1.0\n',
    })
    expect(splitChangelog(`${CHANGELOG_HEADER}## Kiadatlan\n\nCsak ez.\n`)).toEqual({
      unreleased: 'Csak ez.',
      rest: '',
    })
    expect(splitChangelog(undefined)).toEqual({ unreleased: '', rest: '' })
  })

  test('a kiadás bejegyzése a kézi leírással kezdődik, utána a commitok', () => {
    const entry = renderChangelogEntry(
      '0.14.0',
      [fix, feat],
      '### Mi változott\n\nLeírás.',
      '2026-10-08',
    )
    expect(entry).toBe(
      [
        '## 0.14.0 (2026-10-08)',
        '',
        '### Mi változott\n\nLeírás.',
        '',
        '### Újdonságok',
        '',
        '- új funkció (a1)',
        '',
        '### Javítások',
        '',
        '- javítás (b2)',
        '',
      ].join('\n'),
    )
    expect(renderChangelogEntry('0.14.1', [], '', '2026-10-09')).toContain('- Karbantartási kiadás')
    expect(renderChangelogEntry('0.14.1', [], 'Kézi.', '2026-10-09')).not.toContain('Karbantartási')
  })

  test('a kiadás után a Kiadatlan szakasz eltűnik, a régi bejegyzések maradnak', () => {
    const content = `${CHANGELOG_HEADER}## Kiadatlan\n\nKézi.\n\n## 0.13.0 (2026-10-03)\n\n- régi\n`
    const next = prependEntry(content, '## 0.14.0 (2026-10-08)\n\nKézi.\n')
    expect(next).toBe(
      `${CHANGELOG_HEADER}## 0.14.0 (2026-10-08)\n\nKézi.\n\n## 0.13.0 (2026-10-03)\n\n- régi\n`,
    )
  })

  test('0.x alatt a törő változás minor lépés, a stabil ugrás külön engedélyt kér', () => {
    expect(detectBump([breaking], '0.13.0')).toBe('minor')
    expect(detectBump([breaking], '1.2.0')).toBe('major')
    expect(detectBump([feat], '0.13.0')).toBe('minor')
    expect(detectBump([fix], '0.13.0')).toBe('patch')
    expect(detectBump([fix], '0.13.0', 'major')).toBe('major')
    expect(nextVersion('0.13.0', 'minor')).toBe('0.14.0')
    expect(nextVersion('0.13.2', 'patch')).toBe('0.13.3')
    expect(nextVersion('0.13.0', 'major')).toBe('1.0.0')
    expect(nextVersion('0.0.0', 'patch')).toBe('0.1.0')
    expect(isStableJump('0.13.0', '1.0.0')).toBe(true)
    expect(isStableJump('0.13.0', '0.14.0')).toBe(false)
    expect(isStableJump('1.0.0', '2.0.0')).toBe(false)
  })

  test('a repó változásnaplója érvényes szerkezetű (fejléc, opcionális Kiadatlan, verziók)', () => {
    const content = readFileSync('CHANGELOG.md', 'utf8')
    expect(content.startsWith(CHANGELOG_HEADER)).toBe(true)
    expect(splitChangelog(content).rest).toMatch(/^## \d+\.\d+\.\d+ /)
  })
})
