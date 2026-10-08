import type { CookieStore } from '../core/session'
import { atomicOperations } from './scripts'
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
  eval?(script: string, numKeys: number, ...args: string[]): Promise<unknown>
}

export function ioredisCookieStore(
  redis: IoRedisLike,
  options?: CookieStoreAdapterOptions,
): CookieStore {
  const base: CookieStore = {
    async get(key) {
      return readCookieValue(await redis.get(prefixKey(options, key)))
    },
    async set(key, value, ttlSeconds) {
      await redis.set(prefixKey(options, key), value, 'EX', wholeSeconds(ttlSeconds, 1))
    },
    async delete(key) {
      await redis.del(prefixKey(options, key))
    },
  }
  const evaluate = redis.eval?.bind(redis)
  if (!evaluate) return finalizeCookieStore(base, options)
  const atomic = atomicOperations(
    (script, key, args) => evaluate(script, 1, key, ...args),
    (key) => prefixKey(options, key),
    (ttlSeconds) => wholeSeconds(ttlSeconds, 1),
  )
  return finalizeCookieStore({ ...base, ...atomic }, options)
}
