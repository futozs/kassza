import type { AgentAction } from './actions'
import { SzamlazzError, type SzamlazzErrorCategory } from './errors'
import type { CookieStore } from './session'

export const ATTEMPT_LEDGER_TTL_SECONDS = 86_400
export const ATTEMPT_LEDGER_KEY_PREFIX = 'szamlazz:attempts:'

export interface AttemptLedgerRequest {
  readonly action: AgentAction
  readonly xml: string
  readonly attachments?: readonly { readonly filename: string; readonly size: number }[]
}

const COUNTED_CATEGORIES: ReadonlySet<SzamlazzErrorCategory> = new Set([
  'auth',
  'account',
  'validation',
  'maintenance',
  'rate_limit',
  'network',
  'timeout',
  'unexpected_response',
  'unknown',
])

export function countsAsFailedAttempt(error: SzamlazzError): boolean {
  return COUNTED_CATEGORIES.has(error.category)
}

const encoder = new TextEncoder()

export async function attemptLedgerKey(request: AttemptLedgerRequest): Promise<string> {
  const attachments = (request.attachments ?? [])
    .map((attachment) => `${attachment.filename}:${attachment.size}`)
    .join('|')
  const digest = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`${request.action}\n${request.xml}\n${attachments}`),
  )
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'))
  return `${ATTEMPT_LEDGER_KEY_PREFIX}${hex.join('')}`
}

function parseCount(value: string | undefined | null): number {
  if (value === undefined || value === null) return 0
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
}

export interface AttemptLedger {
  failures(key: string): Promise<number>
  recordFailure(key: string, previous: number): Promise<number>
  reset(key: string): Promise<void>
}

export function createAttemptLedger(store: CookieStore): AttemptLedger {
  return {
    async failures(key) {
      return parseCount(await store.get(key))
    },
    async recordFailure(key, previous) {
      const next = previous + 1
      await store.set(key, String(next), ATTEMPT_LEDGER_TTL_SECONDS)
      return next
    },
    async reset(key) {
      await store.delete(key)
    },
  }
}

export function attemptLimitError(
  action: AgentAction,
  key: string,
  failures: number,
): SzamlazzError {
  return new SzamlazzError(
    `Ezt a kérést már ${failures} alkalommal sikertelenül küldtük el, ezért a kassza nem küldi el újra.`,
    {
      category: 'attempt_limit',
      action,
      details: { attemptKey: key },
      hint: 'A Számlázz.hu szabályai szerint öt sikertelen próbálkozás után emberi beavatkozás kell, különben kitiltás jöhet. Javítsd a hibát, majd a kassza.resetAttempts(error) hívással töröld a számlálót.',
    },
  )
}
