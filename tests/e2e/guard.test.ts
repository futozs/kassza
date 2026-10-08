import { describe, expect, test } from 'vitest'
import { fakeKassza } from '../fake-agent'
import { assertTestAccount } from './guard'

describe('az e2e tesztfiók-védelem', () => {
  test('tesztfióknál lefut, és a díjbekérőt törli', async () => {
    const { kassza, agent } = fakeKassza({ testAccount: true })

    await expect(assertTestAccount(kassza, 'GUARD-1')).resolves.toBeUndefined()

    expect([...agent.invoices.values()].map((invoice) => invoice.deleted)).toEqual([true])
    expect(agent.requests.map((request) => request.action)).toEqual([
      'createInvoice',
      'getInvoiceXml',
      'deleteProforma',
    ])
  })

  test('éles fióknál leáll, és a díjbekérőt törli, mielőtt hibát dob', async () => {
    const { kassza, agent } = fakeKassza({ testAccount: false })

    await expect(assertTestAccount(kassza, 'GUARD-2')).rejects.toThrow('nem tesztfiók')

    expect([...agent.invoices.values()].map((invoice) => invoice.deleted)).toEqual([true])
    expect(agent.requests.map((request) => request.action)).toEqual([
      'createInvoice',
      'getInvoiceXml',
      'deleteProforma',
    ])
  })
})
