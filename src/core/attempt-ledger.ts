import type { AgentAction } from './actions'
import { SzamlazzError, type SzamlazzErrorCategory } from './errors'
import type { KeyValueStore } from './store'

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

export type AttemptLedgerMode = 'fail-open' | 'fail-closed'

export const LOCAL_ATTEMPT_LIMIT = 1000

export interface AttemptLedger {
  failures(key: string): Promise<number>
  fallbackFailures(key: string): number
  recordFailure(key: string): Promise<void>
  reset(key: string): Promise<void>
}

interface LocalCount {
  readonly count: number
  readonly expiresAt: number
}

function createLocalCounter(): {
  get(key: string): number
  bump(key: string): void
  clear(key: string): void
} {
  const counts = new Map<string, LocalCount>()
  const get = (key: string): number => {
    const entry = counts.get(key)
    if (!entry) return 0
    if (entry.expiresAt <= Date.now()) {
      counts.delete(key)
      return 0
    }
    return entry.count
  }
  return {
    get,
    bump(key) {
      const count = get(key) + 1
      counts.delete(key)
      counts.set(key, { count, expiresAt: Date.now() + ATTEMPT_LEDGER_TTL_SECONDS * 1000 })
      if (counts.size > LOCAL_ATTEMPT_LIMIT) {
        const oldest = counts.keys().next().value
        if (oldest !== undefined) counts.delete(oldest)
      }
    },
    clear(key) {
      counts.delete(key)
    },
  }
}

export function createAttemptLedger(store: KeyValueStore): AttemptLedger {
  const local = createLocalCounter()
  const unpersisted = createLocalCounter()
  return {
    async failures(key) {
      return parseCount(await store.get(key)) + unpersisted.get(key)
    },
    fallbackFailures(key) {
      return local.get(key)
    },
    async recordFailure(key) {
      local.bump(key)
      try {
        if (store.increment) {
          await store.increment(key, ATTEMPT_LEDGER_TTL_SECONDS)
          return
        }
        const current = parseCount(await store.get(key))
        await store.set(key, String(current + 1), ATTEMPT_LEDGER_TTL_SECONDS)
      } catch (error) {
        unpersisted.bump(key)
        throw error
      }
    },
    async reset(key) {
      local.clear(key)
      unpersisted.clear(key)
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
