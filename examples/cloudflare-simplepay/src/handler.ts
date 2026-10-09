import { createKassza, type KeyValueStore } from 'kassza'
import { simplePayWebhook } from 'kassza/payments/simplepay'

export interface WorkerConfig {
  readonly agentKey: string
  readonly simplePaySecretKey: string
  readonly sandbox: boolean
  readonly store: KeyValueStore
  readonly fetch?: typeof globalThis.fetch | undefined
  readonly agentFetch?: typeof globalThis.fetch | undefined
  readonly now?: (() => Date) | undefined
}

export function createWorkerHandler(config: WorkerConfig): (request: Request) => Promise<Response> {
  const kassza = createKassza({
    agentKey: config.agentKey,
    ...(config.agentFetch ? { fetch: config.agentFetch } : {}),
    cookieStore: config.store,
    attemptLedger: config.store,
    createOnceLock: config.store,
    defaults: { receipt: { prefix: 'NYGT', paymentMethod: 'bankkártya' } },
  })
  const webhook = simplePayWebhook({
    secretKey: config.simplePaySecretKey,
    sandbox: config.sandbox,
    fetch: config.fetch,
    now: config.now,
    dedupe: config.store,
    onPayment: async (payment) => {
      await kassza.issueForPayment(payment, { vat: 27 })
    },
  })
  return async (request) => {
    const url = new URL(request.url)
    if (request.method === 'POST' && url.pathname === '/simplepay/ipn') return webhook(request)
    return new Response('Nem található', { status: 404 })
  }
}
