import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { EXAMPLES, type ExampleMeta } from '../sandbox/examples/catalog'
import type { ConsoleEntry } from '../sandbox/runtime/protocol'
import { runSandboxCode } from '../sandbox/runtime/run'
import { formatPreview } from '../sandbox/runtime/serialize'
import type { SimulatedCall } from '../sandbox/simulator'

export interface GeneratedCall {
  readonly action: SimulatedCall['action']
  readonly field: string
  readonly status: SimulatedCall['status']
  readonly sessionReused: boolean
  readonly requestXml: string
  readonly responseHeaders: SimulatedCall['responseHeaders']
  readonly responseBody: string
  readonly responseKind: SimulatedCall['responseKind']
  readonly effects: readonly string[]
}

export interface GeneratedExample extends ExampleMeta {
  readonly code: string
  readonly output: readonly { readonly level: ConsoleEntry['level']; readonly text: string }[]
  readonly calls: readonly GeneratedCall[]
}

export async function runExamples(root: string): Promise<GeneratedExample[]> {
  const results: GeneratedExample[] = []
  for (const example of EXAMPLES) {
    const code = (
      await readFile(join(root, 'sandbox/examples', `${example.slug}.ts`), 'utf8')
    ).trimEnd()
    const output: ConsoleEntry[] = []
    const calls: SimulatedCall[] = []
    const result = await runSandboxCode(code, {
      onConsole: (entry) => output.push(entry),
      onCall: (call) => calls.push(call),
    })
    if (!result.ok) {
      const detail = result.error ? formatPreview(result.error.preview) : 'ismeretlen hiba'
      throw new Error(`A(z) "${example.slug}" példa hibával futott le: ${detail}`)
    }
    results.push({
      ...example,
      code,
      output: output.map((entry) => ({
        level: entry.level,
        text: entry.args.map((arg) => formatPreview(arg)).join(' '),
      })),
      calls: calls.map((call) => ({
        action: call.action,
        field: call.field,
        status: call.status,
        sessionReused: call.sessionReused,
        requestXml: call.requestXml,
        responseHeaders: call.responseHeaders,
        responseBody: call.responseBody,
        responseKind: call.responseKind,
        effects: call.effects,
      })),
    })
  }
  return results
}
