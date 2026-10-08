import type { CookieStore } from '../core/session'
import { atomicOperations } from './scripts'
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
  eval?(script: string, options: { keys: string[]; arguments: string[] }): Promise<unknown>
}

export function nodeRedisCookieStore(
  client: NodeRedisLike,
  options?: CookieStoreAdapterOptions,
): CookieStore {
  const base: CookieStore = {
    async get(key) {
      return readCookieValue(await client.get(prefixKey(options, key)))
    },
    async set(key, value, ttlSeconds) {
      await client.set(prefixKey(options, key), value, { EX: wholeSeconds(ttlSeconds, 1) })
    },
    async delete(key) {
      await client.del(prefixKey(options, key))
    },
  }
  const evaluate = client.eval?.bind(client)
  if (!evaluate) return finalizeCookieStore(base, options)
  const atomic = atomicOperations(
    (script, key, args) => evaluate(script, { keys: [key], arguments: args }),
    (key) => prefixKey(options, key),
    (ttlSeconds) => wholeSeconds(ttlSeconds, 1),
  )
  return finalizeCookieStore({ ...base, ...atomic }, options)
}
