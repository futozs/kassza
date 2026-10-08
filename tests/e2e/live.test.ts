import { describe } from 'vitest'
import { createKassza } from '../../src/index'
import { defineE2eSuite } from './suite'

const agentKey = process.env.SZAMLAZZ_TEST_AGENT_KEY?.trim()

describe.skipIf(!agentKey)('élő Számlázz.hu tesztfiók (e2e)', () => {
  defineE2eSuite({
    createClient: (hooks) => {
      if (!agentKey) throw new Error('Hiányzik a SZAMLAZZ_TEST_AGENT_KEY.')
      return createKassza({ agentKey, hooks })
    },
    receiptPrefix: process.env.SZAMLAZZ_E2E_RECEIPT_PREFIX?.trim() || 'NYGTA',
    taxNumber: process.env.SZAMLAZZ_E2E_TAXPAYER?.trim() || '13421739',
    email: process.env.SZAMLAZZ_E2E_EMAIL?.trim() || undefined,
    minPdfBytes: 1000,
  })
})
