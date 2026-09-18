import type { AccountSnapshot, SimulatedCall } from '../simulator'
import type { ConsoleLevel } from './execute'
import type { Preview } from './serialize'

export interface ConsoleEntry {
  readonly level: ConsoleLevel
  readonly args: readonly Preview[]
  readonly time: number
}

export interface RunError {
  readonly preview: Preview
  readonly line?: number | undefined
  readonly column?: number | undefined
}

export interface RunResult {
  readonly ok: boolean
  readonly error?: RunError | undefined
  readonly durationMs: number
  readonly account: AccountSnapshot
}

export type WorkerRequest = { readonly type: 'run'; readonly runId: number; readonly code: string }

export type WorkerMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'console'; readonly runId: number; readonly entry: ConsoleEntry }
  | { readonly type: 'call'; readonly runId: number; readonly call: SimulatedCall }
  | {
      readonly type: 'bytes'
      readonly runId: number
      readonly ref: string
      readonly buffer: ArrayBuffer
    }
  | { readonly type: 'done'; readonly runId: number; readonly result: RunResult }
