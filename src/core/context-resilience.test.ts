import { afterEach, describe, expect, test, vi } from 'vitest'
import { createTestContext, textErrorResponse } from '../../tests/helpers'
import { attemptLedgerKey, createAttemptLedger } from './attempt-ledger'
import { MAX_ATTEMPTS_PER_REQUEST, MAX_RETRY_AFTER_MS, RETRY_JITTER, retryDelay } from './context'
import { SzamlazzError } from './errors'
import { type AgentResponse, throwIfAnyError } from './response'
import { type KeyValueStore, memoryStore } from './store'
import type { KasszaWarning } from './warnings'

const XML = '<?xml version="1.0" encoding="UTF-8"?><xmlszamla/>'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function strict(response: AgentResponse): number {
  throwIfAnyError(response)
  return response.status
}

function brokenStore(): KeyValueStore {
  const fail = () => Promise.reject(new Error('Redis nem elérhető'))
  return { get: fail, set: fail, delete: fail, increment: fail }
}

describe('próbálkozás-napló: atomikus növelés', () => {
  test('ha a tároló tud increment-et, azt használja, nem a get + set párost', async () => {
    const inner = memoryStore()
    const store: KeyValueStore = {
      get: vi.fn(inner.get),
      set: vi.fn(inner.set),
      delete: vi.fn(inner.delete),
      increment: vi.fn((key: string, ttl: number) => inner.increment?.(key, ttl) ?? 0),
    }
    const ledger = createAttemptLedger(store)

    await ledger.recordFailure('k')
    await ledger.recordFailure('k')

    expect(store.increment).toHaveBeenCalledTimes(2)
    expect(store.set).not.toHaveBeenCalled()
    expect(await ledger.failures('k')).toBe(2)
  })

  test('két párhuzamos folyamat nem veszít el hibát (nincs elveszett frissítés)', async () => {
    const shared = memoryStore()
    const first = createTestContext(textErrorResponse('XML hiba', 57), { attemptLedger: shared })
    const second = createTestContext(textErrorResponse('XML hiba', 57), { attemptLedger: shared })
    const request = { action: 'createInvoice' as const, xml: XML }

    await Promise.allSettled([
      first.ctx.execute(request, strict),
      second.ctx.execute(request, strict),
      first.ctx.execute(request, strict),
      second.ctx.execute(request, strict),
    ])

    expect(await shared.get(await attemptLedgerKey(request))).toBe('4')
  })

  test('increment nélküli tárolón a friss értéket növeli', async () => {
    const inner = memoryStore()
    const store: KeyValueStore = { get: inner.get, set: inner.set, delete: inner.delete }
    const ledger = createAttemptLedger(store)
    await inner.set('k', '3', 60)

    await ledger.recordFailure('k')

    expect(await inner.get('k')).toBe('4')
  })

  test('a sikertelen írás a későbbi olvasásnál is beszámít', async () => {
    const inner = memoryStore()
    let writable = false
    const store: KeyValueStore = {
      get: inner.get,
      set: inner.set,
      delete: inner.delete,
      increment: (key, ttl) =>
        writable ? (inner.increment?.(key, ttl) ?? 0) : Promise.reject(new Error('írás hiba')),
    }
    const ledger = createAttemptLedger(store)

    await expect(ledger.recordFailure('k')).rejects.toThrow('írás hiba')
    writable = true
    await ledger.recordFailure('k')

    expect(await ledger.failures('k')).toBe(2)
    await ledger.reset('k')
    expect(await ledger.failures('k')).toBe(0)
  })
})

