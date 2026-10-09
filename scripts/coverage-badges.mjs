import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { coverageBadges } from './coverage-badges-core.mjs'

const [summaryPath = 'coverage/coverage-summary.json', outputDir = 'coverage/badges'] =
  process.argv.slice(2)

const badges = coverageBadges(JSON.parse(readFileSync(summaryPath, 'utf8')))
mkdirSync(outputDir, { recursive: true })
for (const { file, badge } of badges) {
  writeFileSync(join(outputDir, file), `${JSON.stringify(badge)}\n`)
  process.stdout.write(`${badge.label}: ${badge.message}\n`)
}
