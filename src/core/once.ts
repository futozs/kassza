import type { RequestOptions } from './context'
import { SzamlazzError, type SzamlazzErrorCategory } from './errors'

export interface CreateOnceOptions extends RequestOptions {
  readonly lookupFirst?: boolean | undefined
  readonly matchOrderNumber?: boolean | undefined
  readonly recoveryDelayMs?: number | undefined
}

export const DEFAULT_RECOVERY_DELAY_MS = 1_000
export const RECOVERY_LOOKUPS = 2

const UNCERTAIN_CATEGORIES: ReadonlySet<SzamlazzErrorCategory> = new Set([
  'network',
  'timeout',
  'partial_success',
  'duplicate',
  'unexpected_response',
  'unknown',
])

export function isUncertainOutcome(error: unknown): error is SzamlazzError {
  return error instanceof SzamlazzError && UNCERTAIN_CATEGORIES.has(error.category)
}

export function resolveRecoveryDelay(value: number | undefined): number {
  if (value === undefined) return DEFAULT_RECOVERY_DELAY_MS
  if (!Number.isFinite(value) || value < 0) {
    throw new SzamlazzError(`A recoveryDelayMs értéke nemnegatív szám legyen, kapott: ${value}`, {
      category: 'configuration',
    })
  }
  return value
}

export function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (ms <= 0) return Promise.resolve()
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

export async function recoverAfterFailure<T>(
  lookup: () => Promise<T | null>,
  delayMs: number,
  signal: AbortSignal | undefined,
): Promise<T | null> {
  for (let attempt = 1; attempt <= RECOVERY_LOOKUPS; attempt++) {
    await wait(delayMs * attempt, signal)
    const found = await lookup().catch((error: unknown) => {
      if (error instanceof SzamlazzError && error.retryable) return undefined
      throw error
    })
    if (found) return found
  }
  return null
}

export function unknownOutcomeError(error: SzamlazzError, reference: string): SzamlazzError {
  return new SzamlazzError(error.message, {
    category: error.category,
    code: error.code,
    action: error.action,
    httpStatus: error.httpStatus,
    rawResponse: error.rawResponse,
    details: { ...error.details, outcome: 'unknown', reference },
    hint: `Nem tudni biztosan, hogy a(z) ${reference} bizonylat elkészült-e, és a visszakeresés sem találta meg. Ne állítsd ki kézzel újra: később hívd meg ugyanígy a createOnce-t, az előbb visszakeres.`,
    cause: error,
  })
}
