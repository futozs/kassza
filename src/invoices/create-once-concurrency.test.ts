import { describe, expect, test, vi } from 'vitest'
import { TEST_AGENT_KEY } from '../../tests/helpers'
import { createKassza, type KasszaOptions } from '../client'
import { memoryStore } from '../core/store'
import { createFakeAgentFetch, type FakeAgent, type FakeAgentOptions } from '../testing'
import type { CreateInvoiceInput } from './create-types'

function slowAgent(options: FakeAgentOptions = {}): FakeAgent & {
  readonly slowFetch: typeof globalThis.fetch
} {
  const agent = createFakeAgentFetch(options)
  const slowFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    await new Promise((resolve) => setTimeout(resolve, 5))
    return agent.fetch(input, init)
  }) as typeof globalThis.fetch
  return Object.assign(agent, { slowFetch })
}

function fakeKassza(agentOptions: FakeAgentOptions = {}, kasszaOptions: KasszaOptions = {}) {
  const agent = slowAgent(agentOptions)
  const kassza = createKassza({
    agentKey: TEST_AGENT_KEY,
    retryDelayMs: 0,
    fetch: agent.slowFetch,
    defaults: { receipt: { prefix: 'NYGT', paymentMethod: 'bankkártya' } },
    ...kasszaOptions,
  })
  return { agent, kassza }
}

const INVOICE: CreateInvoiceInput = {
  orderNumber: 'WEBHOOK-1',
  buyer: { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' },
  items: [{ name: 'Termék', grossUnitPrice: 12_700, vat: 27 }],
}

const RECEIPT = {
  orderNumber: 'WEBHOOK-2',
  items: [{ name: 'Kávé', quantity: 1, grossUnitPrice: 890, vat: 27 as const }],
}

describe('createOnce párhuzamos hívásokkal', () => {
  test('két egyidejű számla-createOnce pontosan egy számlát állít ki', async () => {
    const { agent, kassza } = fakeKassza({ rejectDuplicateOrderNumbers: false })

    const results = await Promise.all([
      kassza.invoices.createOnce(INVOICE),
      kassza.invoices.createOnce(INVOICE),
    ])

    expect(agent.invoices.size).toBe(1)
    expect(results.map((result) => result.created).sort()).toEqual([false, true])
    expect(new Set(results.map((result) => result.number)).size).toBe(1)
  })

  test('tíz egyidejű hívásból egy állít ki, kilenc a meglévőt kapja', async () => {
    const { agent, kassza } = fakeKassza({ rejectDuplicateOrderNumbers: false })

    const results = await Promise.all(
      Array.from({ length: 10 }, () => kassza.invoices.createOnce(INVOICE)),
    )

    expect(agent.invoices.size).toBe(1)
    expect(results.filter((result) => result.created)).toHaveLength(1)
  })

  test('kérésenként létrehozott kassza példányok között is véd (serverless minta)', async () => {
    const agent = slowAgent({ rejectDuplicateOrderNumbers: false })
    const make = () => createKassza({ agentKey: TEST_AGENT_KEY, fetch: agent.slowFetch })

    const results = await Promise.all([
      make().invoices.createOnce(INVOICE),
      make().invoices.createOnce(INVOICE),
    ])

    expect(agent.invoices.size).toBe(1)
    expect(results.filter((result) => result.created)).toHaveLength(1)
  })

  test('más Agent kulcsú fiókok hívásai nem várnak egymásra', async () => {
    const agent = slowAgent({ rejectDuplicateOrderNumbers: false })
    const first = createKassza({ agentKey: TEST_AGENT_KEY, fetch: agent.slowFetch })
    const second = createKassza({ agentKey: `${TEST_AGENT_KEY}x`, fetch: agent.slowFetch })

    const results = await Promise.all([
      first.invoices.createOnce(INVOICE),
      second.invoices.createOnce(INVOICE),
    ])

    expect(results.every((result) => result.created)).toBe(true)
    expect(agent.invoices.size).toBe(2)
  })

  test('különböző rendelésszámok párhuzamosan futnak', async () => {
    const { agent, kassza } = fakeKassza({ rejectDuplicateOrderNumbers: false })

    await Promise.all([
      kassza.invoices.createOnce(INVOICE),
      kassza.invoices.createOnce({ ...INVOICE, orderNumber: 'WEBHOOK-1B' }),
    ])

    expect(agent.invoices.size).toBe(2)
  })

  test('üzleti hibánál (57) a várakozó ugyanazt a hibát kapja, és nem küldi újra a kérést', async () => {
    const { agent, kassza } = fakeKassza({ rejectDuplicateOrderNumbers: false })
    agent.fail({ code: 57 }, { action: 'createInvoice' })

    const results = await Promise.allSettled([
      kassza.invoices.createOnce(INVOICE),
      kassza.invoices.createOnce(INVOICE),
    ])

    expect(results.map((result) => result.status)).toEqual(['rejected', 'rejected'])
    expect(agent.requests.filter((request) => request.action === 'createInvoice')).toHaveLength(1)
  })

  test('bizonytalan hibánál (időtúllépés) a várakozó visszakeres, és nem állít ki duplát', async () => {
    const agent = createFakeAgentFetch({ rejectDuplicateOrderNumbers: false })
    agent.fail('ghostSuccess', { action: 'createInvoice' })
    let created = false
    let blockedLookups = 0
    const flakyFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      const body = init?.body
      const action = body instanceof FormData ? [...body.keys()][0] : undefined
      if (created && action === 'action-szamla_agent_xml' && blockedLookups < 6) {
        blockedLookups += 1
        throw new TypeError('fetch failed')
      }
      if (action === 'action-xmlagentxmlfile') created = true
      return agent.fetch(input, init)
    }) as typeof globalThis.fetch
    const kassza = createKassza({ agentKey: TEST_AGENT_KEY, retryDelayMs: 0, fetch: flakyFetch })

    const results = await Promise.allSettled([
      kassza.invoices.createOnce(INVOICE, { recoveryDelayMs: 0 }),
      kassza.invoices.createOnce(INVOICE, { recoveryDelayMs: 0 }),
    ])

    expect(results[0]).toMatchObject({
      status: 'rejected',
      reason: { details: { outcome: 'unknown' } },
    })
    expect(results[1]).toMatchObject({ status: 'fulfilled', value: { created: false } })
    expect(agent.invoices.size).toBe(1)
    expect(agent.requests.filter((request) => request.action === 'createInvoice')).toHaveLength(1)
  })

  test('két egyidejű nyugta-createOnce pontosan egy nyugtát állít ki', async () => {
    const { agent, kassza } = fakeKassza()

    const results = await Promise.all([
      kassza.receipts.createOnce(RECEIPT),
      kassza.receipts.createOnce(RECEIPT),
    ])

    expect(agent.receipts.size).toBe(1)
    expect(results.map((result) => result.created).sort()).toEqual([false, true])
    expect(agent.requests.filter((request) => request.action === 'createReceipt')).toHaveLength(1)
  })

  test('a lookupFirst: false hívás is a már folyamatban lévőhöz csatlakozik', async () => {
    const { agent, kassza } = fakeKassza({ rejectDuplicateOrderNumbers: false })

    await Promise.all([
      kassza.invoices.createOnce(INVOICE, { lookupFirst: false }),
      kassza.invoices.createOnce(INVOICE, { lookupFirst: false }),
    ])

    expect(agent.invoices.size).toBe(1)
  })
})

