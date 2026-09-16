import type { CookieStore } from '../core/session'
import { type CookieStoreAdapterOptions, finalizeCookieStore, prefixKey } from './shared'

export function customCookieStore(
  store: CookieStore,
  options?: CookieStoreAdapterOptions,
): CookieStore {
  return finalizeCookieStore(
    {
      get: (key) => store.get(prefixKey(options, key)),
      set: (key, value, ttlSeconds) => store.set(prefixKey(options, key), value, ttlSeconds),
      delete: (key) => store.delete(prefixKey(options, key)),
    },
    options,
  )
}
