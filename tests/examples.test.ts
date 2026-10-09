import { describe, expect, test } from 'vitest'
import { createWorkerHandler } from '../examples/cloudflare-simplepay/src/handler'
import { runMonthlyBilling, type Subscription } from '../examples/express-billing/src/billing'
import { createAppKassza } from '../examples/nextjs-stripe/lib/kassza'
import { createStripeHandler } from '../examples/nextjs-stripe/lib/webhook'
import { hmacHex } from '../src/core/crypto'
import { memoryStore } from '../src/core/store'
import { createJournal, memoryJournal } from '../src/journal'
import { simplePaySignature } from '../src/payments/simplepay'
import { createFakeAgentFetch } from '../src/testing'
import { FAKE_NOW } from './fake-agent'
import { TEST_AGENT_KEY } from './helpers'

const NOW_SECONDS = 1_790_000_000

function stripeEvent(
  id: string,
  object: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) {
  return JSON.stringify({
    id,
    object: 'event',
    type: 'checkout.session.completed',
    created: NOW_SECONDS,
    livemode: false,
    data: { object, ...extra },
  })
}

async function signedStripe(handler: (request: Request) => Promise<Response>, payload: string) {
  const signature = `t=${NOW_SECONDS},v1=${await hmacHex('SHA-256', 'whsec_tpl', `${NOW_SECONDS}.${payload}`)}`
  return handler(
    new Request('https://shop.hu/api/webhooks/stripe', {
      method: 'POST',
      body: payload,
      headers: { 'stripe-signature': signature },
    }),
  )
}

describe('indítósablon: Next.js + Stripe', () => {
  test('a fizetésből pontosan egy nyugta lesz, az újraküldés nem állít ki újat', async () => {
    const agent = createFakeAgentFetch({ now: FAKE_NOW })
    const store = memoryStore()
    const kassza = createAppKassza({ store, agentKey: TEST_AGENT_KEY, fetch: agent.fetch })
    const review: string[] = []
    const handler = createStripeHandler(kassza, {
      secret: 'whsec_tpl',
      dedupe: store,
      now: () => NOW_SECONDS * 1000,
      onManualReview: (id, reason) => {
        review.push(`${id}: ${reason}`)
      },
    })
    const payload = stripeEvent('evt_tpl', {
      id: 'cs_tpl',
      object: 'checkout.session',
      payment_intent: 'pi_tpl',
      payment_status: 'paid',
      amount_total: 1_270_000,
      currency: 'huf',
    })

    expect((await signedStripe(handler, payload)).status).toBe(200)
    expect((await signedStripe(handler, payload)).status).toBe(200)

    expect(agent.receipts.size).toBe(1)
    expect(review).toEqual([])
  })

  test('a nem javítható hibát kézi teendőként adja tovább, és 200-at válaszol', async () => {
    const agent = createFakeAgentFetch({ now: FAKE_NOW })
    const kassza = createAppKassza({
      store: memoryStore(),
      agentKey: TEST_AGENT_KEY,
      fetch: agent.fetch,
    })
    const review: string[] = []
    const handler = createStripeHandler(kassza, {
      secret: 'whsec_tpl',
      now: () => NOW_SECONDS * 1000,
      onManualReview: (id, reason) => {
        review.push(`${id}: ${reason}`)
      },
    })
    const payload = stripeEvent('evt_big', {
      id: 'cs_big',
      object: 'checkout.session',
      payment_intent: 'pi_big',
      payment_status: 'paid',
      amount_total: 100_000_000,
      currency: 'huf',
    })

    expect((await signedStripe(handler, payload)).status).toBe(200)
    expect(review[0]).toMatch(/^pi_big: validation/)
  })
})

describe('indítósablon: Cloudflare Worker + SimplePay', () => {
  test('az aláírt IPN-ből bizonylat lesz, és aláírt választ ad', async () => {
    const agent = createFakeAgentFetch({ now: FAKE_NOW })
    const secret = 'simplepay-titok'
    const transaction = {
      transactionId: 501_234,
      orderRef: 'WEB-77',
      status: 'FINISHED',
      total: 5_000,
      currency: 'HUF',
      remainingTotal: 0,
    }
    const simplePayApi = (async () => {
      const body = JSON.stringify({ transactions: [transaction], merchant: 'M', salt: 's' })
      return new Response(body, { headers: { signature: await simplePaySignature(body, secret) } })
    }) as typeof globalThis.fetch
    const handler = createWorkerHandler({
      agentKey: TEST_AGENT_KEY,
      simplePaySecretKey: secret,
      sandbox: true,
      store: memoryStore(),
      fetch: simplePayApi,
      agentFetch: agent.fetch,
      now: FAKE_NOW,
    })
    const ipn = JSON.stringify({
      salt: 'abc',
      orderRef: 'WEB-77',
      method: 'CARD',
      merchant: 'M',
      finishDate: '2026-10-02T12:00:00+02:00',
      paymentDate: '2026-10-02T11:59:00+02:00',
      transactionId: 501_234,
      status: 'FINISHED',
    })

    const response = await handler(
      new Request('https://worker.dev/simplepay/ipn', {
        method: 'POST',
        body: ipn,
        headers: { signature: await simplePaySignature(ipn, secret) },
      }),
    )
    const missing = await handler(new Request('https://worker.dev/mas'))

    expect(response.status).toBe(200)
    expect(response.headers.get('signature')).toBeTruthy()
    expect(agent.receipts.size + agent.invoices.size).toBe(1)
    expect(missing.status).toBe(404)
  })
})

describe('indítósablon: Express + havi számlázás', () => {
  const subscriptions: Subscription[] = [
    {
      id: 'A',
      startedOn: '2026-01-31',
      monthlyGross: 12_700,
      planName: 'Pro csomag',
      buyer: { name: 'Előfizető Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' },
    },
    {
      id: 'B',
      startedOn: '2026-03-15',
      monthlyGross: 5_080,
      planName: 'Alap csomag',
      buyer: { name: 'Másik Bt.', zip: '6720', city: 'Szeged', address: 'Kárász utca 2.' },
    },
  ]

  test('havonta egyszer számláz, az újrafuttatás nem állít ki duplát, a napló rögzít', async () => {
    const agent = createFakeAgentFetch({ now: FAKE_NOW })
    const kassza = createAppKassza({
      store: memoryStore(),
      agentKey: TEST_AGENT_KEY,
      fetch: agent.fetch,
    })
    const journal = createJournal(memoryJournal(), { now: FAKE_NOW })
    const now = new Date('2026-10-02T10:00:00Z')
    const fast = { now, journal, ratePerMinute: 600_000 }

    const preview = await runMonthlyBilling(kassza, subscriptions, { ...fast, dryRun: true })
    const first = await runMonthlyBilling(kassza, subscriptions, fast)
    const again = await runMonthlyBilling(kassza, subscriptions, fast)

    expect(preview.previewed).toHaveLength(2)
    expect(first.created.map((item) => item.key)).toEqual(['SUB-A-2026-09-30', 'SUB-B-2026-09-15'])
    expect(again.existing).toHaveLength(2)
    expect(agent.invoices.size).toBe(2)
    expect([...agent.invoices.values()][0]?.items[0]?.name).toBe(
      'Pro csomag (2026-09-30 – 2026-10-30)',
    )
  })
})
