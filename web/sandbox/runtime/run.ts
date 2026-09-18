import { createAgentSimulator, type SimulatedCall } from '../simulator'
import { createConsole, execute, SandboxSyntaxError, WRAPPER_LINE_OFFSET } from './execute'
import { createSandboxModules, installSandboxGlobals } from './modules'
import type { ConsoleEntry, RunResult } from './protocol'
import { serialize } from './serialize'

export interface RunCallbacks {
  readonly onConsole: (entry: ConsoleEntry) => void
  readonly onCall: (call: SimulatedCall) => void
}

export interface RunOptions {
  readonly latencyMs?: readonly [number, number] | undefined
  readonly onBytes?: ((bytes: Uint8Array) => string | undefined) | undefined
  readonly functionHeaderLines?: number | undefined
}

function lineFromStack(error: unknown, headerLines: number): { line?: number; column?: number } {
  if (!(error instanceof Error) || !error.stack) return {}
  const match = /<anonymous>:(\d+):(\d+)/.exec(error.stack)
  if (!match?.[1] || !match[2]) return {}
  const line = Number(match[1]) - headerLines - WRAPPER_LINE_OFFSET
  return line > 0 ? { line, column: Number(match[2]) } : {}
}

export async function runSandboxCode(
  code: string,
  callbacks: RunCallbacks,
  options: RunOptions = {},
): Promise<RunResult> {
  const simulator = createAgentSimulator({ latencyMs: options.latencyMs })
  const unsubscribe = simulator.onCall(callbacks.onCall)
  const globals = installSandboxGlobals(simulator)
  const startedAt = performance.now()
  const context = { onBytes: options.onBytes }
  const sandboxConsole = createConsole((level, args) => {
    callbacks.onConsole({
      level,
      args: args.map((arg) => serialize(arg, context)),
      time: performance.now() - startedAt,
    })
  })

  try {
    await execute(code, createSandboxModules(simulator), sandboxConsole)
    return { ok: true, durationMs: performance.now() - startedAt, account: simulator.snapshot() }
  } catch (error) {
    const position =
      error instanceof SandboxSyntaxError
        ? { line: error.line, column: error.column }
        : lineFromStack(error, options.functionHeaderLines ?? 2)
    return {
      ok: false,
      error: { preview: serialize(error, context), ...position },
      durationMs: performance.now() - startedAt,
      account: simulator.snapshot(),
    }
  } finally {
    globals.restore()
    unsubscribe()
  }
}
