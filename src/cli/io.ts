import { createKassza, type Kassza, type KasszaDefaults } from '../client'
import { SzamlazzError } from '../core/errors'

export interface CliIo {
  readonly argv: readonly string[]
  readonly env: Readonly<Record<string, string | undefined>>
  readonly nodeVersion: string
  stdout(text: string): void
  stderr(text: string): void
  readFile(path: string): Promise<string>
  readStdin(): Promise<string>
  stdinLines(): AsyncIterable<string>
  readonly fetch?: typeof globalThis.fetch | undefined
  readonly now?: (() => Date) | undefined
}

export class CliError extends Error {
  override readonly name: string = 'CliError'
}

export const AGENT_KEY_ENV = 'SZAMLAZZ_AGENT_KEY'
export const ALLOW_WRITE_ENV = 'KASSZA_MCP_ALLOW_WRITE'

export function agentKeyOf(io: CliIo): string {
  const key = io.env[AGENT_KEY_ENV]?.trim()
  if (!key) {
    throw new SzamlazzError(
      `Hiányzik az Agent kulcs: állítsd be a ${AGENT_KEY_ENV} környezeti változót.`,
      { category: 'configuration' },
    )
  }
  return key
}

export function cliKassza(io: CliIo, defaults: KasszaDefaults = {}): Kassza {
  return createKassza({
    agentKey: agentKeyOf(io),
    defaults,
    ...(io.fetch ? { fetch: io.fetch } : {}),
  })
}

export async function readText(io: CliIo, path: string): Promise<string> {
  if (path === '-') return io.readStdin()
  try {
    return await io.readFile(path)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new CliError(`A(z) ${path} fájl nem olvasható: ${reason}`)
  }
}

export async function readJson(io: CliIo, path: string): Promise<unknown> {
  const text = await readText(io, path)
  try {
    return JSON.parse(text)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new CliError(`A(z) ${path} nem érvényes JSON: ${reason}`)
  }
}

export function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export async function readDefaults(io: CliIo, path: string | undefined): Promise<KasszaDefaults> {
  if (path === undefined) return {}
  const value = await readJson(io, path)
  if (!isRecord(value)) {
    throw new CliError(`A(z) ${path} fájlnak KasszaDefaults objektumot kell tartalmaznia.`)
  }
  return value as KasszaDefaults
}

export function printJson(io: CliIo, value: unknown): void {
  io.stdout(
    `${JSON.stringify(value, (_key, entry: unknown) => (entry instanceof Uint8Array ? undefined : entry), 2)}\n`,
  )
}
