import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

if (existsSync('.git') && existsSync('.githooks/commit-msg') && !process.env.CI) {
  try {
    execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { stdio: 'ignore' })
  } catch {}
}
