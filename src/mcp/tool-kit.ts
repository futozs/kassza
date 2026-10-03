import type { Kassza, KasszaDefaults } from '../client'
import type { Confirmations } from './confirmation'
import type { JsonObject } from './protocol'

export interface McpToolContext {
  readonly client: () => Kassza
  readonly defaults: KasszaDefaults
  readonly confirmations: Confirmations
  readonly now: () => Date
  readonly recoveryDelayMs: number
}

export interface McpToolOutput {
  readonly summary: string
  readonly data: JsonObject
}

export interface McpToolAnnotations {
  readonly readOnlyHint: boolean
  readonly destructiveHint: boolean
  readonly idempotentHint: boolean
  readonly openWorldHint: boolean
}

export interface McpTool {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly inputSchema: JsonObject
  readonly annotations: McpToolAnnotations
  readonly write: boolean
  run(args: JsonObject, context: McpToolContext): Promise<McpToolOutput>
}

export const LOCAL_READ: McpToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
}

export const REMOTE_READ: McpToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
}

export const REMOTE_CREATE: McpToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
}

export const REMOTE_REVERSE: McpToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
}

const amountFormat = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 2 })

export function money(value: number, currency: string): string {
  return `${amountFormat.format(value)} ${currency}`
}

export function plainJson(value: unknown): JsonObject {
  return JSON.parse(
    JSON.stringify(value, (_key, entry: unknown) =>
      entry instanceof Uint8Array ? undefined : entry,
    ),
  )
}

export function lines(...parts: readonly (string | false | undefined)[]): string {
  return parts.filter((part): part is string => typeof part === 'string' && part !== '').join('\n')
}

export interface SplitConfirmation {
  readonly payload: JsonObject
  readonly confirmation: unknown
}

export function splitConfirmation(args: JsonObject): SplitConfirmation {
  const { confirmation, ...payload } = args
  return { payload, confirmation }
}
