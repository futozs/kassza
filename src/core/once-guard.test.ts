import { afterEach, describe, expect, test, vi } from 'vitest'
import { SzamlazzError } from './errors'
import {
  DEFAULT_LOCK_TTL_SECONDS,
  guardOnce,
  inflightOnceCount,
  ONCE_LOCK_KEY_PREFIX,
  type OnceGuard,
  onceLockKey,
} from './once-guard'
import { type KeyValueStore, memoryStore } from './store'
import type { KasszaWarning } from './warnings'

afterEach(() => {
  vi.useRealTimers()
})

function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const joined = (value: { created: boolean }) => ({ ...value, created: false })

describe('guardOnce folyamaton belül', () => {
  test('guard nélkül egyszerűen lefuttatja', async () => {
    const run = vi.fn(async (recheck: boolean) => ({ created: true, recheck }))
    expect(await guardOnce(undefined, 'k', {}, run, joined)).toEqual({
      created: true,
      recheck: false,
    })
  })

  test('az azonos kulcsú hívások az első eredményét kapják created: false-szal', async () => {
    const guard: OnceGuard = { scope: 'a' }
    const gate = deferred<{ created: boolean }>()
    const run = vi.fn(() => gate.promise)

    const first = guardOnce(guard, 'k', {}, run, joined)
    const second = guardOnce(guard, 'k', {}, run, joined)
    gate.resolve({ created: true })

    expect(await first).toEqual({ created: true })
    expect(await second).toEqual({ created: false })
    expect(run).toHaveBeenCalledOnce()
    expect(inflightOnceCount()).toBe(0)
  })

  test('más scope vagy más kulcs nem csatlakozik', async () => {
    const run = vi.fn(async () => ({ created: true }))
    await Promise.all([
      guardOnce({ scope: 'a' }, 'k', {}, run, joined),
      guardOnce({ scope: 'b' }, 'k', {}, run, joined),
      guardOnce({ scope: 'a' }, 'm', {}, run, joined),
    ])
    expect(run).toHaveBeenCalledTimes(3)
  })

  test('ha az első elbukik, a várakozó recheck: true-val maga fut le', async () => {
    const guard: OnceGuard = { scope: 'a' }
    const gate = deferred<{ created: boolean }>()
    const calls: boolean[] = []
    const run = (recheck: boolean) => {
      calls.push(recheck)
      return calls.length === 1 ? gate.promise : Promise.resolve({ created: true })
    }

    const first = guardOnce(guard, 'k', {}, run, joined)
    const second = guardOnce(guard, 'k', {}, run, joined)
    gate.reject(new SzamlazzError('hálózat', { category: 'network' }))

    await expect(first).rejects.toMatchObject({ category: 'network' })
    expect(await second).toEqual({ created: true })
    expect(calls).toEqual([false, true])
  })

  test('több várakozó közül az első bukás után csak egy fut, a többi hozzá csatlakozik', async () => {
    const guard: OnceGuard = { scope: 'a' }
    const gate = deferred<{ created: boolean }>()
    let runs = 0
    const run = () => {
      runs += 1
      return runs === 1 ? gate.promise : Promise.resolve({ created: true })
    }

    const all = Promise.allSettled([1, 2, 3, 4].map(() => guardOnce(guard, 'k', {}, run, joined)))
    gate.reject(new Error('elbukott'))
    const settled = await all

    expect(runs).toBe(2)
    expect(settled.filter((result) => result.status === 'fulfilled')).toHaveLength(3)
  })

  test('in_progress, store_unavailable és configuration hibát a várakozók is megkapják', async () => {
    for (const category of ['in_progress', 'store_unavailable', 'configuration'] as const) {
      const guard: OnceGuard = { scope: category }
      const gate = deferred<{ created: boolean }>()
      const run = vi.fn(() => gate.promise)
      const first = guardOnce(guard, 'k', {}, run, joined)
      const second = guardOnce(guard, 'k', {}, run, joined)
      gate.reject(new SzamlazzError('x', { category }))

      await expect(first).rejects.toMatchObject({ category })
      await expect(second).rejects.toMatchObject({ category })
      expect(run).toHaveBeenCalledOnce()
    }
  })

  test('a várakozó megszakítása az első bukása után abort hibát ad', async () => {
    const guard: OnceGuard = { scope: 'abort' }
    const gate = deferred<{ created: boolean }>()
    const controller = new AbortController()
    const first = guardOnce(guard, 'k', {}, () => gate.promise, joined)
    const second = guardOnce(guard, 'k', { signal: controller.signal }, () => gate.promise, joined)
    controller.abort(new Error('megszakítva'))
    gate.reject(new Error('elbukott'))

    await expect(first).rejects.toThrow('elbukott')
    await expect(second).rejects.toThrow('megszakítva')
  })
})

