import { createKassza, type Kassza, type KeyValueStore } from 'kassza'

export interface AppKasszaOptions {
  readonly store: KeyValueStore
  readonly agentKey?: string | undefined
  readonly fetch?: typeof globalThis.fetch | undefined
}

export function createAppKassza(options: AppKasszaOptions): Kassza {
  return createKassza({
    ...(options.agentKey ? { agentKey: options.agentKey } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    cookieStore: options.store,
    attemptLedger: options.store,
    createOnceLock: options.store,
    defaults: {
      invoice: { paymentDueInDays: 0 },
      receipt: { prefix: 'NYGT', paymentMethod: 'bankkártya' },
    },
  })
}
