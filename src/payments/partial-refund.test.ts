import { describe, expect, test } from 'vitest'
import { fakeKassza } from '../../tests/fake-agent'
import { SzamlazzError } from '../core/errors'
import type { IssuedCorrection, IssuedRefundProposal } from './partial-refund'
import { correctionExternalId } from './partial-refund'
import type { PaymentEvent, PaymentRefund } from './types'

const CUSTOMER = {
  name: 'Kovács Éva',
  email: 'eva@pelda.hu',
  address: { country: 'HU', zip: '1111', city: 'Budapest', line1: 'Fő utca 1.' },
}

function paid(items: PaymentEvent['items'], total: number): PaymentEvent {
  return {
    provider: 'barion',
    kind: 'paid',
    id: 'PAY-1',
    eventId: 'PAY-1:Succeeded:0',
    method: 'bankkártya',
    amount: { value: total, currency: 'HUF' },
    customer: CUSTOMER,
    items,
    raw: {},
  }
}

function partial(refunds: readonly PaymentRefund[], total = 10_000): PaymentEvent {
  const refunded = refunds.reduce((sum, refund) => sum + refund.amount.value, 0)
  return {
    provider: 'barion',
    kind: 'partially-refunded',
    id: 'PAY-1',
    eventId: `PAY-1:PartiallyRefunded:${refunds.length}`,
    method: 'bankkártya',
    amount: { value: total, currency: 'HUF' },
    refundedAmount: { value: refunded, currency: 'HUF' },
    refunds,
    raw: {},
  }
}

function refund(id: string, value: number, refundedBefore = 0): PaymentRefund {
  return { id, amount: { value, currency: 'HUF' }, refundedBefore }
}

const SINGLE_VAT = [
  { name: 'Póló', quantity: 2, totalGross: 7_000, vatPercent: 27 },
  { name: 'Sapka', quantity: 1, totalGross: 3_000, vatPercent: 27 },
]

const MIXED_VAT = [
  { name: 'Könyv', quantity: 1, totalGross: 4_000, vatPercent: 5 },
  { name: 'Póló', quantity: 1, totalGross: 6_000, vatPercent: 27 },
]

async function invoiced(items = SINGLE_VAT) {
  const setup = fakeKassza()
  const issued = await setup.kassza.issueForPayment(paid(items, 10_000), { document: 'invoice' })
  expect(issued.kind).toBe('invoice')
  return { ...setup, original: issued.kind === 'invoice' ? issued.number : '' }
}

function correctives(agent: ReturnType<typeof fakeKassza>['agent']) {
  return [...agent.invoices.values()].filter((invoice) => invoice.typeCode === 'HS')
}

