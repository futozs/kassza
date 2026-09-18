import { transform } from 'sucrase'

export type ConsoleLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

export interface SandboxConsole {
  log(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
  debug(...args: unknown[]): void
  table(...args: unknown[]): void
  dir(...args: unknown[]): void
}

export class SandboxSyntaxError extends Error {
  override readonly name = 'SzintaktikaiHiba'
  readonly line: number | undefined
  readonly column: number | undefined

  constructor(message: string, line: number | undefined, column: number | undefined) {
    super(message)
    this.line = line
    this.column = column
  }
}

export const WRAPPER_LINE_OFFSET = 1

export function compile(code: string): string {
  try {
    return transform(code, {
      transforms: ['typescript', 'imports'],
      filePath: 'sandbox.ts',
      production: true,
      disableESTransforms: true,
    }).code
  } catch (error) {
    const loc = (error as { loc?: { line: number; column: number } }).loc
    const raw = error instanceof Error ? error.message : String(error)
    const message = raw.replace(/\s*\(\d+:\d+\)\s*$/, '')
    throw new SandboxSyntaxError(
      loc ? `${message} (${loc.line}. sor, ${loc.column + 1}. oszlop)` : message,
      loc?.line,
      loc ? loc.column + 1 : undefined,
    )
  }
}

export function createConsole(
  emit: (level: ConsoleLevel, args: unknown[]) => void,
): SandboxConsole {
  return {
    log: (...args) => emit('log', args),
    info: (...args) => emit('info', args),
    warn: (...args) => emit('warn', args),
    error: (...args) => emit('error', args),
    debug: (...args) => emit('debug', args),
    table: (...args) => emit('log', args),
    dir: (...args) => emit('log', args),
  }
}

export async function execute(
  code: string,
  modules: Readonly<Record<string, unknown>>,
  sandboxConsole: SandboxConsole,
): Promise<void> {
  const compiled = compile(code)
  const available = Object.keys(modules).join(', ')
  const require = (id: string): unknown => {
    if (Object.hasOwn(modules, id)) return modules[id]
    throw new Error(
      `A(z) "${id}" modul nem érhető el a sandboxban. Elérhető modulok: ${available}.`,
    )
  }
  const moduleRecord = { exports: {} as Record<string, unknown> }
  const runner = new Function(
    'require',
    'module',
    'exports',
    'console',
    `return (async () => {\n${compiled}\n})()`,
  ) as (
    require: (id: string) => unknown,
    module: { exports: Record<string, unknown> },
    exports: Record<string, unknown>,
    console: SandboxConsole,
  ) => Promise<void>
  await runner(require, moduleRecord, moduleRecord.exports, sandboxConsole)
}
