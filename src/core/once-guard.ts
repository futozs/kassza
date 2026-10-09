import { SzamlazzError } from './errors'
import { isUncertainOutcome } from './once'
import type { KeyValueStore } from './store'
import type { WarningHook } from './warnings'

export const ONCE_LOCK_KEY_PREFIX = 'szamlazz:once:'
export const DEFAULT_LOCK_TTL_SECONDS = 600
export const DEFAULT_LOCK_WAIT_MS = 10_000
export const LOCK_POLL_MS = 500

export type LockFailureMode = 'throw' | 'proceed'

export interface OnceLockOptions {
  readonly lock?: KeyValueStore | false | undefined
  readonly lockTtlSeconds?: number | undefined
  readonly lockWaitMs?: number | undefined
  readonly lockFailure?: LockFailureMode | undefined
  readonly signal?: AbortSignal | undefined
}

export interface OnceGuard {
  readonly scope: string
  readonly lock?: KeyValueStore | undefined
  readonly warn?: WarningHook | undefined
}

const inflight = new Map<string, Promise<unknown>>()

export function inflightOnceCount(): number {
  return inflight.size
}

function configurationError(message: string): SzamlazzError {
  return new SzamlazzError(message, { category: 'configuration' })
}

function resolveTtl(value: number | undefined): number {
  if (value === undefined) return DEFAULT_LOCK_TTL_SECONDS
  if (!Number.isFinite(value) || value < 1) {
    throw configurationError(
      `A lockTtlSeconds értéke legalább 1 másodperc legyen, kapott: ${String(value)}`,
    )
  }
  return Math.ceil(value)
}

function resolveWait(value: number | undefined): number {
  if (value === undefined) return DEFAULT_LOCK_WAIT_MS
  if (!Number.isFinite(value) || value < 0) {
    throw configurationError(`A lockWaitMs értéke nemnegatív szám legyen, kapott: ${String(value)}`)
  }
  return value
}

function resolveFailureMode(value: LockFailureMode | undefined): LockFailureMode {
  if (value === undefined || value === 'throw' || value === 'proceed') return value ?? 'throw'
  throw configurationError(
    `A lockFailure értéke 'throw' vagy 'proceed' lehet, kapott: ${String(value)}`,
  )
}

const encoder = new TextEncoder()

export async function onceLockKey(scope: string, key: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`${scope}\n${key}`))
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'))
  return `${ONCE_LOCK_KEY_PREFIX}${hex.join('')}`
}

function inProgressError(reference: string, waitMs: number): SzamlazzError {
  return new SzamlazzError(
    `Egy másik folyamat éppen kiállítja ezt a bizonylatot (${reference}), ${Math.ceil(waitMs / 1000)} másodperc várakozás után sem végzett.`,
    {
      category: 'in_progress',
      details: { reference },
      hint: 'Ne állítsd ki kézzel. Néhány másodperc múlva hívd újra ugyanígy a createOnce-t: a zár felszabadulása után visszakeresi a bizonylatot. Webhookban adj vissza 5xx választ, hogy a szolgáltató később újraküldje.',
    },
  )
}

function lockUnavailableError(reference: string, error: unknown): SzamlazzError {
  return new SzamlazzError(
    `A createOnce zár tárolója nem érhető el, ezért a kassza nem állította ki a bizonylatot (${reference}).`,
    {
      category: 'store_unavailable',
      details: { reference },
      cause: error,
      hint: "Állítsd helyre a tárolót (például a Redist), és hívd újra. Ha zár nélkül is ki akarod állítani, add meg a lockFailure: 'proceed' beállítást.",
    },
  )
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function releaseLock(
  store: KeyValueStore,
  lockKey: string,
  token: string,
  warn: WarningHook | undefined,
): Promise<void> {
  try {
    if (store.deleteIfEquals) {
      await store.deleteIfEquals(lockKey, token)
      return
    }
    if ((await store.get(lockKey)) === token) await store.delete(lockKey)
  } catch (error) {
    warn?.({
      kind: 'lock',
      message:
        'A createOnce zárat nem sikerült felszabadítani. A zár a lejárati ideje végén magától megszűnik, addig az azonos bizonylatra érkező hívások in_progress hibát kapnak.',
      error,
      operation: 'release',
    })
  }
}

async function runLocked<T>(
  guard: OnceGuard,
  key: string,
  options: OnceLockOptions,
  recheck: boolean,
  run: (recheck: boolean) => Promise<T>,
): Promise<T> {
  const store = options.lock === false ? undefined : (options.lock ?? guard.lock)
  if (!store) return run(recheck)
  const setIfAbsent = store.setIfAbsent?.bind(store)
  if (!setIfAbsent) {
    throw configurationError(
      'A createOnce zárához olyan tároló kell, amely támogatja a setIfAbsent műveletet (például a kassza/stores Redis adapterei vagy a Durable Object tároló). A Cloudflare KV erre nem alkalmas.',
    )
  }
  const ttlSeconds = resolveTtl(options.lockTtlSeconds)
  const waitMs = resolveWait(options.lockWaitMs)
  const failureMode = resolveFailureMode(options.lockFailure)
  const lockKey = await onceLockKey(guard.scope, key)
  const token = crypto.randomUUID()
  const deadline = Date.now() + waitMs
  let waited = false
  for (;;) {
    let acquired: boolean
    try {
      acquired = await setIfAbsent(lockKey, token, ttlSeconds)
    } catch (error) {
      if (failureMode === 'throw') throw lockUnavailableError(key, error)
      guard.warn?.({
        kind: 'lock',
        message:
          'A createOnce zár tárolója nem érhető el, a kassza zár nélkül folytatja (lockFailure: proceed). A folyamatok közötti dupla kiállítás elleni védelem most nem él.',
        error,
        operation: 'setIfAbsent',
      })
      return run(recheck || waited)
    }
    if (acquired) break
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw inProgressError(key, waitMs)
    waited = true
    await sleep(Math.min(LOCK_POLL_MS, remaining), options.signal)
  }
  try {
    return await run(recheck || waited)
  } finally {
    await releaseLock(store, lockKey, token, guard.warn)
  }
}

function isSharedFailure(error: unknown): boolean {
  return error instanceof SzamlazzError && !isUncertainOutcome(error)
}

export async function guardOnce<T>(
  guard: OnceGuard | undefined,
  key: string,
  options: OnceLockOptions,
  run: (recheck: boolean) => Promise<T>,
  joined: (result: T) => T,
): Promise<T> {
  if (!guard) return run(false)
  const id = `${guard.scope}\n${key}`
  let recheck = false
  for (;;) {
    const pending = inflight.get(id) as Promise<T> | undefined
    if (!pending) break
    try {
      return joined(await pending)
    } catch (error) {
      if (isSharedFailure(error)) throw error
      recheck = true
    }
    options.signal?.throwIfAborted()
  }
  const leader = runLocked(guard, key, options, recheck, run)
  inflight.set(id, leader)
  try {
    return await leader
  } finally {
    if (inflight.get(id) === leader) inflight.delete(id)
  }
}
