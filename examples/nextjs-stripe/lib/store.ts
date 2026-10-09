import { Redis } from '@upstash/redis'
import { type KeyValueStore, memoryStore, upstashRedisStore } from 'kassza/stores'

export function createStore(): KeyValueStore {
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    return upstashRedisStore(Redis.fromEnv())
  }
  return memoryStore()
}
