import { describe, expect, test, vi } from 'vitest'
import { FAKE_NOW, fakeKassza } from '../../tests/fake-agent'
import { DocumentHookError } from '../core/document-events'
import { SzamlazzError } from '../core/errors'
import { type KeyValueStore, memoryStore } from '../core/store'
import type { CreateInvoiceInput } from '../invoices/create-types'
import type { Receipt } from '../receipts/types'
import { navDailyReports } from '../reports'
import {
  createJournal,
  type JournalEntry,
  type JournalStorage,
  JournalWriteError,
  kvJournal,
  MAX_JOURNAL_RANGE_DAYS,
  memoryJournal,
} from './index'

const DAY = '2026-10-02'
const RANGE = { from: DAY, to: DAY }

const RECEIPT_INPUT = {
  orderNumber: 'WEB-1',
  items: [{ name: 'Kávé', quantity: 2, grossUnitPrice: 890, vat: 27 as const }],
}

const INVOICE: CreateInvoiceInput = {
  orderNumber: 'INV-1',
  issueDate: DAY,
  fulfillmentDate: DAY,
  buyer: { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' },
  items: [{ name: 'Termék', grossUnitPrice: 12_700, vat: 27 }],
}

const storages: readonly [string, () => JournalStorage][] = [
  ['memoryJournal', () => memoryJournal()],
  ['kvJournal', () => kvJournal(memoryStore())],
]

describe.each(storages)('%s', (_name, makeStorage) => {
  function setup() {
    const journal = createJournal(makeStorage(), { now: FAKE_NOW })
    const { agent, kassza } = fakeKassza(
      { testAccount: false },
      { hooks: { onDocument: (event) => journal.record(event), onDocumentError: 'throw' } },
    )
    return { journal, agent, kassza }
  }

  test('az onDocument hookból a nyugtát és a sztornót naplózza, a NAV összesítő ebből számol', async () => {
    const { journal, kassza } = setup()
    const receipt = await kassza.receipts.create(RECEIPT_INPUT)
    await kassza.receipts.create({ ...RECEIPT_INPUT, orderNumber: 'WEB-2' })
    await kassza.receipts.reverse(receipt.number)

    const receipts = await journal.receipts(RANGE)
    const reports = navDailyReports(receipts)

    expect(receipts.map((item) => item.type).sort()).toEqual(['receipt', 'receipt', 'reversal'])
    expect(receipts.every((item) => item.pdf === undefined)).toBe(true)
    expect(reports).toHaveLength(1)
    expect(reports[0]).toMatchObject({
      applicableDate: DAY,
      numberOfSaleDocument: 2,
      numberOfModifyingDocument: 1,
    })
  })

  test('a számla kiállítását és sztornóját naplózza, a befizetést nem', async () => {
    const { journal, kassza } = setup()
    const invoice = await kassza.invoices.create(INVOICE)
    await kassza.invoices.registerPayment({ invoiceNumber: invoice.number, amount: 12_700 })
    await kassza.invoices.reverse(invoice.number)

    const entries = await journal.entries({ ...RANGE, kind: 'invoice' })

    expect(entries.map((entry) => [entry.type, entry.number])).toEqual([
      ['document', invoice.number],
      ['reversal', expect.any(String)],
    ])
    expect(entries[0]).toMatchObject({ orderNumber: 'INV-1', grossTotal: 12_700, source: 'hook' })
    expect(entries[1]?.reversedNumber).toBe(invoice.number)
  })

  test('ugyanazt a bizonylatot kétszer sem naplózza kétszer', async () => {
    const { journal, kassza } = setup()
    const receipt = await kassza.receipts.create(RECEIPT_INPUT)

    expect(await journal.recordReceipt(receipt)).toBe(false)
    await journal.trackReceipt('WEB-1', () => kassza.receipts.createOnce(RECEIPT_INPUT))

    expect(await journal.entries(RANGE)).toHaveLength(1)
  })

  test('a trackReceipt sikeres kiállítás után naplóz, és nem hagy befejezetlen tételt', async () => {
    const journal = createJournal(makeStorage(), { now: FAKE_NOW })
    const { kassza } = fakeKassza()

    const result = await journal.trackReceipt('WEB-1', () =>
      kassza.receipts.createOnce(RECEIPT_INPUT),
    )

    expect('receipt' in result && result.created).toBe(true)
    expect(await journal.pending(RANGE)).toEqual([])
    expect((await journal.entries(RANGE))[0]).toMatchObject({
      source: 'track',
      orderNumber: 'WEB-1',
    })
  })

  test('bizonytalan kimenetelnél a tétel befejezetlen marad, a settle később pótolja', async () => {
    const journal = createJournal(makeStorage(), { now: FAKE_NOW })
    const { agent, kassza } = fakeKassza()
    agent.fail('ghostSuccess', { action: 'createReceipt' })

    await expect(
      journal.trackReceipt('WEB-1', () => kassza.receipts.create(RECEIPT_INPUT)),
    ).rejects.toMatchObject({ category: 'timeout' })

    expect(await journal.pending(RANGE)).toMatchObject([{ kind: 'receipt', orderNumber: 'WEB-1' }])
    expect(await journal.entries(RANGE)).toEqual([])

    const settled = await journal.settle(kassza, { range: RANGE })

    expect(settled.recorded).toHaveLength(1)
    expect(settled.notFound).toEqual([])
    expect(await journal.pending(RANGE)).toEqual([])
    expect(await journal.entries(RANGE)).toMatchObject([{ source: 'settle', orderNumber: 'WEB-1' }])
  })

  test('biztos hibánál (validáció) nem hagy befejezetlen tételt', async () => {
    const journal = createJournal(makeStorage(), { now: FAKE_NOW })
    const { kassza } = fakeKassza()

    await expect(
      journal.trackReceipt('WEB-1', () => kassza.receipts.create({ ...RECEIPT_INPUT, items: [] })),
    ).rejects.toBeInstanceOf(SzamlazzError)

    expect(await journal.pending(RANGE)).toEqual([])
  })

  test('nem kassza hibánál óvatosan befejezetlenként hagyja', async () => {
    const journal = createJournal(makeStorage(), { now: FAKE_NOW })
    await expect(
      journal.trackInvoice('INV-9', async () => {
        throw new Error('saját kód hiba a kiállítás után')
      }),
    ).rejects.toThrow('saját kód')
    expect(await journal.pending(RANGE)).toHaveLength(1)
  })

  test('a settle nem talált tételt megtart, releaseNotFound esetén elenged', async () => {
    const journal = createJournal(makeStorage(), { now: FAKE_NOW })
    const { kassza } = fakeKassza()
    await journal.reserve('invoice', 'NINCS-1')
    await journal.reserve('receipt', 'NINCS-2')

    const first = await journal.settle(kassza, { range: RANGE })
    expect(first.notFound).toHaveLength(2)
    expect(await journal.pending(RANGE)).toHaveLength(2)

    const second = await journal.settle(kassza, { range: RANGE, releaseNotFound: true })
    expect(second.notFound).toHaveLength(2)
    expect(await journal.pending(RANGE)).toEqual([])
  })

  test('a settle a hiányzó API-t és a lekérdezési hibát tételenként jelzi', async () => {
    const journal = createJournal(makeStorage(), { now: FAKE_NOW })
    await journal.reserve('invoice', 'A-1')
    await journal.reserve('receipt', 'A-2')

    const settled = await journal.settle({}, { range: RANGE })

    expect(settled.failed).toHaveLength(2)
    expect(settled.failed[0]?.error).toBeInstanceOf(TypeError)
  })

  test('a trackInvoice a createOnce eredményéből naplóz, a meglévőt is', async () => {
    const journal = createJournal(makeStorage(), { now: FAKE_NOW })
    const { kassza } = fakeKassza()
    await kassza.invoices.createOnce(INVOICE)

    const result = await journal.trackInvoice('INV-1', () => kassza.invoices.createOnce(INVOICE))

    expect(result.created).toBe(false)
    expect((await journal.entries(RANGE))[0]).toMatchObject({
      kind: 'invoice',
      number: result.number,
      orderNumber: 'INV-1',
      grossTotal: 12_700,
    })
  })

  test('a reconcile pótolja a csak az archívumban lévő nyugtákat, és jelzi a fordítottját', async () => {
    const journal = createJournal(makeStorage(), { now: FAKE_NOW })
    const { kassza } = fakeKassza()
    const first = await kassza.receipts.create(RECEIPT_INPUT)
    const second = await kassza.receipts.create({ ...RECEIPT_INPUT, orderNumber: 'WEB-2' })
    const onlyJournal = await kassza.receipts.create({ ...RECEIPT_INPUT, orderNumber: 'WEB-3' })
    await journal.recordReceipt(first)
    await journal.recordReceipt(onlyJournal)

    const dry = await journal.reconcile([{ receipt: first }, { receipt: second }], { dryRun: true })
    expect(dry).toMatchObject({ added: [second.number], missingFromArchive: [onlyJournal.number] })
    expect(await journal.entries(RANGE)).toHaveLength(2)

    const result = await journal.reconcile([first, second, second])

    expect(result).toEqual({
      range: RANGE,
      added: [second.number],
      missingFromArchive: [onlyJournal.number],
      matched: 1,
    })
    expect(await journal.entries(RANGE)).toHaveLength(3)
    expect(await journal.reconcile([])).toEqual({
      range: undefined,
      added: [],
      missingFromArchive: [],
      matched: 0,
    })
  })

  test('a reconcile a megadott időszakon kívüli nyugtát kihagyja', async () => {
    const journal = createJournal(makeStorage(), { now: FAKE_NOW })
    const { kassza } = fakeKassza()
    const receipt = await kassza.receipts.create(RECEIPT_INPUT)
    const old: Receipt = { ...receipt, number: 'NYGT-2026-0', issueDate: '2026-09-30' }

    const result = await journal.reconcile([receipt, old], { from: DAY })

    expect(result.added).toEqual([receipt.number])
    expect(result.range).toEqual(RANGE)
  })

  test('a teszt nyugtákat alapból kihagyja a receipts() listából', async () => {
    const journal = createJournal(makeStorage(), { now: FAKE_NOW })
    const { kassza } = fakeKassza({ testAccount: true })
    await journal.recordReceipt(await kassza.receipts.create(RECEIPT_INPUT))

    expect(await journal.receipts(RANGE)).toEqual([])
    expect(await journal.receipts({ ...RANGE, includeTest: true })).toHaveLength(1)
  })

  test('a pending alapból az utolsó 30 napot nézi', async () => {
    const journal = createJournal(makeStorage(), { now: FAKE_NOW })
    await journal.reserve('receipt', 'R-1')
    expect(await journal.pending()).toHaveLength(1)
    await journal.release('receipt', 'R-1')
    expect(await journal.pending()).toEqual([])
  })

  test('üres rendelésszámra validációs hibát dob', async () => {
    const journal = createJournal(makeStorage(), { now: FAKE_NOW })
    await expect(journal.reserve('receipt', '  ')).rejects.toMatchObject({ category: 'validation' })
    await expect(journal.trackInvoice('', async () => ({}) as never)).rejects.toMatchObject({
      category: 'validation',
    })
  })

  test('érvénytelen időszakra validációs hibát dob', async () => {
    const journal = createJournal(makeStorage(), { now: FAKE_NOW })
    await expect(journal.entries({ from: '2026-10-05', to: '2026-10-01' })).rejects.toMatchObject({
      category: 'validation',
    })
    await expect(journal.entries({ from: '2026/10/01', to: DAY })).rejects.toMatchObject({
      category: 'validation',
    })
    await expect(journal.entries({ from: '2025-01-01', to: '2026-12-31' })).rejects.toThrow(
      String(MAX_JOURNAL_RANGE_DAYS),
    )
  })
})

describe('onDocumentError: throw a naplóval', () => {
  test('ha a napló írása elbukik, a hívó DocumentHookError-t kap a bizonylattal', async () => {
    const broken = {
      ...memoryJournal(),
      putEntry: () => Promise.reject(new Error('DB leállt')),
    }
    const journal = createJournal(broken, { now: FAKE_NOW })
    const { kassza } = fakeKassza(
      {},
      { hooks: { onDocument: (event) => journal.record(event), onDocumentError: 'throw' } },
    )

    const error = await kassza.receipts.create(RECEIPT_INPUT).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(DocumentHookError)
    expect((error as DocumentHookError).number).toBe('NYGT-2026-1')
  })

  test('a track naplóírási hibája JournalWriteError az eredménnyel, a tétel befejezetlen marad', async () => {
    const storage = memoryJournal()
    const journal = createJournal(
      { ...storage, putEntry: () => Promise.reject(new Error('DB leállt')) },
      { now: FAKE_NOW },
    )
    const { kassza } = fakeKassza()

    const error = await journal
      .trackReceipt('WEB-1', () => kassza.receipts.createOnce(RECEIPT_INPUT))
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(JournalWriteError)
    expect((error as JournalWriteError).orderNumber).toBe('WEB-1')
    expect((error as JournalWriteError).result).toMatchObject({ created: true })
    expect(await storage.listReservations(RANGE)).toHaveLength(1)
  })
})

describe('kvJournal', () => {
  test('increment nélküli tárolóval configuration hibát dob', () => {
    const plain: KeyValueStore = { get: () => undefined, set: () => undefined, delete: () => {} }
    expect(() => kvJournal(plain)).toThrow(SzamlazzError)
  })

  test('érvénytelen megőrzési időre configuration hibát dob', () => {
    expect(() => kvJournal(memoryStore(), { retentionDays: 0 })).toThrow(SzamlazzError)
    expect(() => kvJournal(memoryStore(), { reservationTtlDays: Number.NaN })).toThrow(
      SzamlazzError,
    )
  })

  test('két folyamat párhuzamos írása sem veszít bejegyzést', async () => {
    const shared = memoryStore()
    const slowStore: KeyValueStore = {
      get: async (key) => {
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 3))
        return shared.get(key)
      },
      set: async (key, value, ttl) => {
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 3))
        return shared.set(key, value, ttl)
      },
      delete: (key) => shared.delete(key),
      increment: (key, ttl) => shared.increment?.(key, ttl) ?? 0,
      setIfAbsent: (key, value, ttl) => shared.setIfAbsent?.(key, value, ttl) ?? false,
    }
    const first = createJournal(kvJournal(slowStore), { now: FAKE_NOW })
    const second = createJournal(kvJournal(slowStore), { now: FAKE_NOW })
    const { kassza } = fakeKassza()
    const receipts: Receipt[] = []
    for (let index = 0; index < 20; index++) {
      receipts.push(await kassza.receipts.create({ ...RECEIPT_INPUT, orderNumber: `P-${index}` }))
    }

    await Promise.all(
      receipts.map((receipt, index) => (index % 2 === 0 ? first : second).recordReceipt(receipt)),
    )
    await Promise.all(receipts.slice(0, 5).map((receipt) => second.recordReceipt(receipt)))

    const entries = await first.entries(RANGE)
    expect(entries).toHaveLength(20)
    expect(new Set(entries.map((entry) => entry.number)).size).toBe(20)
  })

  test('a sérült vagy idegen tárolt értéket kihagyja', async () => {
    const store = memoryStore()
    const storage = kvJournal(store, { prefix: 'app:j:' })
    const journal = createJournal(storage, { now: FAKE_NOW })
    await journal.reserve('receipt', 'R-1')
    await store.set('app:j:day:2026-10-02:count', '3', 60)
    await store.set('app:j:day:2026-10-02:1', 'receipt:NY-1', 60)
    await store.set('app:j:day:2026-10-02:2', 'ismeretlen:NY-2', 60)
    await store.set('app:j:day:2026-10-02:3', 'nincskettospont', 60)
    await store.set('app:j:entry:receipt:NY-1', '{nem json', 60)
    await store.set('app:j:rday:2026-10-02:count', 'x', 60)

    expect(await journal.entries(RANGE)).toEqual([])
    expect(await journal.pending(RANGE)).toEqual([])
    expect(await storage.getEntry('receipt', 'NY-1')).toBeUndefined()
  })

  test('setIfAbsent nélküli (de increment-es) tárolón is működik', async () => {
    const inner = memoryStore()
    const store: KeyValueStore = {
      get: inner.get,
      set: inner.set,
      delete: inner.delete,
      increment: (key, ttl) => inner.increment?.(key, ttl) ?? 0,
    }
    const journal = createJournal(kvJournal(store), { now: FAKE_NOW })
    const { kassza } = fakeKassza()
    const receipt = await kassza.receipts.create(RECEIPT_INPUT)

    expect(await journal.recordReceipt(receipt)).toBe(true)
    expect(await journal.recordReceipt(receipt)).toBe(false)
    await journal.reserve('receipt', 'R-1')
    await journal.reserve('receipt', 'R-1')
    expect(await journal.pending(RANGE)).toHaveLength(1)
    expect(await journal.entries(RANGE)).toHaveLength(1)
  })

  test('a bejegyzés a megőrzési idővel íródik', async () => {
    const store = memoryStore()
    const set = vi.spyOn(store, 'set')
    const journal = createJournal(kvJournal(store, { retentionDays: 10 }), { now: FAKE_NOW })
    const entry: JournalEntry = {
      kind: 'invoice',
      type: 'document',
      number: 'E-1',
      date: DAY,
      recordedAt: `${DAY}T12:00:00+02:00`,
      source: 'manual',
    }

    await journal.storage.putEntry(entry)

    expect(set.mock.calls.every((call) => call[2] === 10 * 86_400)).toBe(true)
  })
})