describe('createOnce elosztott zárral', () => {
  test('két külön folyamat közös tárolóval pontosan egy számlát állít ki', async () => {
    const agent = slowAgent({ rejectDuplicateOrderNumbers: false })
    const lock = memoryStore()
    vi.resetModules()
    const first = await import('../client')
    vi.resetModules()
    const second = await import('../client')
    expect(first.createKassza).not.toBe(second.createKassza)
    const options = { agentKey: TEST_AGENT_KEY, fetch: agent.slowFetch, createOnceLock: lock }

    const results = await Promise.all([
      first.createKassza(options).invoices.createOnce(INVOICE, { recoveryDelayMs: 0 }),
      second.createKassza(options).invoices.createOnce(INVOICE, { recoveryDelayMs: 0 }),
    ])

    expect(agent.invoices.size).toBe(1)
    expect(results.filter((result) => result.created)).toHaveLength(1)
    expect(results[0]?.number).toBe(results[1]?.number)
  })

  test('zár nélkül két külön folyamat két számlát állít ki (ez a hiba, amit a zár megelőz)', async () => {
    const agent = slowAgent({ rejectDuplicateOrderNumbers: false })
    vi.resetModules()
    const first = await import('../client')
    vi.resetModules()
    const second = await import('../client')
    const options = { agentKey: TEST_AGENT_KEY, fetch: agent.slowFetch }

    await Promise.all([
      first.createKassza(options).invoices.createOnce(INVOICE),
      second.createKassza(options).invoices.createOnce(INVOICE),
    ])

    expect(agent.invoices.size).toBe(2)
  })

  test('a zár a kiállítás után felszabadul', async () => {
    const lock = memoryStore()
    const { kassza } = fakeKassza({}, { createOnceLock: lock })

    await kassza.invoices.createOnce(INVOICE)
    const again = await kassza.invoices.createOnce(INVOICE, { lockWaitMs: 0 })

    expect(again.created).toBe(false)
  })

  test('a hívásonkénti lock: false kikapcsolja a példányszintű zárat', async () => {
    const lock = { get: () => undefined, set: () => undefined, delete: () => undefined }
    const { kassza } = fakeKassza({}, { createOnceLock: memoryStore() })

    const result = await kassza.invoices.createOnce(INVOICE, { lock: false })
    await expect(
      kassza.invoices.createOnce({ ...INVOICE, orderNumber: 'X-2' }, { lock }),
    ).rejects.toMatchObject({ category: 'configuration' })

    expect(result.created).toBe(true)
  })
})
