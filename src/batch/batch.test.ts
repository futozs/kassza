import { afterEach, describe, expect, test, vi } from 'vitest'
import { FAKE_NOW, fakeKassza } from '../../tests/fake-agent'
import { SzamlazzError } from '../core/errors'
import type { CreateInvoiceInput } from '../invoices/create-types'
import { createJournal, memoryJournal } from '../journal'
import {
  type BatchItem,
  type BatchProgress,
  billingPeriod,
  billingPeriodAt,
  billingPeriodsBetween,
  MAX_BATCH_CONCURRENCY,
  runBatch,
  todayPeriod,
} from './index'

afterEach(() => {
  vi.useRealTimers()
})

const BUYER = { name: 'Előfizető Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' }

function invoiceItem(key: string, gross = 12_700): BatchItem {
  const input: CreateInvoiceInput = {
    buyer: BUYER,
    items: [{ name: `Havidíj ${key}`, grossUnitPrice: gross, vat: 27 }],
  }
  return { key, document: () => ({ kind: 'invoice', input }) }
}

function receiptItem(key: string): BatchItem {
  return {
    key,
    document: () => ({
      kind: 'receipt',
      input: { items: [{ name: 'Tagdíj', grossUnitPrice: 5_000, vat: 27 }] },
    }),
  }
}

const FAST = { ratePerMinute: 600_000, recoveryDelayMs: 0 }