describe('próbálkozás-napló: tárolóhiba', () => {
  test('fail-open módban figyelmeztet, és a folyamaton belüli számlálóval véd', async () => {
    const warnings: KasszaWarning[] = []
    const { ctx, agent } = createTestContext(textErrorResponse('XML hiba', 57), {
      attemptLedger: brokenStore(),
      hooks: { onWarning: (warning) => warnings.push(warning) },
    })
    const request = { action: 'createInvoice' as const, xml: XML }

    for (let index = 0; index < MAX_ATTEMPTS_PER_REQUEST; index++) {
      await expect(ctx.execute(request, strict)).rejects.toMatchObject({ code: 57 })
    }
    await expect(ctx.execute(request, strict)).rejects.toMatchObject({
      category: 'attempt_limit',
    })

    expect(agent.calls).toHaveLength(MAX_ATTEMPTS_PER_REQUEST)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]).toMatchObject({ kind: 'ledger', operation: 'get', action: 'createInvoice' })
    expect(warnings.some((warning) => warning.operation === 'increment')).toBe(true)
  })

  test('fail-closed módban el sem küldi a kérést, store_unavailable hibát dob', async () => {
    const { ctx, agent } = createTestContext(textErrorResponse('XML hiba', 57), {
      attemptLedger: brokenStore(),
      attemptLedgerMode: 'fail-closed',
    })

    const error = await ctx
      .execute({ action: 'createInvoice', xml: XML }, strict)
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(SzamlazzError)
    expect(error).toMatchObject({ category: 'store_unavailable', action: 'createInvoice' })
    expect((error as SzamlazzError).retryable).toBe(false)
    expect(agent.calls).toHaveLength(0)
  })

  test('a siker utáni nullázás hibája csak figyelmeztetés', async () => {
    const warnings: KasszaWarning[] = []
    const inner = memoryStore()
    const store: KeyValueStore = {
      ...inner,
      delete: () => Promise.reject(new Error('törlés hiba')),
    }
    const { ctx } = createTestContext(
      [textErrorResponse('XML hiba', 57), { body: 'ok', headers: {} }],
      { attemptLedger: store, hooks: { onWarning: (warning) => warnings.push(warning) } },
    )
    const request = { action: 'getInvoicePdf' as const, xml: XML }

    await ctx.execute(request, strict).catch(() => undefined)
    await expect(ctx.execute(request, (response) => response.text())).resolves.toBe('ok')

    expect(warnings).toMatchObject([{ kind: 'ledger', operation: 'delete' }])
  })

  test('érvénytelen attemptLedgerMode configuration hiba', () => {
    expect(() =>
      createTestContext({ body: '' }, { attemptLedgerMode: 'mindegy' as never }),
    ).toThrow(SzamlazzError)
  })
})

