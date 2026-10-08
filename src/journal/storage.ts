import { SzamlazzError } from '../core/errors'
import type { KeyValueStore } from '../core/store'
import { daysOf, inRange, normalizeRange } from './dates'
import type {
  JournalDocumentKind,
  JournalEntry,
  JournalRange,
  JournalReservation,
  JournalStorage,
} from './types'

export const JOURNAL_KEY_PREFIX = 'szamlazz:journal:'
export const DEFAULT_JOURNAL_RETENTION_DAYS = 400
export const DEFAULT_RESERVATION_TTL_DAYS = 30
const DAY_IN_SECONDS = 86_400
const READ_BATCH = 50

export interface KvJournalOptions {
  readonly prefix?: string | undefined
  readonly retentionDays?: number | undefined
  readonly reservationTtlDays?: number | undefined
}

function configurationError(message: string): SzamlazzError {
  return new SzamlazzError(message, { category: 'configuration' })
}

function positiveDays(value: number | undefined, fallback: number, field: string): number {
  if (value === undefined) return fallback
  if (!Number.isFinite(value) || value < 1) {
    throw configurationError(`A(z) ${field} legalább 1 nap legyen, kapott: ${String(value)}`)
  }
  return Math.ceil(value)
}

function parseJson<T>(
  value: string | undefined | null,
  guard: (parsed: unknown) => boolean,
): T | undefined {
  if (typeof value !== 'string' || value === '') return undefined
  try {
    const parsed: unknown = JSON.parse(value)
    return guard(parsed) ? (parsed as T) : undefined
  } catch {
    return undefined
  }
}

function isEntry(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    (entry.kind === 'invoice' || entry.kind === 'receipt') &&
    typeof entry.number === 'string' &&
    typeof entry.date === 'string'
  )
}

function isReservation(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false
  const reservation = value as Record<string, unknown>
  return (
    (reservation.kind === 'invoice' || reservation.kind === 'receipt') &&
    typeof reservation.orderNumber === 'string' &&
    typeof reservation.date === 'string'
  )
}

function slotTarget(value: string | undefined | null): [JournalDocumentKind, string] | undefined {
  if (typeof value !== 'string') return undefined
  const separator = value.indexOf(':')
  if (separator <= 0) return undefined
  const kind = value.slice(0, separator)
  if (kind !== 'invoice' && kind !== 'receipt') return undefined
  return [kind, value.slice(separator + 1)]
}

async function inBatches<T, R>(items: readonly T[], run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = []
  for (let index = 0; index < items.length; index += READ_BATCH) {
    results.push(...(await Promise.all(items.slice(index, index + READ_BATCH).map(run))))
  }
  return results
}

