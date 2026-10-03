import { createKasszaMcpServer } from '../mcp/server'
import { flagValue, hasFlag, type ParsedArgs } from './args'
import { AGENT_KEY_ENV, ALLOW_WRITE_ENV, type CliIo, readDefaults } from './io'

const TRUTHY: ReadonlySet<string> = new Set(['1', 'true', 'yes', 'igen'])

export function writeAllowed(io: CliIo, args: ParsedArgs): boolean {
  if (hasFlag(args, 'allow-write')) return true
  const value = io.env[ALLOW_WRITE_ENV]?.trim().toLowerCase()
  return value !== undefined && TRUTHY.has(value)
}

export async function mcpCommand(io: CliIo, args: ParsedArgs): Promise<number> {
  const allowWrite = writeAllowed(io, args)
  const agentKey = io.env[AGENT_KEY_ENV]?.trim()
  const server = createKasszaMcpServer({
    ...(agentKey ? { agentKey } : {}),
    ...(io.fetch ? { fetch: io.fetch } : {}),
    ...(io.now ? { now: io.now } : {}),
    defaults: await readDefaults(io, flagValue(args, 'defaults')),
    allowWrite,
  })
  io.stderr(
    `kassza MCP szerver fut (${allowWrite ? 'írás engedélyezve' : 'csak olvasás'}).${agentKey ? '' : ` Figyelem: hiányzik a ${AGENT_KEY_ENV}, a Számlázz.hu-t hívó eszközök hibát adnak.`}\n`,
  )
  const connection = server.connect()
  for await (const line of io.stdinLines()) {
    const response = await connection.handleLine(line)
    if (response !== undefined) io.stdout(`${response}\n`)
  }
  return 0
}