describe('onWarning: korábban csendes hibák', () => {
  test('a cookie tároló hibája session figyelmeztetés', async () => {
    const warnings: KasszaWarning[] = []
    const { ctx } = createTestContext(
      { body: 'ok', headers: { 'set-cookie': 'JSESSIONID=uj; Path=/' } },
      { cookieStore: brokenStore(), hooks: { onWarning: (warning) => warnings.push(warning) } },
    )

    await ctx.execute({ action: 'getInvoicePdf', xml: XML }, (response) => response.text())
    await ctx.resetSession()

    expect(warnings.map((warning) => [warning.kind, warning.operation])).toEqual([
      ['session', 'get'],
      ['session', 'set'],
      ['session', 'delete'],
    ])
    expect(warnings[0]?.action).toBe('getInvoicePdf')
  })

  test('a hookok szinkron és aszinkron hibája hook figyelmeztetés, a kérés folytatódik', async () => {
    const warnings: KasszaWarning[] = []
    const { ctx } = createTestContext([textErrorResponse('XML hiba', 57)], {
      hooks: {
        onRequest: () => {
          throw new Error('rossz logger')
        },
        onResponse: () => Promise.reject(new Error('aszinkron hiba')) as never,
        onError: () => {
          throw new Error('rossz hibakezelő')
        },
        onWarning: (warning) => warnings.push(warning),
      },
    })

    await expect(ctx.execute({ action: 'createInvoice', xml: XML }, strict)).rejects.toMatchObject({
      code: 57,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(warnings.map((warning) => warning.operation).sort()).toEqual([
      'onError',
      'onRequest',
      'onResponse',
    ])
    expect(warnings.every((warning) => warning.kind === 'hook')).toBe(true)
  })

  test('a dobó onWarning sem töri meg a kérést', async () => {
    const { ctx } = createTestContext(
      { body: 'ok', headers: {} },
      {
        cookieStore: brokenStore(),
        hooks: {
          onWarning: () => {
            throw new Error('a figyelmeztetés kezelője is hibás')
          },
        },
      },
    )
    await expect(
      ctx.execute({ action: 'getInvoicePdf', xml: XML }, (response) => response.text()),
    ).resolves.toBe('ok')
  })

  test('onWarning nélkül a session hiba továbbra is csendes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { ctx } = createTestContext({ body: 'ok', headers: {} }, { cookieStore: brokenStore() })
    await ctx.execute({ action: 'getInvoicePdf', xml: XML }, (response) => response.text())
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('újrapróbálás: jitter és Retry-After', () => {
  test('a késleltetés a visszalépés ±20%-án belül szór', () => {
    expect(RETRY_JITTER).toBe(0.2)
    expect(retryDelay(1_000, 1, 0)).toBe(800)
    expect(retryDelay(1_000, 1, 0.5)).toBe(1_000)
    expect(retryDelay(1_000, 1, 1)).toBe(1_200)
    expect(retryDelay(1_000, 3, 0.5)).toBe(4_000)
    expect(retryDelay(0, 4, 0.9)).toBe(0)
  })

  test('a Retry-After másodperceit kivárja a következő próbálkozás előtt', async () => {
    vi.useFakeTimers()
    const { ctx, agent } = createTestContext(
      [
        { status: 503, headers: { 'retry-after': '3', szlahu_error_code: '1' } },
        { body: 'ok', headers: {} },
      ],
      { retryDelayMs: 10, cookieStore: false },
    )

    const pending = ctx.execute(
      { action: 'getInvoicePdf', xml: XML, safeToRetry: true },
      (response) => {
        throwIfAnyError(response)
        return response.text()
      },
    )
    await vi.advanceTimersByTimeAsync(2_900)
    expect(agent.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(200)

    await expect(pending).resolves.toBe('ok')
    expect(agent.calls).toHaveLength(2)
  })

  test('a HTTP-dátum formájú Retry-After-t is érti', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-08T10:00:00Z'))
    const { ctx, agent } = createTestContext(
      [
        {
          status: 503,
          headers: { 'retry-after': 'Thu, 08 Oct 2026 10:00:02 GMT', szlahu_error_code: '1' },
        },
        { body: 'ok', headers: {} },
      ],
      { retryDelayMs: 10, cookieStore: false },
    )

    const pending = ctx.execute(
      { action: 'getInvoicePdf', xml: XML, safeToRetry: true },
      (response) => {
        throwIfAnyError(response)
        return response.text()
      },
    )
    await vi.advanceTimersByTimeAsync(1_900)
    expect(agent.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(200)
    await expect(pending).resolves.toBe('ok')
  })

  test('a túl hosszú Retry-After esetén nem próbálja újra', async () => {
    const seconds = String(MAX_RETRY_AFTER_MS / 1000 + 1)
    const { ctx, agent } = createTestContext(
      [{ status: 503, headers: { 'retry-after': seconds, szlahu_error_code: '1' } }],
      {},
    )

    await expect(
      ctx.execute({ action: 'getInvoicePdf', xml: XML, safeToRetry: true }, strict),
    ).rejects.toMatchObject({ category: 'maintenance' })
    expect(agent.calls).toHaveLength(1)
  })

  test('az értelmezhetetlen Retry-After-t figyelmen kívül hagyja', async () => {
    const { ctx, agent } = createTestContext(
      [
        { status: 503, headers: { 'retry-after': 'hamarosan', szlahu_error_code: '1' } },
        { body: 'ok', headers: {} },
      ],
      {},
    )
    await expect(
      ctx.execute({ action: 'getInvoicePdf', xml: XML, safeToRetry: true }, (response) => {
        throwIfAnyError(response)
        return response.text()
      }),
    ).resolves.toBe('ok')
    expect(agent.calls).toHaveLength(2)
  })
})
