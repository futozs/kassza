import { describe } from 'vitest'
import { createKassza } from '../../src/client'
import { createFakeAgentFetch } from '../../src/testing'
import { TEST_AGENT_KEY } from '../helpers'
import { defineE2eSuite } from './suite'

const TAX_NUMBER = '13421739'

describe('az e2e forgatókönyv a fake agent ellen', () => {
  const agent = createFakeAgentFetch({
    taxpayers: { [TAX_NUMBER]: { name: 'Teszt Adózó Kft.', vatCode: '2', countyCode: '41' } },
  })
  defineE2eSuite({
    createClient: (hooks) =>
      createKassza({ agentKey: TEST_AGENT_KEY, fetch: agent.fetch, retryDelayMs: 0, hooks }),
    receiptPrefix: 'NYGTA',
    taxNumber: TAX_NUMBER,
    email: 'e2e@example.com',
    minPdfBytes: 0,
  })
})
