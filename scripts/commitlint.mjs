import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { lintCommitMessage } from './commitlint-core.mjs'

const args = process.argv.slice(2)
const rangeIndex = args.indexOf('--range')
const titleIndex = args.indexOf('--message')

function messagesInRange(range) {
  const raw = execFileSync('git', ['log', '--no-merges', '--format=%h%x1f%B%x1e', range], {
    encoding: 'utf8',
  })
  return raw
    .split('\x1e')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [hash = '', body = ''] = entry.split('\x1f')
      return { label: hash, message: body }
    })
}

let targets
if (rangeIndex >= 0) {
  const range = args[rangeIndex + 1]
  if (!range) throw new Error('A --range után add meg a tartományt, például origin/main..HEAD.')
  targets = messagesInRange(range)
} else if (titleIndex >= 0) {
  targets = [{ label: 'üzenet', message: args[titleIndex + 1] ?? '' }]
} else if (args[0]) {
  targets = [{ label: args[0], message: readFileSync(args[0], 'utf8') }]
} else {
  throw new Error(
    'Használat: commitlint.mjs <commit-msg fájl> | --message "<cím>" | --range <a..b>',
  )
}

let failed = 0
for (const target of targets) {
  const result = lintCommitMessage(target.message)
  if (result.ok) continue
  failed += 1
  for (const problem of result.problems) console.error(`✗ ${target.label}: ${problem}`)
}
if (failed > 0) {
  console.error(
    `\n${failed} commit üzenet nem felel meg a Conventional Commits szabálynak. A kiadás és a változásnapló ebből készül.`,
  )
  process.exit(1)
}
console.log(`✓ ${targets.length} commit üzenet rendben.`)
