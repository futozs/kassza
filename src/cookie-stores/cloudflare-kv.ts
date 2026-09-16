import type { CookieStore } from '../core/session'
import {
  type CookieStoreAdapterOptions,
  finalizeCookieStore,
  prefixKey,
  readCookieValue,
  wholeSeconds,
} from './shared'

export const CLOUDFLARE_KV_MIN_TTL_SECONDS = 60

export interface CloudflareKvNamespaceLike {
  get(key: string): Promise<string | null>
  put(key: string, value: string, options: { expirationTtl: number }): Promise<void>
  delete(key: string): Promise<void>
}

export function cloudflareKvCookieStore(
  namespace: CloudflareKvNamespaceLike,
  options?: CookieStoreAdapterOptions,
): CookieStore {
  return finalizeCookieStore(
    {
      async get(key) {
        return readCookieValue(await namespace.get(prefixKey(options, key)))
      },
      async set(key, value, ttlSeconds) {
        await namespace.put(prefixKey(options, key), value, {
          expirationTtl: wholeSeconds(ttlSeconds, CLOUDFLARE_KV_MIN_TTL_SECONDS),
        })
      },
      async delete(key) {
        await namespace.delete(prefixKey(options, key))
      },
    },
    options,
  )
}
