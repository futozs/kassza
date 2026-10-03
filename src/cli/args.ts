export class CliUsageError extends Error {
  override readonly name: string = 'CliUsageError'
}

export interface ArgSpec {
  readonly booleans?: readonly string[] | undefined
  readonly values?: readonly string[] | undefined
}

export interface ParsedArgs {
  readonly positionals: readonly string[]
  readonly flags: ReadonlyMap<string, string | true>
}

function splitFlag(token: string): { readonly name: string; readonly inline: string | undefined } {
  const body = token.slice(2)
  const separator = body.indexOf('=')
  return separator === -1
    ? { name: body, inline: undefined }
    : { name: body.slice(0, separator), inline: body.slice(separator + 1) }
}

export function parseArgs(argv: readonly string[], spec: ArgSpec = {}): ParsedArgs {
  const booleans = new Set(spec.booleans ?? [])
  const values = new Set(spec.values ?? [])
  const positionals: string[] = []
  const flags = new Map<string, string | true>()
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index] ?? ''
    if (token === '--') {
      positionals.push(...argv.slice(index + 1))
      break
    }
    if (!token.startsWith('--') || token === '-') {
      positionals.push(token)
      continue
    }
    const { name, inline } = splitFlag(token)
    if (booleans.has(name)) {
      if (inline !== undefined) throw new CliUsageError(`A --${name} kapcsolónak nincs értéke.`)
      flags.set(name, true)
      continue
    }
    if (!values.has(name)) throw new CliUsageError(`Ismeretlen kapcsoló: --${name}`)
    const value = inline ?? argv[index + 1]
    if (value === undefined || (inline === undefined && value.startsWith('--'))) {
      throw new CliUsageError(`A --${name} kapcsolóhoz érték kell.`)
    }
    if (inline === undefined) index++
    flags.set(name, value)
  }
  return { positionals, flags }
}

export function flagValue(args: ParsedArgs, name: string): string | undefined {
  const value = args.flags.get(name)
  return typeof value === 'string' ? value : undefined
}

export function hasFlag(args: ParsedArgs, name: string): boolean {
  return args.flags.get(name) === true
}
