import type { RequestOptions } from '../core/context'
import { SzamlazzError } from '../core/errors'
import type { KeyValueStore } from '../core/store'
import type { WarningHook } from '../core/warnings'
import { type TaxpayerInfo, toTaxpayerId } from './query-taxpayer'

export const TAXPAYER_CACHE_KEY_PREFIX = 'szamlazz:taxpayer:'
export const DEFAULT_TAXPAYER_TTL_SECONDS = 86_400
export const DEFAULT_TAXPAYER_INVALID_TTL_SECONDS = 600

export interface TaxpayerCacheOptions {
  readonly store: KeyValueStore
  readonly ttlSeconds?: number | undefined
  readonly invalidTtlSeconds?: number | undefined
}

export type TaxpayerQuery = (taxNumber: string, options?: RequestOptions) => Promise<TaxpayerInfo>

function positiveSeconds(value: number | undefined, fallback: number, field: string): number {
  if (value === undefined) return fallback
  if (!Number.isFinite(value) || value < 1) {
    throw new SzamlazzError(`A(z) ${field} legalább 1 másodperc legyen, kapott: ${String(value)}`, {
      category: 'configuration',
    })
  }
  return Math.ceil(value)
}

function parseCached(value: string | undefined | null): TaxpayerInfo | undefined {
  if (typeof value !== 'string' || value === '') return undefined
  try {
    const parsed: unknown = JSON.parse(value)
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const info = parsed as TaxpayerInfo
    return typeof info.valid === 'boolean' && Array.isArray(info.addresses) ? info : undefined
  } catch {
    return undefined
  }
}

export function cachedTaxpayerQuery(
  query: TaxpayerQuery,
  options: TaxpayerCacheOptions,
  warn?: WarningHook,
): TaxpayerQuery {
  const ttl = positiveSeconds(options.ttlSeconds, DEFAULT_TAXPAYER_TTL_SECONDS, 'ttlSeconds')
  const invalidTtl = positiveSeconds(
    options.invalidTtlSeconds,
    DEFAULT_TAXPAYER_INVALID_TTL_SECONDS,
    'invalidTtlSeconds',
  )
  const report = (operation: 'get' | 'set', error: unknown): void =>
    warn?.({
      kind: 'cache',
      message: `Az adószám-gyorsítótár "${operation}" művelete sikertelen, a kassza a Számlázz.hu-tól kérdez.`,
      error,
      action: 'queryTaxpayer',
      operation,
    })
  return async (taxNumber, requestOptions) => {
    const key = `${TAXPAYER_CACHE_KEY_PREFIX}${toTaxpayerId(taxNumber)}`
    try {
      const cached = parseCached(await options.store.get(key))
      if (cached) return cached
    } catch (error) {
      report('get', error)
    }
    const info = await query(taxNumber, requestOptions)
    try {
      await options.store.set(key, JSON.stringify(info), info.valid ? ttl : invalidTtl)
    } catch (error) {
      report('set', error)
    }
    return info
  }
}
