import type { CookieStore } from '../core/session'
import {
  type CookieStoreAdapterOptions,
  finalizeCookieStore,
  prefixKey,
  readCookieValue,
  wholeSeconds,
} from './shared'

export interface NodeRedisLike {
  get(key: string): Promise<unknown>
  set(key: string, value: string, options: { EX: number }): Promise<unknown>
  del(key: string): Promise<unknown>
}

export function nodeRedisCookieStore(
  client: NodeRedisLike,
  options?: CookieStoreAdapterOptions,
): CookieStore {
  return finalizeCookieStore(
    {
      async get(key) {
        return readCookieValue(await client.get(prefixKey(options, key)))
      },
      async set(key, value, ttlSeconds) {
        await client.set(prefixKey(options, key), value, { EX: wholeSeconds(ttlSeconds, 1) })
      },
      async delete(key) {
        await client.del(prefixKey(options, key))
      },
    },
    options,
  )
}
