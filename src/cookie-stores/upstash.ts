import type { CookieStore } from '../core/session'
import {
  type CookieStoreAdapterOptions,
  finalizeCookieStore,
  prefixKey,
  readCookieValue,
  wholeSeconds,
} from './shared'

export interface UpstashRedisLike {
  get(key: string): Promise<unknown>
  set(key: string, value: string, options: { ex: number }): Promise<unknown>
  del(key: string): Promise<unknown>
}

export function upstashRedisCookieStore(
  redis: UpstashRedisLike,
  options?: CookieStoreAdapterOptions,
): CookieStore {
  return finalizeCookieStore(
    {
      async get(key) {
        return readCookieValue(await redis.get(prefixKey(options, key)))
      },
      async set(key, value, ttlSeconds) {
        await redis.set(prefixKey(options, key), value, { ex: wholeSeconds(ttlSeconds, 1) })
      },
      async delete(key) {
        await redis.del(prefixKey(options, key))
      },
    },
    options,
  )
}
