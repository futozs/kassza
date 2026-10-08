import { describe, expect, test } from 'vitest'
import { createTestContext, invoiceXmlResponse, textErrorResponse } from '../../tests/helpers'
import {
  ATTEMPT_LEDGER_KEY_PREFIX,
  ATTEMPT_LEDGER_TTL_SECONDS,
  attemptLedgerKey,
  countsAsFailedAttempt,
  createAttemptLedger,
} from './attempt-ledger'
import { MAX_ATTEMPTS_PER_REQUEST } from './context'
import { SzamlazzError } from './errors'
import { type AgentResponse, throwIfAnyError } from './response'
import { type CookieStore, memoryCookieStore } from './session'

const XML = '<?xml version="1.0" encoding="UTF-8"?><xmlszamla/>'
const SUCCESS = invoiceXmlResponse('<sikeres>true</sikeres><szamlaszam>E-1</szamlaszam>')

function strict(response: AgentResponse): number {
  throwIfAnyError(response)
  return response.status
}

function recordingStore(): CookieStore & { readonly ttls: number[] } {
  const inner = memoryCookieStore()
  const ttls: number[] = []
  return {
    ttls,
    get: (key) => inner.get(key),
    set: (key, value, ttl) => {
      ttls.push(ttl)
      return inner.set(key, value, ttl)
    },
    delete: (key) => inner.delete(key),
  }
}

describe('attemptLedgerKey', () => {
  test('azonos kérésre azonos, eltérőre eltérő kulcsot ad', async () => {
    const a = await attemptLedgerKey({ action: 'createInvoice', xml: XML })
    const b = await attemptLedgerKey({ action: 'createInvoice', xml: XML })
    const c = await attemptLedgerKey({ action: 'createReceipt', xml: XML })
    const d = await attemptLedgerKey({
      action: 'createInvoice',
      xml: XML,
      attachments: [{ filename: 'a.pdf', size: 3 }],
    })

    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).not.toBe(d)
    expect(a.startsWith(ATTEMPT_LEDGER_KEY_PREFIX)).toBe(true)
    expect(a).toMatch(/^szamlazz:attempts:[0-9a-f]{64}$/)
  })
})

describe('createAttemptLedger', () => {
  test('a sikertelen próbálkozásokat 24 órás lejárattal számolja', async () => {
    const store = recordingStore()
    const ledger = createAttemptLedger(store)

    expect(await ledger.failures('k')).toBe(0)
    await ledger.recordFailure('k')
    await ledger.recordFailure('k')
    expect(await ledger.failures('k')).toBe(2)
    expect(store.ttls).toEqual([ATTEMPT_LEDGER_TTL_SECONDS, ATTEMPT_LEDGER_TTL_SECONDS])

    await ledger.reset('k')
    expect(await ledger.failures('k')).toBe(0)
  })

  test('az érvénytelen tárolt értéket nullának veszi', async () => {
    const store = memoryCookieStore()
    await store.set('k', 'nem szám', 60)
    await store.set('m', '-3', 60)

    const ledger = createAttemptLedger(store)

    expect(await ledger.failures('k')).toBe(0)
    expect(await ledger.failures('m')).toBe(0)
  })
})

describe('countsAsFailedAttempt', () => {
  test('a végleges válaszokat nem számolja sikertelen próbálkozásnak', () => {
    const counted = ['validation', 'network', 'timeout', 'maintenance', 'auth'] as const
    const ignored = ['not_found', 'duplicate', 'partial_success', 'configuration'] as const

    for (const category of counted) {
      expect(countsAsFailedAttempt(new SzamlazzError('x', { category }))).toBe(true)
    }
    for (const category of ignored) {
      expect(countsAsFailedAttempt(new SzamlazzError('x', { category }))).toBe(false)
    }
  })
})

