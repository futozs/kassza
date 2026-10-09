import { isSzamlazzError } from '../core/errors'
import { KASSZA_VERSION } from '../core/version'
import { type ArgSpec, CliUsageError, flagValue, hasFlag, type ParsedArgs, parseArgs } from './args'
import {
  invoiceGetCommand,
  navSummaryCommand,
  receiptGetCommand,
  verifyCommand,
  xmlPreviewCommand,
} from './commands'
import { formatDoctor, formatDoctorReport, runDoctor } from './doctor'
import { CliError, type CliIo, printJson } from './io'
import { mcpCommand } from './mcp'

export const CLI_USAGE: string = `kassza ${KASSZA_VERSION}: Számlázz.hu Számla Agent parancssor

Használat: kassza <parancs> [kapcsolók]

Parancsok:
  doctor [--invoice <szám> | --receipt <szám>] [--capabilities] [--check-update] [--json | --report]
      A környezet, az Agent kulcs, az óra és a Számlázz.hu kapcsolat ellenőrzése.
      --capabilities: e-számla engedély előnézettel (bizonylat nem készül)
      --check-update: az npm legfrissebb verziójának lekérdezése (hálózati hívás)
      --report: titokmentes Markdown jelentés hibajegyhez
  verify
      Az Agent kulcs ellenőrzése a Számlázz.hu-n.
  xml preview <fájl.json|-> [--type invoice|receipt] [--defaults <fájl.json>]
      Kiírja azt az Agent XML-t, amit a kassza küldene (az Agent kulcs nélkül).
  invoice get <számlaszám> | --order <rendelésszám> | --external <azonosító>
      Számla lekérdezése JSON-ban.
  receipt get <nyugtaszám> | --order <rendelésszám>
      Nyugta lekérdezése JSON-ban.
  nav summary --file <nyugták.json|-> [--from ÉÉÉÉ-HH-NN] [--to ÉÉÉÉ-HH-NN] [--include-test] [--json]
      Napi, áfakategóriánkénti NAV nyugta-összesítő kassza nyugtákból.
  mcp [--allow-write] [--defaults <fájl.json>]
      MCP szerver stdio-n (Claude, Cursor és más MCP kliensek számára).

Környezeti változók:
  SZAMLAZZ_AGENT_KEY       a Számla Agent kulcs (kisbetűs)
  KASSZA_MCP_ALLOW_WRITE   1 esetén az MCP szerver kiállíthat és sztornózhat
`

const SPECS: Readonly<Record<string, ArgSpec>> = {
  doctor: {
    booleans: ['json', 'report', 'capabilities', 'check-update'],
    values: ['invoice', 'receipt'],
  },
  verify: {},
  'xml preview': { values: ['type', 'defaults'] },
  'invoice get': { values: ['order', 'external'] },
  'receipt get': { values: ['order'] },
  'nav summary': { booleans: ['include-test', 'json'], values: ['file', 'from', 'to'] },
  mcp: { booleans: ['allow-write'], values: ['defaults'] },
}

function commandOf(argv: readonly string[]): string | undefined {
  const [first, second] = argv
  if (first === undefined) return undefined
  const pair = second === undefined ? undefined : `${first} ${second}`
  if (pair !== undefined && pair in SPECS) return pair
  return first in SPECS ? first : undefined
}

async function doctorCommand(io: CliIo, args: ParsedArgs): Promise<number> {
  const checks = await runDoctor(io, {
    invoiceNumber: flagValue(args, 'invoice'),
    receiptNumber: flagValue(args, 'receipt'),
    capabilities: hasFlag(args, 'capabilities'),
    checkUpdate: hasFlag(args, 'check-update'),
  })
  if (hasFlag(args, 'json')) printJson(io, { checks })
  else if (hasFlag(args, 'report')) {
    io.stdout(formatDoctorReport(checks, { nodeVersion: io.nodeVersion }))
  } else io.stdout(`kassza doctor ${KASSZA_VERSION}\n${formatDoctor(checks)}`)
  return checks.some((check) => check.status === 'fail') ? 1 : 0
}

const MAX_POSITIONALS: Readonly<Record<string, number>> = {
  doctor: 1,
  verify: 1,
  'xml preview': 3,
  'invoice get': 3,
  'receipt get': 3,
  'nav summary': 2,
  mcp: 1,
}

function assertArity(command: string, positionals: readonly string[]): void {
  const extra = positionals.slice(MAX_POSITIONALS[command] ?? positionals.length)
  if (extra.length > 0) throw new CliUsageError(`Fölösleges argumentum: ${extra.join(' ')}`)
}

async function dispatch(io: CliIo, command: string, argv: readonly string[]): Promise<number> {
  const args = parseArgs(argv, SPECS[command])
  assertArity(command, args.positionals)
  if (command === 'doctor') return doctorCommand(io, args)
  switch (command) {
    case 'verify':
      return verifyCommand(io)
    case 'xml preview':
      return xmlPreviewCommand(io, args)
    case 'invoice get':
      return invoiceGetCommand(io, args)
    case 'receipt get':
      return receiptGetCommand(io, args)
    case 'nav summary':
      return navSummaryCommand(io, args)
    default:
      return mcpCommand(io, args)
  }
}

function errorMessage(error: unknown): string {
  if (isSzamlazzError(error)) {
    return error.hint ? `${error.message}\nTipp: ${error.hint}` : error.message
  }
  return error instanceof Error ? error.message : String(error)
}

export async function runCli(io: CliIo): Promise<number> {
  const argv = io.argv
  const first = argv[0]
  if (first === undefined) {
    io.stderr(CLI_USAGE)
    return 2
  }
  if (first === 'help' || first === '--help' || first === '-h') {
    io.stdout(CLI_USAGE)
    return 0
  }
  if (first === '--version' || first === '-v') {
    io.stdout(`${KASSZA_VERSION}\n`)
    return 0
  }
  const command = commandOf(argv)
  if (command === undefined) {
    io.stderr(`Ismeretlen parancs: ${argv.slice(0, 2).join(' ')}\n\n${CLI_USAGE}`)
    return 2
  }
  try {
    return await dispatch(io, command, argv)
  } catch (error) {
    if (error instanceof CliUsageError) {
      io.stderr(`${error.message}\nSegítség: kassza help\n`)
      return 2
    }
    if (error instanceof CliError || isSzamlazzError(error)) {
      io.stderr(`${errorMessage(error)}\n`)
      return 1
    }
    io.stderr(`Váratlan hiba: ${errorMessage(error)}\n`)
    return 1
  }
}
