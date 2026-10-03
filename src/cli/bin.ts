#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { runCli } from './run'

async function readStdin(): Promise<string> {
  let text = ''
  process.stdin.setEncoding('utf8')
  for await (const chunk of process.stdin) text += chunk
  return text
}

runCli({
  argv: process.argv.slice(2),
  env: process.env,
  nodeVersion: process.versions.node,
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
  readFile: (path) => readFile(path, 'utf8'),
  readStdin,
  stdinLines: () => createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY }),
}).then(
  (code) => {
    process.exitCode = code
  },
  (error: unknown) => {
    process.stderr.write(
      `Váratlan hiba: ${error instanceof Error ? error.message : String(error)}\n`,
    )
    process.exitCode = 1
  },
)