describe('runBatch', () => {
  test('minden tételt kiállít, a kulcs lesz a rendelésszám', async () => {
    const { agent, kassza } = fakeKassza()
    const progress: BatchProgress[] = []

    const result = await runBatch(kassza, {
      ...FAST,
      items: [invoiceItem('SUB-1-2026-10'), invoiceItem('SUB-2-2026-10'), receiptItem('TAG-1')],
      onProgress: (event) => progress.push(event),
    })

    expect(result.created.map((item) => item.key)).toEqual([
      'SUB-1-2026-10',
      'SUB-2-2026-10',
      'TAG-1',
    ])
    expect(result.grossTotal).toBe(30_400)
    expect([...agent.invoices.values()].map((invoice) => invoice.orderNumber)).toEqual([
      'SUB-1-2026-10',
      'SUB-2-2026-10',
    ])
    expect(agent.receipts.size).toBe(1)
    expect(progress.at(-1)).toMatchObject({ total: 3, done: 3, created: 3 })
  })

  test('a megszakadt futás újraindítható, nem állít ki duplát', async () => {
    const { agent, kassza } = fakeKassza()
    const items = [invoiceItem('A'), invoiceItem('B'), invoiceItem('C')]
    await runBatch(kassza, { ...FAST, items: items.slice(0, 2) })

    const rerun = await runBatch(kassza, { ...FAST, items })

    expect(rerun.existing.map((item) => item.key)).toEqual(['A', 'B'])
    expect(rerun.created.map((item) => item.key)).toEqual(['C'])
    expect(agent.invoices.size).toBe(3)
  })

  test('egy tétel hibája nem állítja meg a többit', async () => {
    const { kassza } = fakeKassza()
    const broken: BatchItem = {
      key: 'ROSSZ',
      document: () => ({ kind: 'invoice', input: { buyer: BUYER, items: [] } }),
    }

    const result = await runBatch(kassza, {
      ...FAST,
      items: [invoiceItem('A'), broken, invoiceItem('B')],
    })

    expect(result.failed.map((item) => item.key)).toEqual(['ROSSZ'])
    expect(result.failed[0]?.error).toBeInstanceOf(SzamlazzError)
    expect(result.created).toHaveLength(2)
    expect(result.stopped).toBeUndefined()
  })

  test('a tesztfiók limitjénél (167) megáll, és nem próbálja újra', async () => {
    const { agent, kassza } = fakeKassza()
    agent.fail('testAccountLimit', { action: 'createInvoice' })

    const result = await runBatch(kassza, {
      ...FAST,
      items: [invoiceItem('A'), invoiceItem('B'), invoiceItem('C')],
    })

    expect(result.failed.map((item) => item.key)).toEqual(['A'])
    expect(result.skipped.map((item) => item.key)).toEqual(['B', 'C'])
    expect(result.stopped?.reason).toContain('rate_limit')
    expect(agent.requests.filter((request) => request.action === 'createInvoice')).toHaveLength(1)
  })

  test('dryRun-ban előnézetet kér, és semmit nem állít ki', async () => {
    const { agent, kassza } = fakeKassza()

    const result = await runBatch(kassza, {
      ...FAST,
      dryRun: true,
      items: [invoiceItem('A', 10_000), receiptItem('T')],
    })

    expect(result.dryRun).toBe(true)
    expect(result.previewed.map((item) => [item.key, item.kind, item.grossTotal])).toEqual([
      ['A', 'invoice', 10_000],
      ['T', 'receipt', 5_000],
    ])
    expect(result.grossTotal).toBe(15_000)
    expect(agent.invoices.size).toBe(0)
    expect(agent.receipts.size).toBe(0)
  })

  test('a napló minden kiállítást rögzít', async () => {
    const journal = createJournal(memoryJournal(), { now: FAKE_NOW })
    const { kassza } = fakeKassza()

    await runBatch(kassza, { ...FAST, journal, items: [invoiceItem('A'), receiptItem('T')] })

    expect(
      (await journal.entries({ from: '2026-10-01', to: '2026-10-31' })).length,
    ).toBeGreaterThan(0)
    expect(await journal.pending({ from: '2026-10-01', to: '2026-10-31' })).toEqual([])
  })

  test('a sebességkorlátot tartja a tételek indítása között', async () => {
    vi.useFakeTimers()
    const { kassza } = fakeKassza({}, { cookieStore: false })
    const started: number[] = []
    const items = ['A', 'B', 'C'].map((key) => ({
      key,
      document: () => {
        started.push(Date.now())
        return invoiceItem(key).document()
      },
    }))

    const pending = runBatch(kassza, { items, ratePerMinute: 60, recoveryDelayMs: 0 })
    await vi.advanceTimersByTimeAsync(2_500)
    expect(started).toHaveLength(3)
    await pending

    expect(started[1]! - started[0]!).toBeGreaterThanOrEqual(1_000)
    expect(started[2]! - started[1]!).toBeGreaterThanOrEqual(1_000)
  })

  test('párhuzamosan is futtat, de legfeljebb a megadott számút', async () => {
    const { kassza } = fakeKassza()
    let active = 0
    let peak = 0
    const items = Array.from({ length: 6 }, (_, index) => ({
      key: `P-${index}`,
      document: async () => {
        active += 1
        peak = Math.max(peak, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
        return invoiceItem(`P-${index}`).document()
      },
    }))

    const result = await runBatch(kassza, { ...FAST, concurrency: 2, items })

    expect(result.created).toHaveLength(6)
    expect(peak).toBe(2)
  })

  test('megszakításkor nem indít új tételt', async () => {
    const { kassza } = fakeKassza()
    const controller = new AbortController()
    const items = ['A', 'B', 'C'].map((key) => ({
      key,
      document: () => {
        if (key === 'A') controller.abort(new Error('leállítva'))
        return invoiceItem(key).document()
      },
    }))

    const result = await runBatch(kassza, { ...FAST, items, signal: controller.signal })

    expect(result.stopped?.reason).toContain('megszakították')
    expect(result.created.length + result.failed.length + result.skipped.length).toBe(3)
    expect(result.skipped.map((item) => item.key)).toContain('C')
  })

  test('érvénytelen beállításokra és kulcsokra hibát dob, mielőtt bármit küldene', async () => {
    const { agent, kassza } = fakeKassza()
    const one = [invoiceItem('A')]
    await expect(runBatch(kassza, { items: one, concurrency: 0 })).rejects.toMatchObject({
      category: 'configuration',
    })
    await expect(
      runBatch(kassza, { items: one, concurrency: MAX_BATCH_CONCURRENCY + 1 }),
    ).rejects.toMatchObject({ category: 'configuration' })
    await expect(runBatch(kassza, { items: one, ratePerMinute: 0 })).rejects.toMatchObject({
      category: 'configuration',
    })
    await expect(
      runBatch(kassza, { items: [invoiceItem('A'), invoiceItem('A')] }),
    ).rejects.toMatchObject({ category: 'validation' })
    await expect(runBatch(kassza, { items: [invoiceItem(' ')] })).rejects.toMatchObject({
      category: 'validation',
    })
    expect(agent.requests).toHaveLength(0)
  })

  test('a kulcstól eltérő rendelésszámú tétel hibás', async () => {
    const { kassza } = fakeKassza()
    const result = await runBatch(kassza, {
      ...FAST,
      items: [
        {
          key: 'A',
          document: () => ({
            kind: 'invoice',
            input: { buyer: BUYER, orderNumber: 'MAS', items: [] },
          }),
        },
      ],
    })
    expect(String((result.failed[0]?.error as Error).message)).toContain('eltér a kulcstól')
  })

  test('üres listára üres eredményt ad', async () => {
    const { kassza } = fakeKassza()
    expect(await runBatch(kassza, { items: [] })).toMatchObject({ items: [], grossTotal: 0 })
  })
})

describe('számlázási időszakok', () => {
  test('a hónap végi kezdőnapot hónapról hónapra csúszás nélkül kezeli', () => {
    const options = { interval: 'month' as const, anchor: '2026-01-31' }
    expect([0, 1, 2, 3].map((index) => billingPeriod(options, index))).toMatchObject([
      { start: '2026-01-31', end: '2026-02-27', key: 'month:2026-01-31' },
      { start: '2026-02-28', end: '2026-03-30' },
      { start: '2026-03-31', end: '2026-04-29' },
      { start: '2026-04-30', end: '2026-05-30' },
    ])
  })

  test('szökőévben február 29-ét ad', () => {
    expect(billingPeriod({ interval: 'month', anchor: '2028-01-31' }, 1).start).toBe('2028-02-29')
  })

  test('negyedéves, éves és heti időszak, fizetési határidővel', () => {
    expect(
      billingPeriod({ interval: 'quarter', anchor: '2026-11-30', paymentDueInDays: 8 }, 1),
    ).toEqual({
      index: 1,
      interval: 'quarter',
      start: '2027-02-28',
      end: '2027-05-29',
      dueDate: '2027-03-08',
      key: 'quarter:2027-02-28',
    })
    expect(billingPeriod({ interval: 'year', anchor: '2024-02-29' }, 1)).toMatchObject({
      start: '2025-02-28',
      end: '2026-02-27',
    })
    expect(billingPeriod({ interval: 'week', anchor: '2026-12-28' }, 1)).toMatchObject({
      start: '2027-01-04',
      end: '2027-01-10',
    })
  })

  test('megtalálja a dátumot tartalmazó időszakot és a tartomány időszakait', () => {
    const options = { interval: 'month' as const, anchor: '2026-01-31' }
    expect(billingPeriodAt(options, '2026-03-30')).toMatchObject({ index: 1 })
    expect(billingPeriodAt(options, '2026-03-31')).toMatchObject({ index: 2 })
    expect(billingPeriodAt(options, '2026-01-31')).toMatchObject({ index: 0 })
    expect(billingPeriodAt({ interval: 'week', anchor: '2026-10-01' }, '2026-10-15').index).toBe(2)
    expect(
      billingPeriodsBetween(options, '2026-02-01', '2026-05-01').map((period) => period.index),
    ).toEqual([0, 1, 2, 3])
  })

  test('a Date bemenetet budapesti naptári napként érti', () => {
    const lateEvening = new Date('2026-10-31T23:30:00Z')
    expect(billingPeriodAt({ interval: 'month', anchor: '2026-11-01' }, lateEvening).start).toBe(
      '2026-11-01',
    )
    expect(todayPeriod({ interval: 'month', anchor: '2026-10-01' }, lateEvening).start).toBe(
      '2026-11-01',
    )
  })

  test('érvénytelen bemenetre validációs hibát dob', () => {
    const options = { interval: 'month' as const, anchor: '2026-01-31' }
    expect(() => billingPeriod(options, -1)).toThrow(SzamlazzError)
    expect(() => billingPeriod(options, 1.5)).toThrow(SzamlazzError)
    expect(() => billingPeriod({ interval: 'nap' as never, anchor: '2026-01-01' }, 0)).toThrow(
      SzamlazzError,
    )
    expect(() => billingPeriod({ interval: 'month', anchor: '2026-02-30' }, 0)).toThrow(
      SzamlazzError,
    )
    expect(() => billingPeriod({ ...options, paymentDueInDays: -1 }, 0)).toThrow(SzamlazzError)
    expect(() => billingPeriodAt(options, '2025-12-31')).toThrow(SzamlazzError)
    expect(() => billingPeriodAt(options, 'tegnap')).toThrow(SzamlazzError)
  })
})
