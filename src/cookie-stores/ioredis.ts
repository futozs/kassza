import type { CookieStore } from '../core/session'
import {
  type CookieStoreAdapterOptions,
  finalizeCookieStore,
  prefixKey,
  readCookieValue,
  wholeSeconds,
} from './shared'

export interface IoRedisLike {
  get(key: string): Promise<unknown>
  set(key: string, value: string, expiryMode: 'EX', seconds: number): Promise<unknown>
  del(key: string): Promise<unknown>
}

export function ioredisCookieStore(
  redis: IoRedisLike,
  options?: CookieStoreAdapterOptions,
): CookieStore {
  return finalizeCookieStore(
    {
      async get(key) {
        return readCookieValue(await redis.get(prefixKey(options, key)))
      },
      async set(key, value, ttlSeconds) {
        await redis.set(prefixKey(options, key), value, 'EX', wholeSeconds(ttlSeconds, 1))
      },
      async delete(key) {
        await redis.del(prefixKey(options, key))
      },
    },
    options,
  )
}