describe('issueForPayment részleges visszatérítésnél', () => {
  test('egy áfakulcsnál helyesbítő számlát állít ki a visszatérített összegre', async () => {
    const { agent, kassza, original } = await invoiced()

    const result = (await kassza.issueForPayment(
      partial([refund('TR-1', 3_500)]),
    )) as IssuedCorrection

    expect(result).toMatchObject({
      kind: 'correction',
      orderNumber: 'BARION-PAY-1',
      correctedNumber: original,
      created: true,
      corrections: [{ refundId: 'TR-1', created: true, grossTotal: -3_500 }],
    })
    const [corrective] = correctives(agent)
    expect(corrective?.referencedInvoiceNumber).toBe(original)
    expect(corrective?.totals.gross).toBe(-3_500)
    expect(corrective?.items.every((item) => item.quantity < 0)).toBe(true)
    expect(corrective?.externalId).toBe(await correctionExternalId('BARION-PAY-1', 'TR-1'))
  })

  test('az újraküldött esemény nem állít ki újabb helyesbítést', async () => {
    const { agent, kassza } = await invoiced()
    const event = partial([refund('TR-1', 3_500)])

    await kassza.issueForPayment(event)
    const again = (await kassza.issueForPayment(event)) as IssuedCorrection

    expect(again.created).toBe(false)
    expect(again.corrections[0]?.created).toBe(false)
    expect(correctives(agent)).toHaveLength(1)
  })

  test('a teljes visszatérítési lista esetén csak az újat helyesbíti, a tételek nem lépik túl az eredetit', async () => {
    const { agent, kassza } = await invoiced()

    await kassza.issueForPayment(partial([refund('TR-1', 3_333)]))
    const second = (await kassza.issueForPayment(
      partial([refund('TR-1', 3_333), refund('TR-2', 6_667, 3_333)]),
    )) as IssuedCorrection

    expect(second.corrections.map((correction) => correction.created)).toEqual([false, true])
    const all = correctives(agent)
    expect(all).toHaveLength(2)
    expect(all.reduce((sum, invoice) => sum + invoice.totals.gross, 0)).toBe(-10_000)
    const perItem = new Map<string, number>()
    for (const invoice of all) {
      for (const item of invoice.items) {
        perItem.set(item.name, (perItem.get(item.name) ?? 0) + item.grossAmount)
      }
    }
    expect(Object.fromEntries(perItem)).toEqual({ Póló: -7_000, Sapka: -3_000 })
  })

  test('több áfakulcsnál alapból javaslatot ad, és nem állít ki semmit', async () => {
    const { agent, kassza, original } = await invoiced(MIXED_VAT)

    const result = (await kassza.issueForPayment(
      partial([refund('TR-1', 6_000)]),
    )) as IssuedRefundProposal

    expect(result).toMatchObject({
      kind: 'refund-proposal',
      document: 'invoice',
      documentNumber: original,
      refunds: [{ refundId: 'TR-1', grossTotal: 6_000 }],
    })
    expect(result.reason).toContain('refundItems')
    expect(result.refunds[0]?.items.map((item) => [item.vat, item.grossAmount])).toEqual([
      [5, 2_400],
      [27, 3_600],
    ])
    expect(correctives(agent)).toHaveLength(0)
  })

  test("több áfakulcsnál partialRefund: 'proportional' esetén arányosan helyesbít", async () => {
    const { agent, kassza } = await invoiced(MIXED_VAT)

    await kassza.issueForPayment(partial([refund('TR-1', 1_000)]), {
      partialRefund: 'proportional',
    })

    const [corrective] = correctives(agent)
    expect(corrective?.items.map((item) => [item.vatRate, item.grossAmount])).toEqual([
      [5, -400],
      [27, -600],
    ])
  })

  test('a refundItems pontosan a megadott tételeket helyesbíti', async () => {
    const { agent, kassza, original } = await invoiced(MIXED_VAT)

    await kassza.issueForPayment(partial([refund('TR-1', 6_000)]), {
      refundItems: ({ invoiceNumber, items }) => {
        expect(invoiceNumber).toBe(original)
        expect(items).toHaveLength(2)
        return [{ name: 'Póló', grossUnitPrice: 6_000, vat: 27 }]
      },
    })

    const [corrective] = correctives(agent)
    expect(corrective?.items).toMatchObject([{ name: 'Póló', quantity: -1, grossAmount: -6_000 }])
  })

  test('a refundItems eltérő összegére validációs hibát dob', async () => {
    const { kassza } = await invoiced(MIXED_VAT)
    await expect(
      kassza.issueForPayment(partial([refund('TR-1', 6_000)]), {
        refundItems: () => [{ name: 'Póló', grossUnitPrice: 5_000, vat: 27 }],
      }),
    ).rejects.toMatchObject({ category: 'validation' })
  })

  test('a refundItems bruttó egységár vagy érvényes mennyiség nélkül validációs hibát dob, kérés nélkül', async () => {
    const { agent, kassza } = await invoiced(MIXED_VAT)
    const sent = agent.requests.length
    for (const items of [
      [{ name: 'Póló', netUnitPrice: 4_724, vat: 27 as const }],
      [{ name: 'Póló', grossUnitPrice: Number.NaN, vat: 27 as const }],
      [{ name: 'Póló', grossUnitPrice: -6_000, vat: 27 as const }],
      [{ name: 'Póló', quantity: 0, grossUnitPrice: 6_000, vat: 27 as const }],
      [
        {
          name: 'Póló',
          quantity: Number.POSITIVE_INFINITY,
          grossUnitPrice: 6_000,
          vat: 27 as const,
        },
      ],
    ]) {
      await expect(
        kassza.issueForPayment(partial([refund('TR-1', 6_000)]), { refundItems: () => items }),
      ).rejects.toMatchObject({ category: 'validation', message: expect.stringContaining('Póló') })
    }
    expect(
      agent.requests.slice(sent).filter((request) => request.action === 'createInvoice'),
    ).toEqual([])
  })

  test('nyugtánál csak javaslatot ad', async () => {
    const { agent, kassza } = fakeKassza()
    await kassza.issueForPayment(paid(SINGLE_VAT, 10_000), { document: 'receipt' })

    const result = (await kassza.issueForPayment(
      partial([refund('TR-1', 1_000)]),
    )) as IssuedRefundProposal

    expect(result).toMatchObject({ kind: 'refund-proposal', document: 'receipt' })
    expect(result.reason).toContain('könyvelő')
    expect(result.refunds[0]?.items.reduce((sum, item) => sum + item.grossAmount, 0)).toBe(1_000)
    expect(agent.receipts.size).toBe(1)
  })

  test('tételes visszatérítés nélkül, skip módban vagy bizonylat nélkül kihagyja', async () => {
    const { kassza } = await invoiced()

    const noRefunds = await kassza.issueForPayment({ ...partial([]), refunds: undefined })
    const skipMode = await kassza.issueForPayment(partial([refund('TR-1', 1)]), {
      partialRefund: 'skip',
    })
    const unknown = await kassza.issueForPayment({ ...partial([refund('TR-1', 1)]), id: 'MAS' })

    expect(noRefunds).toMatchObject({ kind: 'skipped' })
    expect(noRefunds.kind === 'skipped' && noRefunds.reason).toContain('tételesen')
    expect(skipMode).toMatchObject({ kind: 'skipped' })
    expect(unknown).toMatchObject({ kind: 'skipped' })
  })

  test('sztornózott számlát nem helyesbít', async () => {
    const { kassza, original } = await invoiced()
    await kassza.invoices.reverse(original)

    expect(await kassza.issueForPayment(partial([refund('TR-1', 1_000)]))).toMatchObject({
      kind: 'skipped',
    })
  })

  test('a pénznem eltérésére és a túl nagy visszatérítésre validációs hibát dob', async () => {
    const { kassza } = await invoiced()

    await expect(
      kassza.issueForPayment(
        partial([{ id: 'TR-1', amount: { value: 10, currency: 'EUR' }, refundedBefore: 0 }]),
      ),
    ).rejects.toBeInstanceOf(SzamlazzError)
    await expect(kassza.issueForPayment(partial([refund('TR-1', 10_001)]))).rejects.toMatchObject({
      category: 'validation',
    })
  })

  test('a hosszú visszatérítés-azonosítót rövid hash-sé alakítja', async () => {
    expect(await correctionExternalId('R-1', 'TR-1')).toBe('R-1/R-TR-1')
    const long = await correctionExternalId('R-1', 'evt_1NvRsT2eZvKYlo2C9Xy8a7Bc')
    expect(long).toMatch(/^R-1\/R-[0-9a-f]{16}$/)
    expect(await correctionExternalId('R-1', 'evt_1NvRsT2eZvKYlo2C9Xy8a7Bc')).toBe(long)
    expect(await correctionExternalId('R-1', 'ékezet')).toMatch(/^R-1\/R-[0-9a-f]{16}$/)
  })
})
