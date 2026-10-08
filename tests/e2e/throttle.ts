export interface ThrottleClock {
  readonly now: () => number
  readonly sleep: (ms: number) => Promise<void>
}

export const DEFAULT_E2E_DELAY_MS = 1500

const realClock: ThrottleClock = {
  now: () => Date.now(),
  sleep: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms)
    }),
}

export function resolveDelayMs(raw: string | undefined): number {
  const parsed = raw?.trim() ? Number(raw) : Number.NaN
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_E2E_DELAY_MS
}

export function throttledFetch(
  base: typeof globalThis.fetch,
  minIntervalMs: number,
  clock: ThrottleClock = realClock,
): typeof globalThis.fetch {
  let queue: Promise<void> = Promise.resolve()
  let lastStart = Number.NEGATIVE_INFINITY
  const wrapped = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const turn = queue.then(async () => {
      const wait = lastStart + minIntervalMs - clock.now()
      if (wait > 0) await clock.sleep(wait)
      lastStart = clock.now()
    })
    queue = turn
    return turn.then(() => base(input, init))
  }
  return wrapped as typeof globalThis.fetch
}
