export const SET_IF_ABSENT_SCRIPT =
  "if redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[2]) then return 1 else return 0 end"

export const INCREMENT_SCRIPT =
  "local value = redis.call('INCR', KEYS[1]) redis.call('EXPIRE', KEYS[1], ARGV[1]) return value"

export const DELETE_IF_EQUALS_SCRIPT =
  "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end"

export function scriptNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) {
    throw new TypeError(`A Redis szkript nem számot adott vissza: ${String(value)}`)
  }
  return parsed
}

export type ScriptRunner = (script: string, key: string, args: string[]) => Promise<unknown>

export interface AtomicOperations {
  setIfAbsent(key: string, value: string, ttlSeconds: number): Promise<boolean>
  increment(key: string, ttlSeconds: number): Promise<number>
  deleteIfEquals(key: string, value: string): Promise<boolean>
}

export function atomicOperations(
  run: ScriptRunner,
  prefixed: (key: string) => string,
  seconds: (ttlSeconds: number) => number,
): AtomicOperations {
  return {
    async setIfAbsent(key, value, ttlSeconds) {
      const result = await run(SET_IF_ABSENT_SCRIPT, prefixed(key), [
        value,
        String(seconds(ttlSeconds)),
      ])
      return scriptNumber(result) === 1
    },
    async increment(key, ttlSeconds) {
      return scriptNumber(await run(INCREMENT_SCRIPT, prefixed(key), [String(seconds(ttlSeconds))]))
    },
    async deleteIfEquals(key, value) {
      return scriptNumber(await run(DELETE_IF_EQUALS_SCRIPT, prefixed(key), [value])) > 0
    },
  }
}