describe('createAgentContext attemptLedger', () => {
  test('öt sikertelen próbálkozás után a hatodikat el sem küldi', async () => {
    const store = memoryCookieStore()
    const { ctx, agent } = createTestContext(textErrorResponse('XML hiba', 57), {
      attemptLedger: store,
    })
    const request = { action: 'createInvoice' as const, xml: XML }

    for (let index = 0; index < MAX_ATTEMPTS_PER_REQUEST; index++) {
      await expect(ctx.execute(request, strict)).rejects.toMatchObject({ code: 57 })
    }
    const error = await ctx.execute(request, strict).catch((caught: unknown) => caught)

    expect(agent.calls).toHaveLength(MAX_ATTEMPTS_PER_REQUEST)
    expect(error).toBeInstanceOf(SzamlazzError)
    expect(error).toMatchObject({ category: 'attempt_limit', action: 'createInvoice' })
    expect((error as SzamlazzError).details?.attemptKey).toMatch(/^szamlazz:attempts:/)
  })

  test('a processzek közös store-ján is összeadja a próbálkozásokat', async () => {
    const store = memoryCookieStore()
    const first = createTestContext(textErrorResponse('XML hiba', 57), { attemptLedger: store })
    const second = createTestContext(textErrorResponse('XML hiba', 57), { attemptLedger: store })
    const request = { action: 'createReceipt' as const, xml: XML }

    for (let index = 0; index < 3; index++) {
      await first.ctx.execute(request, strict).catch(() => undefined)
    }
    for (let index = 0; index < 2; index++) {
      await second.ctx.execute(request, strict).catch(() => undefined)
    }

    await expect(second.ctx.execute(request, strict)).rejects.toMatchObject({
      category: 'attempt_limit',
    })
    expect(first.agent.calls.length + second.agent.calls.length).toBe(5)
  })

  test('siker után nullázza a számlálót', async () => {
    const store = memoryCookieStore()
    const { ctx } = createTestContext(
      [textErrorResponse('XML hiba', 57), textErrorResponse('XML hiba', 57), SUCCESS],
      { attemptLedger: store },
    )
    const request = { action: 'createInvoice' as const, xml: XML }
    const key = await attemptLedgerKey(request)

    await ctx.execute(request, strict).catch(() => undefined)
    await ctx.execute(request, strict).catch(() => undefined)
    expect(await store.get(key)).toBe('2')

    await ctx.execute(request, strict)

    expect(await store.get(key)).toBeUndefined()
  })

  test('a nem található választ nem számolja', async () => {
    const store = memoryCookieStore()
    const { ctx } = createTestContext(
      { headers: { szlahu_error_code: '7' } },
      {
        attemptLedger: store,
      },
    )
    const request = { action: 'getInvoiceXml' as const, xml: XML }

    for (let index = 0; index < 8; index++) {
      await expect(
        ctx.execute(request, (response) => {
          throw new SzamlazzError('nincs', {
            category: 'not_found',
            code: 7,
            action: response.action,
          })
        }),
      ).rejects.toMatchObject({ category: 'not_found' })
    }

    expect(await store.get(await attemptLedgerKey(request))).toBeUndefined()
  })

  test('a resetAttempts törli a számlálót, és újra enged küldeni', async () => {
    const store = memoryCookieStore()
    const { ctx, agent } = createTestContext(textErrorResponse('XML hiba', 57), {
      attemptLedger: store,
    })
    const request = { action: 'createInvoice' as const, xml: XML }
    for (let index = 0; index < MAX_ATTEMPTS_PER_REQUEST; index++) {
      await ctx.execute(request, strict).catch(() => undefined)
    }
    const error = (await ctx.execute(request, strict).catch((caught) => caught)) as
      | SzamlazzError
      | undefined

    await ctx.resetAttempts(error?.details?.attemptKey ?? '')
    await ctx.execute(request, strict).catch(() => undefined)

    expect(agent.calls).toHaveLength(MAX_ATTEMPTS_PER_REQUEST + 1)
  })

  test('ha a store elérhetetlen, a kérés napló nélkül lefut', async () => {
    const broken: CookieStore = {
      get: () => {
        throw new Error('redis le')
      },
      set: () => {
        throw new Error('redis le')
      },
      delete: () => {
        throw new Error('redis le')
      },
    }
    const { ctx } = createTestContext([textErrorResponse('XML hiba', 57), SUCCESS], {
      attemptLedger: broken,
    })
    const request = { action: 'createInvoice' as const, xml: XML }

    await expect(ctx.execute(request, strict)).rejects.toMatchObject({ code: 57 })
    await expect(ctx.execute(request, strict)).resolves.toBe(200)
    await expect(ctx.resetAttempts('k')).rejects.toThrow('redis le')
  })

  test('napló nélkül a resetAttempts nem csinál semmit', async () => {
    const { ctx } = createTestContext(SUCCESS)

    await expect(ctx.resetAttempts('k')).resolves.toBeUndefined()
  })

  test('a mellékletek méretét is beleszámolja a kulcsba', async () => {
    const store = memoryCookieStore()
    const { ctx } = createTestContext(textErrorResponse('XML hiba', 57), { attemptLedger: store })
    const base = { action: 'createInvoice' as const, xml: XML }

    await ctx
      .execute(
        {
          ...base,
          attachments: [
            { filename: 'a.txt', content: 'árvíztűrő' },
            { filename: 'b.bin', content: new Blob(['abc']) },
            { filename: 'c.bin', content: new Uint8Array([1, 2]).buffer },
          ],
        },
        strict,
      )
      .catch(() => undefined)

    const key = await attemptLedgerKey({
      ...base,
      attachments: [
        { filename: 'a.txt', size: new TextEncoder().encode('árvíztűrő').byteLength },
        { filename: 'b.bin', size: 3 },
        { filename: 'c.bin', size: 2 },
      ],
    })
    expect(await store.get(key)).toBe('1')
  })
})

describe('createAgentContext maintenanceCooldownMs', () => {
  test('karbantartási hiba után a megadott ideig nem küld kérést, és nem próbál újra', async () => {
    const { ctx, agent } = createTestContext(
      [textErrorResponse('Rendszerkarbantartás', 1), SUCCESS],
      { maintenanceCooldownMs: 60_000 },
    )
    const request = { action: 'getInvoicePdf' as const, xml: XML, safeToRetry: true }

    await expect(ctx.execute(request, strict)).rejects.toMatchObject({ code: 1 })
    const blocked = await ctx.execute(request, strict).catch((error: unknown) => error)

    expect(agent.calls).toHaveLength(1)
    expect(blocked).toMatchObject({ category: 'maintenance', code: undefined })
    expect((blocked as SzamlazzError).message).toContain('másodpercig nem küld kérést')
  })

  test('a lejárat után újra küld', async () => {
    const { ctx, agent } = createTestContext(
      [textErrorResponse('Rendszerkarbantartás', 1), SUCCESS],
      { maintenanceCooldownMs: 1 },
    )
    const request = { action: 'getInvoicePdf' as const, xml: XML }

    await ctx.execute(request, strict).catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 5))
    await expect(ctx.execute(request, strict)).resolves.toBe(200)
    expect(agent.calls).toHaveLength(2)
  })

  test('érvénytelen értékre konfigurációs hibát dob', () => {
    expect(() => createTestContext(SUCCESS, { maintenanceCooldownMs: -1 })).toThrow(
      /maintenanceCooldownMs/,
    )
    expect(() => createTestContext(SUCCESS, { maintenanceCooldownMs: Number.NaN })).toThrow(
      /maintenanceCooldownMs/,
    )
  })
})
