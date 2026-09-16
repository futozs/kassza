import type { CookieStore } from '../core/session'

export type CookieStoreOperation = 'get' | 'set' | 'delete'

export interface CookieStoreErrorEvent {
  readonly operation: CookieStoreOperation
  readonly key: string
  readonly error: unknown
}

export interface ResilientCookieStoreOptions {
  readonly onError?: ((event: CookieStoreErrorEvent) => void) | undefined
  readonly timeoutMs?: number | undefined
}

function warnCookieStoreError(event: CookieStoreErrorEvent): void {
  console.warn(
    `[szamlazz] A session cookie store "${event.operation}" művelete sikertelen, a kérés session nélkül folytatódik.`,
    event.error,
  )
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number | undefined,
  operation: CookieStoreOperation,
): Promise<T> {
  if (timeoutMs === undefined) return promise
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          `A session cookie store "${operation}" művelete nem fejeződött be ${timeoutMs} ms alatt.`,
        ),
      )
    }, timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

export function resilientCookieStore(
  store: CookieStore,
  options: ResilientCookieStoreOptions = {},
): CookieStore {
  const onError = options.onError ?? warnCookieStoreError
  if (options.timeoutMs !== undefined && !(options.timeoutMs > 0)) {
    throw new RangeError(`A timeoutMs pozitív szám legyen, kapott: ${options.timeoutMs}`)
  }

  function report(operation: CookieStoreOperation, key: string, error: unknown): void {
    try {
      onError({ operation, key, error })
    } catch {
      return
    }
  }

  async function run<T>(
    operation: CookieStoreOperation,
    key: string,
    call: () => T | Promise<T>,
  ): Promise<T | undefined> {
    try {
      return await withTimeout(Promise.resolve().then(call), options.timeoutMs, operation)
    } catch (error) {
      report(operation, key, error)
      return undefined
    }
  }

  return {
    async get(key) {
      return (await run('get', key, () => store.get(key))) ?? undefined
    },
    async set(key, value, ttlSeconds) {
      await run('set', key, () => store.set(key, value, ttlSeconds))
    },
    async delete(key) {
      await run('delete', key, () => store.delete(key))
    },
  }
}