describe('guardOnce elosztott zárral', () => {
  test('megszerzi és felszabadítja a zárat, a kulcs nem tartalmazza a scope-ot', async () => {
    const lock = memoryStore()
    const setIfAbsent = vi.spyOn(lock, 'setIfAbsent' as never)
    const guard: OnceGuard = { scope: 'titkos-kulcs', lock }
    let seenKey = ''
    const result = await guardOnce(
      guard,
      'invoice:1',
      {},
      async () => {
        seenKey = await onceLockKey('titkos-kulcs', 'invoice:1')
        expect(await lock.get(seenKey)).toBeTypeOf('string')
        return { created: true }
      },
      joined,
    )

    expect(result).toEqual({ created: true })
    expect(seenKey.startsWith(ONCE_LOCK_KEY_PREFIX)).toBe(true)
    expect(seenKey).not.toContain('titkos')
    expect(await lock.get(seenKey)).toBeUndefined()
    expect(setIfAbsent).toHaveBeenCalledWith(seenKey, expect.any(String), DEFAULT_LOCK_TTL_SECONDS)
  })

  test('hiba esetén is felszabadítja a zárat', async () => {
    const lock = memoryStore()
    const key = await onceLockKey('s', 'k')
    await expect(
      guardOnce(
        { scope: 's', lock },
        'k',
        {},
        async () => {
          throw new Error('kiállítás hiba')
        },
        joined,
      ),
    ).rejects.toThrow('kiállítás hiba')
    expect(await lock.get(key)).toBeUndefined()
  })

  test('foglalt zárnál vár, a felszabadulás után recheck: true-val fut', async () => {
    const lock = memoryStore()
    const key = await onceLockKey('s', 'k')
    await lock.set(key, 'masik-folyamat', 60)
    setTimeout(() => lock.delete(key), 30)
    const run = vi.fn(async (recheck: boolean) => ({ created: !recheck }))

    const result = await guardOnce({ scope: 's', lock }, 'k', { lockWaitMs: 5_000 }, run, joined)

    expect(run).toHaveBeenCalledWith(true)
    expect(result).toEqual({ created: false })
  })

  test('ha a zár a várakozási időn belül nem szabadul fel, in_progress hibát dob', async () => {
    const lock = memoryStore()
    await lock.set(await onceLockKey('s', 'k'), 'masik', 60)
    const run = vi.fn(async () => ({ created: true }))

    const error = await guardOnce({ scope: 's', lock }, 'k', { lockWaitMs: 20 }, run, joined).catch(
      (caught: unknown) => caught,
    )

    expect(error).toBeInstanceOf(SzamlazzError)
    expect(error).toMatchObject({ category: 'in_progress', details: { reference: 'k' } })
    expect((error as SzamlazzError).retryable).toBe(false)
    expect(run).not.toHaveBeenCalled()
  })

  test('lockWaitMs: 0 esetén azonnal in_progress', async () => {
    const lock = memoryStore()
    await lock.set(await onceLockKey('s', 'k'), 'masik', 60)
    await expect(
      guardOnce(
        { scope: 's', lock },
        'k',
        { lockWaitMs: 0 },
        async () => ({ created: true }),
        joined,
      ),
    ).rejects.toMatchObject({ category: 'in_progress' })
  })

  test('a várakozás megszakítható', async () => {
    const lock = memoryStore()
    await lock.set(await onceLockKey('s', 'k'), 'masik', 60)
    const controller = new AbortController()
    setTimeout(() => controller.abort(new Error('mégse')), 10)
    await expect(
      guardOnce(
        { scope: 's', lock },
        'k',
        { signal: controller.signal },
        async () => ({ created: true }),
        joined,
      ),
    ).rejects.toThrow('mégse')
  })

  test('setIfAbsent nélküli tárolóval configuration hibát dob', async () => {
    const lock: KeyValueStore = {
      get: () => undefined,
      set: () => undefined,
      delete: () => undefined,
    }
    await expect(
      guardOnce({ scope: 's', lock }, 'k', {}, async () => ({ created: true }), joined),
    ).rejects.toMatchObject({ category: 'configuration' })
  })

  test('elérhetetlen tárolónál alapból store_unavailable, proceed módban figyelmeztet és fut', async () => {
    const warnings: KasszaWarning[] = []
    const broken: KeyValueStore = {
      ...memoryStore(),
      setIfAbsent: () => Promise.reject(new Error('Redis leállt')),
    }
    const guard: OnceGuard = { scope: 's', lock: broken, warn: (w) => warnings.push(w) }

    await expect(
      guardOnce(guard, 'k', {}, async () => ({ created: true }), joined),
    ).rejects.toMatchObject({ category: 'store_unavailable' })
    expect(
      await guardOnce(
        guard,
        'k',
        { lockFailure: 'proceed' },
        async () => ({ created: true }),
        joined,
      ),
    ).toEqual({ created: true })
    expect(warnings).toMatchObject([{ kind: 'lock', operation: 'setIfAbsent' }])
  })

  test('deleteIfEquals nélkül get + delete-tel enged el, és nem törli a más tokenjét', async () => {
    const inner = memoryStore()
    const lock: KeyValueStore = {
      get: (key) => inner.get(key),
      set: (key, value, ttl) => inner.set(key, value, ttl),
      delete: (key) => inner.delete(key),
      setIfAbsent: (key, value, ttl) => inner.setIfAbsent?.(key, value, ttl) ?? false,
    }
    const key = await onceLockKey('s', 'k')

    await guardOnce({ scope: 's', lock }, 'k', {}, async () => ({ created: true }), joined)
    expect(await lock.get(key)).toBeUndefined()

    await guardOnce(
      { scope: 's', lock },
      'k',
      {},
      async () => {
        await inner.set(key, 'masik-folyamat-tokenje', 60)
        return { created: true }
      },
      joined,
    )
    expect(await lock.get(key)).toBe('masik-folyamat-tokenje')
  })

  test('a felszabadítás hibája figyelmeztetés, nem dobott hiba', async () => {
    const warnings: KasszaWarning[] = []
    const lock: KeyValueStore = {
      ...memoryStore(),
      deleteIfEquals: () => Promise.reject(new Error('timeout')),
    }
    const result = await guardOnce(
      { scope: 's', lock, warn: (w) => warnings.push(w) },
      'k',
      {},
      async () => ({ created: true }),
      joined,
    )
    expect(result).toEqual({ created: true })
    expect(warnings).toMatchObject([{ kind: 'lock', operation: 'release' }])
  })

  test('a hívás szintű lock felülírja, a lock: false kikapcsolja a guard zárát', async () => {
    const own = memoryStore()
    const other = memoryStore()
    const ownSpy = vi.spyOn(own, 'setIfAbsent' as never)
    const otherSpy = vi.spyOn(other, 'setIfAbsent' as never)
    const run = async () => ({ created: true })

    await guardOnce({ scope: 's', lock: own }, 'k', { lock: other }, run, joined)
    await guardOnce({ scope: 's', lock: own }, 'k', { lock: false }, run, joined)

    expect(ownSpy).not.toHaveBeenCalled()
    expect(otherSpy).toHaveBeenCalledOnce()
  })

  test('érvénytelen zárbeállításokra configuration hibát dob', async () => {
    const guard: OnceGuard = { scope: 's', lock: memoryStore() }
    const run = async () => ({ created: true })
    for (const options of [
      { lockTtlSeconds: 0 },
      { lockTtlSeconds: Number.NaN },
      { lockWaitMs: -1 },
      { lockWaitMs: Number.POSITIVE_INFINITY },
      { lockFailure: 'ignore' as never },
    ]) {
      await expect(guardOnce(guard, 'k', options, run, joined)).rejects.toMatchObject({
        category: 'configuration',
      })
    }
  })

  test('a tört TTL-t felfelé kerekíti', async () => {
    const lock = memoryStore()
    const spy = vi.spyOn(lock, 'setIfAbsent' as never)
    await guardOnce(
      { scope: 's', lock },
      'k',
      { lockTtlSeconds: 1.2 },
      async () => ({ created: true }),
      joined,
    )
    expect(spy).toHaveBeenCalledWith(expect.any(String), expect.any(String), 2)
  })
})