export function kvJournal(store: KeyValueStore, options: KvJournalOptions = {}): JournalStorage {
  const increment = store.increment?.bind(store)
  if (!increment) {
    throw configurationError(
      'A naplóhoz olyan tároló kell, amely atomikusan tud számlálót növelni (increment), különben párhuzamos írásnál bejegyzés veszhet el. Használd a kassza/stores Redis, Upstash vagy Durable Object tárolóját. A Cloudflare KV erre nem alkalmas.',
    )
  }
  const prefix = options.prefix ?? JOURNAL_KEY_PREFIX
  const retention =
    positiveDays(options.retentionDays, DEFAULT_JOURNAL_RETENTION_DAYS, 'retentionDays') *
    DAY_IN_SECONDS
  const reservationTtl =
    positiveDays(options.reservationTtlDays, DEFAULT_RESERVATION_TTL_DAYS, 'reservationTtlDays') *
    DAY_IN_SECONDS
  const entryKey = (kind: JournalDocumentKind, number: string): string =>
    `${prefix}entry:${kind}:${number}`
  const reservationKey = (kind: JournalDocumentKind, orderNumber: string): string =>
    `${prefix}reservation:${kind}:${orderNumber}`

  async function appendToDay(index: 'day' | 'rday', day: string, target: string, ttl: number) {
    const slot = await increment?.(`${prefix}${index}:${day}:count`, ttl)
    await store.set(`${prefix}${index}:${day}:${slot}`, target, ttl)
  }

  async function slotsOf(index: 'day' | 'rday', range: JournalRange): Promise<string[]> {
    const targets: string[] = []
    for (const day of daysOf(range)) {
      const count = Number.parseInt((await store.get(`${prefix}${index}:${day}:count`)) ?? '0', 10)
      if (!Number.isInteger(count) || count < 1) continue
      const slots = Array.from(
        { length: count },
        (_, slot) => `${prefix}${index}:${day}:${slot + 1}`,
      )
      for (const value of await inBatches(slots, async (key) => store.get(key))) {
        if (typeof value === 'string') targets.push(value)
      }
    }
    return [...new Set(targets)]
  }

  return {
    async getEntry(kind, number) {
      return parseJson<JournalEntry>(await store.get(entryKey(kind, number)), isEntry)
    },
    async putEntry(entry) {
      const key = entryKey(entry.kind, entry.number)
      const existing = await store.get(key)
      if (existing !== undefined && existing !== null) return false
      await appendToDay('day', entry.date, `${entry.kind}:${entry.number}`, retention)
      const value = JSON.stringify(entry)
      if (store.setIfAbsent) return store.setIfAbsent(key, value, retention)
      await store.set(key, value, retention)
      return true
    },
    async listEntries(range) {
      const normalized = normalizeRange(range)
      const targets = (await slotsOf('day', normalized))
        .map(slotTarget)
        .filter((t) => t !== undefined)
      const entries = await inBatches(targets, async ([kind, number]) =>
        parseJson<JournalEntry>(await store.get(entryKey(kind, number)), isEntry),
      )
      return entries.filter(
        (entry): entry is JournalEntry => entry !== undefined && inRange(entry.date, normalized),
      )
    },
    async putReservation(reservation) {
      const key = reservationKey(reservation.kind, reservation.orderNumber)
      const value = JSON.stringify(reservation)
      if (store.setIfAbsent) {
        if (!(await store.setIfAbsent(key, value, reservationTtl))) return
      } else {
        await store.set(key, value, reservationTtl)
      }
      await appendToDay(
        'rday',
        reservation.date,
        `${reservation.kind}:${reservation.orderNumber}`,
        reservationTtl,
      )
    },
    async deleteReservation(kind, orderNumber) {
      await store.delete(reservationKey(kind, orderNumber))
    },
    async listReservations(range) {
      const normalized = normalizeRange(range)
      const targets = (await slotsOf('rday', normalized))
        .map(slotTarget)
        .filter((t) => t !== undefined)
      const reservations = await inBatches(targets, async ([kind, orderNumber]) =>
        parseJson<JournalReservation>(
          await store.get(reservationKey(kind, orderNumber)),
          isReservation,
        ),
      )
      return reservations.filter(
        (reservation): reservation is JournalReservation => reservation !== undefined,
      )
    },
  }
}

export function memoryJournal(): JournalStorage {
  const entries = new Map<string, JournalEntry>()
  const reservations = new Map<string, JournalReservation>()
  const key = (kind: JournalDocumentKind, id: string): string => `${kind}:${id}`
  return {
    async getEntry(kind, number) {
      return entries.get(key(kind, number))
    },
    async putEntry(entry) {
      const id = key(entry.kind, entry.number)
      if (entries.has(id)) return false
      entries.set(id, entry)
      return true
    },
    async listEntries(range) {
      const normalized = normalizeRange(range)
      return [...entries.values()].filter((entry) => inRange(entry.date, normalized))
    },
    async putReservation(reservation) {
      const id = key(reservation.kind, reservation.orderNumber)
      if (!reservations.has(id)) reservations.set(id, reservation)
    },
    async deleteReservation(kind, orderNumber) {
      reservations.delete(key(kind, orderNumber))
    },
    async listReservations(range) {
      const normalized = normalizeRange(range)
      return [...reservations.values()].filter((reservation) =>
        inRange(reservation.date, normalized),
      )
    },
  }
}
