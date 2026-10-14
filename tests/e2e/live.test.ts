import { describe } from 'vitest'
import { createKassza } from '../../src/index'
import { defineE2eSuite } from './suite'
import { resolveDelayMs, throttledFetch } from './throttle'

const agentKey = process.env.SZAMLAZZ_TEST_AGENT_KEY?.trim()
const delayMs = resolveDelayMs(process.env.SZAMLAZZ_E2E_DELAY_MS)
const invoicePrefix = process.env.SZAMLAZZ_E2E_INVOICE_PREFIX?.trim() || 'OHZ'

describe.skipIf(!agentKey)('élő Számlázz.hu tesztfiók (e2e)', () => {
  defineE2eSuite({
    createClient: (hooks) => {
      if (!agentKey) throw new Error('Hiányzik a SZAMLAZZ_TEST_AGENT_KEY.')
      return createKassza({
        agentKey,
        hooks,
        fetch: throttledFetch(globalThis.fetch, delayMs),
        defaults: { invoice: { prefix: invoicePrefix } },
      })
    },
    receiptPrefix: process.env.SZAMLAZZ_E2E_RECEIPT_PREFIX?.trim() || 'EPLSP',
    taxNumber: process.env.SZAMLAZZ_E2E_TAXPAYER?.trim() || '13421739',
    email: process.env.SZAMLAZZ_E2E_EMAIL?.trim() || undefined,
    minPdfBytes: 1000,
  })
})
