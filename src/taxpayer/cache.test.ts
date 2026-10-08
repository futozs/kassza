import { describe, expect, test, vi } from 'vitest'
import { fakeKassza } from '../../tests/fake-agent'
import { SzamlazzError } from '../core/errors'
import { type KeyValueStore, memoryStore } from '../core/store'
import type { KasszaWarning } from '../core/warnings'
import {
  cachedTaxpayerQuery,
  DEFAULT_TAXPAYER_INVALID_TTL_SECONDS,
  DEFAULT_TAXPAYER_TTL_SECONDS,
  TAXPAYER_CACHE_KEY_PREFIX,
} from './cache'
import type { TaxpayerInfo } from './query-taxpayer'

const VALID: TaxpayerInfo = { valid: true, name: 'Példa Kft.', addresses: [] }
const INVALID: TaxpayerInfo = { valid: false, addresses: [] }

describe('cachedTaxpayerQuery', () => {
  test('ugyanazt az adószámot csak egyszer kérdezi le, a formátumtól függetlenül', async () => {
    const query = vi.fn(async () => VALID)
    const cached = cachedTaxpayerQuery(query, { store: memoryStore() })

    expect(await cached('12345678-2-42')).toEqual(VALID)
    expect(await cached('HU 12345678')).toEqual(VALID)
    expect(query).toHaveBeenCalledOnce()
  })

  test('az érvényes eredményt hosszan, az érvénytelent röviden tartja', async () => {
    const store = memoryStore()
    const set = vi.spyOn(store, 'set')
    const cached = cachedTaxpayerQuery(
      vi.fn(async (taxNumber: string) => (taxNumber.startsWith('1') ? VALID : INVALID)),
      { store },
    )

    await cached('12345678')
    await cached('22345678')

    expect(set.mock.calls.map((call) => [call[0], call[2]])).toEqual([
      [`${TAXPAYER_CACHE_KEY_PREFIX}12345678`, DEFAULT_TAXPAYER_TTL_SECONDS],
      [`${TAXPAYER_CACHE_KEY_PREFIX}22345678`, DEFAULT_TAXPAYER_INVALID_TTL_SECONDS],
    ])
  })

  test('a hibát nem gyorsítótárazza, az érvénytelen adószámot el sem küldi', async () => {
    const query = vi
      .fn()
      .mockRejectedValueOnce(new SzamlazzError('hálózat', { category: 'network' }))
      .mockResolvedValue(VALID)
    const cached = cachedTaxpayerQuery(query, { store: memoryStore() })

    await expect(cached('12345678')).rejects.toMatchObject({ category: 'network' })
    expect(await cached('12345678')).toEqual(VALID)
    await expect(cached('nem adószám')).rejects.toMatchObject({ category: 'validation' })
    expect(query).toHaveBeenCalledTimes(2)
  })

  test('a tároló hibája figyelmeztetés, a lekérdezés megtörténik', async () => {
    const warnings: KasszaWarning[] = []
    const broken: KeyValueStore = {
      get: () => Promise.reject(new Error('le')),
      set: () => Promise.reject(new Error('le')),
      delete: () => undefined,
    }
    const cached = cachedTaxpayerQuery(vi.fn(async () => VALID), { store: broken }, (warning) =>
      warnings.push(warning),
    )

    expect(await cached('12345678')).toEqual(VALID)
    expect(warnings.map((warning) => [warning.kind, warning.operation])).toEqual([
      ['cache', 'get'],
      ['cache', 'set'],
    ])
  })

  test('a sérült gyorsítótár-bejegyzést figyelmen kívül hagyja', async () => {
    const store = memoryStore()
    await store.set(`${TAXPAYER_CACHE_KEY_PREFIX}12345678`, '{"valid":"igen"}', 60)
    await store.set(`${TAXPAYER_CACHE_KEY_PREFIX}22345678`, 'nem json', 60)
    const query = vi.fn(async () => VALID)
    const cached = cachedTaxpayerQuery(query, { store })

    await cached('12345678')
    await cached('22345678')

    expect(query).toHaveBeenCalledTimes(2)
  })

  test('érvénytelen TTL-re configuration hibát dob', () => {
    expect(() => cachedTaxpayerQuery(vi.fn(), { store: memoryStore(), ttlSeconds: 0 })).toThrow(
      SzamlazzError,
    )
    expect(() =>
      cachedTaxpayerQuery(vi.fn(), { store: memoryStore(), invalidTtlSeconds: Number.NaN }),
    ).toThrow(SzamlazzError)
  })

  test('a kliensben a taxpayerCache beállítással működik', async () => {
    const { agent, kassza } = fakeKassza(
      { taxpayers: { '12345678': { name: 'Példa Kft.' } } },
      { taxpayerCache: { store: memoryStore() } },
    )

    const first = await kassza.taxpayer.query('12345678-2-42')
    const second = await kassza.taxpayer.query('12345678')

    expect(first).toEqual(second)
    expect(agent.requests.filter((request) => request.action === 'queryTaxpayer')).toHaveLength(1)
  })
})
