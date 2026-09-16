import { decodeUtf8 } from '../core/binary'
import type { CookieStore } from '../core/session'
import { type ResilientCookieStoreOptions, resilientCookieStore } from './resilient'

export interface CookieStoreAdapterOptions extends ResilientCookieStoreOptions {
  readonly prefix?: string | undefined
  readonly resilient?: boolean | undefined
}

export function prefixKey(options: CookieStoreAdapterOptions | undefined, key: string): string {
  const prefix = options?.prefix
  return prefix ? `${prefix}${key}` : key
}

export function finalizeCookieStore(
  store: CookieStore,
  options: CookieStoreAdapterOptions | undefined,
): CookieStore {
  if (options?.resilient === false) return store
  return resilientCookieStore(store, { onError: options?.onError, timeoutMs: options?.timeoutMs })
}

export function readCookieValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value === '' ? undefined : value
  if (value instanceof Uint8Array) return readCookieValue(decodeUtf8(value))
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

export function wholeSeconds(ttlSeconds: number, minimum: number): number {
  if (!Number.isFinite(ttlSeconds)) return minimum
  return Math.max(minimum, Math.ceil(ttlSeconds))
}
