export const COMMIT_TYPES = [
  'feat',
  'fix',
  'perf',
  'docs',
  'test',
  'refactor',
  'chore',
  'ci',
  'build',
  'style',
  'revert',
  'release',
]

export const MAX_SUBJECT_LENGTH = 100

const PATTERN = /^(?<type>[a-z]+)(?:\((?<scope>[^()\s][^()]*)\))?(?<breaking>!)?: (?<subject>\S.*)$/

const AUTOMATIC = [
  /^Merge (branch|pull request|remote-tracking branch) /,
  /^Revert "/,
  /^(fixup|squash)! /,
]

export function lintCommitMessage(message) {
  const subject = String(message ?? '')
    .split('\n')
    .find((line) => line.trim() !== '' && !line.startsWith('#'))
    ?.trim()
  if (!subject) return { ok: false, problems: ['Üres commit üzenet.'] }
  if (AUTOMATIC.some((pattern) => pattern.test(subject))) return { ok: true, problems: [] }
  const problems = []
  const match = PATTERN.exec(subject)
  if (!match?.groups) {
    problems.push(
      `Nem Conventional Commits formátum: „${subject}”. Helyes: típus(hatókör): leírás, például „fix(receipts): a 338-as hiba visszakeresése”.`,
    )
  } else if (!COMMIT_TYPES.includes(match.groups.type)) {
    problems.push(
      `Ismeretlen típus: ${match.groups.type}. Engedélyezett: ${COMMIT_TYPES.join(', ')}.`,
    )
  }
  if (subject.length > MAX_SUBJECT_LENGTH) {
    problems.push(`Az első sor ${subject.length} karakter, legfeljebb ${MAX_SUBJECT_LENGTH} lehet.`)
  }
  return { ok: problems.length === 0, problems }
}

export function isConventional(subject) {
  return lintCommitMessage(subject).ok
}
