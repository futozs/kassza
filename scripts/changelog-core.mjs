export const CHANGELOG_HEADER = '# Változásnapló\n\n'
export const UNRELEASED_HEADING = '## Kiadatlan'

export const SECTIONS = [
  ['breaking', 'Törő változások'],
  ['feat', 'Újdonságok'],
  ['fix', 'Javítások'],
  ['perf', 'Gyorsítások'],
]

export function splitChangelog(content) {
  const existing = content ?? CHANGELOG_HEADER
  const body = existing.startsWith(CHANGELOG_HEADER)
    ? existing.slice(CHANGELOG_HEADER.length)
    : existing
  if (!body.startsWith(UNRELEASED_HEADING)) return { unreleased: '', rest: body }
  const next = body.indexOf('\n## ', UNRELEASED_HEADING.length)
  const section = next === -1 ? body : body.slice(0, next + 1)
  return {
    unreleased: section.slice(UNRELEASED_HEADING.length).trim(),
    rest: next === -1 ? '' : body.slice(next + 1),
  }
}

function sectionOf(commit) {
  return commit.breaking ? 'breaking' : commit.type
}

export function renderChangelogEntry(version, commits, unreleased, date) {
  const lines = [`## ${version} (${date})`, '']
  if (unreleased) lines.push(unreleased, '')
  for (const [key, title] of SECTIONS) {
    const items = commits.filter((commit) => sectionOf(commit) === key)
    if (items.length === 0) continue
    lines.push(
      `### ${title}`,
      '',
      ...items.map((commit) => `- ${commit.text} (${commit.hash})`),
      '',
    )
  }
  if (commits.length === 0 && !unreleased) lines.push('- Karbantartási kiadás', '')
  return lines.join('\n')
}

export function nextVersion(version, bump) {
  const [major = 0, minor = 0, patch = 0] = version.split('-')[0].split('.').map(Number)
  if (major === 0 && minor === 0 && patch === 0) return '0.1.0'
  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

export function detectBump(commits, currentVersion, requested) {
  if (requested) return requested
  const [major] = currentVersion.split('.').map(Number)
  if (commits.some((commit) => commit.breaking)) return major === 0 ? 'minor' : 'major'
  if (commits.some((commit) => commit.type === 'feat')) return 'minor'
  return 'patch'
}

export function isStableJump(current, next) {
  return current.startsWith('0.') && !next.startsWith('0.')
}

export function prependEntry(content, entry) {
  return `${CHANGELOG_HEADER}${entry}\n${splitChangelog(content).rest}`
}
