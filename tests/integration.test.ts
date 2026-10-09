import { describe, expect, test, vi } from 'vitest'
import { hmacHex } from '../src/core/crypto'
import { memoryStore } from '../src/core/store'
import { createJournal, kvJournal } from '../src/journal'
import { combineHooks, createMetricsRegistry, observe } from '../src/observe'
import { navDailyReports } from '../src/reports'
import { createFakeAgentFetch } from '../src/testing'
import { FAKE_NOW } from './fake-agent'
import { TEST_AGENT_KEY } from './helpers'

const NOW_SECONDS = 1_790_000_000
const SECRET = 'whsec_integracio'

function slow(fetchImpl: typeof globalThis.fetch): typeof globalThis.fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    await new Promise((resolve) => setTimeout(resolve, 3))
    return fetchImpl(input, init)
  }) as typeof globalThis.fetch
}

async function freshInstance() {
  vi.resetModules()
  const client = await import('../src/client')
  const stripe = await import('../src/payments/stripe')
  return { client, stripe }
}

function checkoutEvent(id: string, paymentIntent: string): string {
  return JSON.stringify({
    id,
    object: 'event',
    type: 'checkout.session.completed',
    created: NOW_SECONDS,
    livemode: false,
    data: {
      object: {
        id: `cs_${paymentIntent}`,
        object: 'checkout.session',
        payment_intent: paymentIntent,
        payment_status: 'paid',
        amount_total: 1_270_000,
        currency: 'huf',
      },
    },
  })
}

async function deliver(handler: (request: Request) => Promise<Response>, payload: string) {
  const signature = `t=${NOW_SECONDS},v1=${await hmacHex('SHA-256', SECRET, `${NOW_SECONDS}.${payload}`)}`
  return handler(
    new Request('https://shop.hu/webhook', {
      method: 'POST',
      body: payload,
      headers: { 'stripe-signature': signature },
    }),
  )
}

describe('integráció: két serverless példány közös tárolóval', () => {
  test('egyidejű webhookokból pontosan egy nyugta, teljes napló, NAV összesítő és metrikák', async () => {
    const agent = createFakeAgentFetch({ now: FAKE_NOW, testAccount: false })
    const store = memoryStore()
    const journal = createJournal(kvJournal(store), { now: FAKE_NOW })
    const metrics = createMetricsRegistry()

    const instances = await Promise.all([freshInstance(), freshInstance()])
    const handlers = instances.map(({ client, stripe }) => {
      const kassza = client.createKassza({
        agentKey: TEST_AGENT_KEY,
        fetch: slow(agent.fetch),
        retryDelayMs: 0,
        cookieStore: store,
        attemptLedger: store,
        createOnceLock: store,
        defaults: { receipt: { prefix: 'NYGT', paymentMethod: 'bankkártya' } },
        hooks: combineHooks(observe({ metrics }), {
          onDocument: (event) => journal.record(event),
          onDocumentError: 'throw',
        }),
      })
      return stripe.stripeWebhook({
        secret: SECRET,
        now: () => NOW_SECONDS * 1000,
        dedupe: store,
        onPayment: (payment) =>
          journal.trackReceipt(`STRIPE-${payment.id}`, () =>
            kassza.issueForPayment(payment, { vat: 27 }).then((result) => {
              if (result.kind !== 'receipt') throw new Error(`váratlan: ${result.kind}`)
              return result.receipt
            }),
          ),
      })
    })

    const first = checkoutEvent('evt_1', 'pi_1')
    const responses = await Promise.all([
      deliver(handlers[0] as (request: Request) => Promise<Response>, first),
      deliver(handlers[1] as (request: Request) => Promise<Response>, first),
      deliver(
        handlers[0] as (request: Request) => Promise<Response>,
        checkoutEvent('evt_2', 'pi_2'),
      ),
    ])
    const redelivered = await deliver(handlers[1] as (request: Request) => Promise<Response>, first)

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200])
    expect(redelivered.status).toBe(200)
    expect(agent.receipts.size).toBe(2)
    expect(agent.requests.filter((request) => request.action === 'createReceipt')).toHaveLength(2)

    const range = { from: '2026-10-02', to: '2026-10-02' }
    expect(await journal.pending(range)).toEqual([])
    const receipts = await journal.receipts(range)
    expect(receipts).toHaveLength(2)
    expect(navDailyReports(receipts)[0]).toMatchObject({ numberOfSaleDocument: 2 })
    expect(metrics.renderPrometheus()).toContain(
      'kassza_documents_total{action="created",kind="receipt"} 2',
    )
  })

  test('összeomlás a kiállítás közben: a tétel befejezetlen marad, a settle lezárja, duplát nem állít ki', async () => {
    const agent = createFakeAgentFetch({ now: FAKE_NOW })
    const store = memoryStore()
    const journal = createJournal(kvJournal(store), { now: FAKE_NOW })
    const { client } = await freshInstance()
    const kassza = client.createKassza({
      agentKey: TEST_AGENT_KEY,
      fetch: agent.fetch,
      retryDelayMs: 0,
      createOnceLock: store,
      defaults: { receipt: { prefix: 'NYGT', paymentMethod: 'bankkártya' } },
    })
    const input = {
      orderNumber: 'CRASH-1',
      items: [{ name: 'Jegy', grossUnitPrice: 4_990, vat: 27 as const }],
    }
    await expect(
      journal.trackReceipt('CRASH-1', async () => {
        await kassza.receipts.createOnce(input)
        throw new Error('a serverless függvény időkorlátja lejárt')
      }),
    ).rejects.toThrow('időkorlátja')

    const range = { from: '2026-10-02', to: '2026-10-02' }
    expect(await journal.pending(range)).toHaveLength(1)
    const settled = await journal.settle(kassza, { range })
    const retried = await kassza.receipts.createOnce(input)

    expect(settled.recorded).toHaveLength(1)
    expect(await journal.pending(range)).toEqual([])
    expect(retried.created).toBe(false)
    expect(agent.receipts.size).toBe(1)
  })
})
