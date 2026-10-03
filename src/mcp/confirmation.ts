import { digestHex, hmacHex, timingSafeEqual } from '../core/crypto'
import { ToolInputError } from './arguments'

export const DEFAULT_CONFIRMATION_TTL_MS = 900_000

const SECRET_BYTES = 32
const SIGNATURE_LENGTH = 32
const IDEMPOTENCY_KEY_LENGTH = 20
const TOKEN_PATTERN = /^([0-9a-z]+)\.([0-9a-f]+)$/

export interface ConfirmationOptions {
  readonly secret?: string | Uint8Array | undefined
  readonly ttlMs?: number | undefined
  readonly now: () => Date
}

export interface IssuedConfirmation {
  readonly token: string
  readonly expiresAt: string
}

export interface Confirmations {
  issue(action: string, payload: unknown): Promise<IssuedConfirmation>
  verify(action: string, payload: unknown, token: unknown, previewTool: string): Promise<void>
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  )
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value)) ?? 'null'
}

export async function idempotencyKey(
  action: string,
  day: string,
  payload: unknown,
): Promise<string> {
  const digest = await digestHex('SHA-256', `${action}\n${day}\n${canonicalJson(payload)}`)
  return digest.slice(0, IDEMPOTENCY_KEY_LENGTH).toUpperCase()
}

function randomSecret(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(SECRET_BYTES))
}

function resolveTtl(ttlMs: number | undefined): number {
  if (ttlMs === undefined) return DEFAULT_CONFIRMATION_TTL_MS
  if (!Number.isInteger(ttlMs) || ttlMs <= 0) {
    throw new TypeError(`A confirmationTtlMs pozitív egész szám legyen, kapott: ${ttlMs}`)
  }
  return ttlMs
}

export function createConfirmations(options: ConfirmationOptions): Confirmations {
  const secret = options.secret ?? randomSecret()
  const ttlMs = resolveTtl(options.ttlMs)

  const sign = async (action: string, expiresAt: number, payload: unknown): Promise<string> => {
    const signature = await hmacHex(
      'SHA-256',
      secret,
      `${action}\n${expiresAt}\n${canonicalJson(payload)}`,
    )
    return signature.slice(0, SIGNATURE_LENGTH)
  }

  return {
    async issue(action, payload) {
      const expiresAt = options.now().getTime() + ttlMs
      const signature = await sign(action, expiresAt, payload)
      return {
        token: `${expiresAt.toString(36)}.${signature}`,
        expiresAt: new Date(expiresAt).toISOString(),
      }
    },
    async verify(action, payload, token, previewTool) {
      const again = `Hívd meg újra a ${previewTool} eszközt pontosan ezekkel az adatokkal, mutasd meg az előnézetet a felhasználónak, és a jóváhagyása után az új kóddal próbáld újra.`
      if (typeof token !== 'string' || token.trim() === '') {
        throw new ToolInputError(`Hiányzik a megerősítő kód (confirmation). ${again}`)
      }
      const match = TOKEN_PATTERN.exec(token.trim())
      const expiresAt = match?.[1] === undefined ? Number.NaN : Number.parseInt(match[1], 36)
      if (!match?.[2] || !Number.isSafeInteger(expiresAt)) {
        throw new ToolInputError(`A megerősítő kód formátuma érvénytelen. ${again}`)
      }
      if (options.now().getTime() > expiresAt) {
        throw new ToolInputError(`A megerősítő kód lejárt. ${again}`)
      }
      const expected = await sign(action, expiresAt, payload)
      if (!timingSafeEqual(expected, match[2])) {
        throw new ToolInputError(
          `A megerősítő kód nem ehhez a kéréshez tartozik (az adatok eltérnek az előnézettől). ${again}`,
        )
      }
    },
  }
}
