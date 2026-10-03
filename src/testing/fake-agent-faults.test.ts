import { describe, expect, test } from 'vitest'
import { fakeKassza } from '../../tests/fake-agent'
import { memoryCookieStore } from '../core/session'
import type { InvoiceBuyer } from '../invoices/create-types'
import type { PaymentEvent } from '../payments/types'
import type { CreateReceiptInput } from '../receipts/types'
import { createFakeAgentFetch } from './index'

const BUYER: InvoiceBuyer = {
  name: 'Vevő Kft.',
  zip: '1111',
  city: 'Budapest',
  address: 'Fő utca 1.',
}

const INVOICE = {
  orderNumber: 'WEB-1',
  buyer: BUYER,
  items: [{ name: 'Tanácsadás', netUnitPrice: 10_000, vat: 27 as const }],
}

const RECEIPT: CreateReceiptInput = {
  orderNumber: 'WEB-1',
  items: [{ name: 'Kávé', grossUnitPrice: 890, vat: 27 }],
}

function paid(overrides: Partial<PaymentEvent> = {}): PaymentEvent {
  return {
    provider: 'stripe',
    kind: 'paid',
    id: 'pi_1',
    amount: { value: 1780, currency: 'HUF' },
    method: 'bankkártya',
    items: [{ name: 'Kávé', quantity: 2, totalGross: 1780 }],
    raw: {},
    ...overrides,
  }
}

describe('createFakeAgentFetch: hibainjektálás', () => {
  test('ghostSuccess: a számla elkészül, a kliens időtúllépést kap, a createOnce visszakeresi', async () => {
    const { agent, kassza } = fakeKassza()
    agent.fail('ghostSuccess', { action: 'createInvoice' })

    const result = await kassza.invoices.createOnce(INVOICE, { recoveryDelayMs: 0 })

    expect(result).toMatchObject({ number: 'KASSZA-2026-1', created: true, externalId: 'WEB-1' })
    expect(agent.invoices.size).toBe(1)
    expect(agent.requests.map((request) => request.action)).toEqual([
      'getInvoiceXml',
      'getInvoiceXml',
      'createInvoice',
      'getInvoiceXml',
    ])
  })

  test('ghostSuccess nélküli sima create időtúllépési hibát kap, de a számla a fiókban van', async () => {
    const { agent, kassza } = fakeKassza()
    agent.fail('ghostSuccess')

    await expect(kassza.invoices.create(INVOICE)).rejects.toMatchObject({ category: 'timeout' })
    expect(agent.invoices.get('KASSZA-2026-1')).toBeDefined()
  })

  test('ghostSuccess nyugtánál: az újrapróbálás 338-at kap, a createOnce a meglévőt adja vissza', async () => {
    const { agent, kassza } = fakeKassza()
    agent.fail('ghostSuccess', { action: 'createReceipt' })

    const result = await kassza.receipts.createOnce(RECEIPT, { recoveryDelayMs: 0 })

    expect(result).toMatchObject({
      created: false,
      receipt: { number: 'NYGT-2026-1', callId: 'WEB-1' },
    })
    expect(agent.receipts.size).toBe(1)
    expect(agent.requests.map((request) => request.action)).toEqual([
      'getReceipt',
      'createReceipt',
      'createReceipt',
      'getReceipt',
    ])
  })

  test('maintenance: 1-es kód, az újrapróbálható lekérdezés második próbára sikerül', async () => {
    const { agent, kassza } = fakeKassza()
    const receipt = await kassza.receipts.create(RECEIPT)
    agent.fail('maintenance', { action: 'getReceipt' })

    const found = await kassza.receipts.get(receipt.number)

    expect(found.number).toBe(receipt.number)
    expect(agent.requests.filter((request) => request.action === 'getReceipt')).toHaveLength(2)
  })

  test('maintenance nem újrapróbálható kiállításnál karbantartási hibát ad, bizonylat nélkül', async () => {
    const { agent, kassza } = fakeKassza()
    agent.fail('maintenance')

    await expect(kassza.invoices.create(INVOICE)).rejects.toMatchObject({
      code: 1,
      category: 'maintenance',
      retryable: true,
    })
    expect(agent.invoices.size).toBe(0)
  })

  test('partialSuccess: a számla elkészül, a kliens 56-os partial_success hibát kap', async () => {
    const { agent, kassza } = fakeKassza()
    agent.fail('partialSuccess', { action: 'createInvoice' })

    await expect(kassza.invoices.create(INVOICE)).rejects.toMatchObject({
      code: 56,
      category: 'partial_success',
    })
    expect(agent.invoices.size).toBe(1)
    expect(await kassza.invoices.find({ orderNumber: 'WEB-1' })).not.toBeNull()
  })

  test('partialSuccess a createOnce-ban visszakeresett, létrehozott számlát ad', async () => {
    const { agent, kassza } = fakeKassza()
    agent.fail('partialSuccess', { action: 'createInvoice' })

    const result = await kassza.invoices.createOnce(INVOICE, { recoveryDelayMs: 0 })

    expect(result).toMatchObject({ number: 'KASSZA-2026-1', created: true })
  })

  test('testAccountLimit: 167 rate_limit, nem jön létre bizonylat, és nem próbálja újra', async () => {
    const { agent, kassza } = fakeKassza()
    agent.fail('testAccountLimit')

    await expect(kassza.receipts.create({ ...RECEIPT, callId: 'WEB-1' })).rejects.toMatchObject({
      code: 167,
      category: 'rate_limit',
    })
    expect(agent.receipts.size).toBe(0)
    expect(agent.requests).toHaveLength(1)
  })

  test('networkError és timeout: nem jön létre bizonylat, a kliens hálózati vagy időtúllépési hibát kap', async () => {
    const { agent, kassza } = fakeKassza()
    agent.fail('networkError')
    agent.fail('timeout')

    await expect(kassza.invoices.create(INVOICE)).rejects.toMatchObject({ category: 'network' })
    await expect(kassza.invoices.create(INVOICE)).rejects.toMatchObject({ category: 'timeout' })
    expect(agent.invoices.size).toBe(0)
  })

  test('serverError: HTTP 500 választ ad, amit a kliens hálózati hibaként kezel', async () => {
    const { agent, kassza } = fakeKassza()
    agent.fail('serverError')

    await expect(kassza.invoices.create(INVOICE)).rejects.toMatchObject({
      category: 'network',
      httpStatus: 500,
    })
    expect(agent.invoices.size).toBe(0)
  })

  test('duplicateOrderNumber és duplicateCallId: a kérés adataival 152-t és 338-at ad', async () => {
    const { agent, kassza } = fakeKassza()
    agent.fail('duplicateOrderNumber', { action: 'createInvoice' })
    agent.fail('duplicateCallId', { action: 'createReceipt' })

    await expect(kassza.invoices.create(INVOICE)).rejects.toMatchObject({
      code: 152,
      category: 'duplicate',
      message: expect.stringContaining('Már létező rendelésszám: WEB-1'),
    })
    await expect(kassza.receipts.create({ ...RECEIPT, callId: 'WEB-1' })).rejects.toMatchObject({
      code: 338,
      category: 'duplicate',
    })
    expect(agent.invoices.size + agent.receipts.size).toBe(0)
  })

  test('egyedi hibakód üzenettel, sikeres művelet utáni hibaként is', async () => {
    const { agent, kassza } = fakeKassza()
    agent.fail({ code: 54 })
    agent.fail({ code: 999, message: 'Saját hiba', afterSuccess: true })

    await expect(kassza.invoices.create({ ...INVOICE, eInvoice: true })).rejects.toMatchObject({
      code: 54,
      category: 'account',
    })
    await expect(kassza.invoices.create(INVOICE)).rejects.toMatchObject({
      code: 999,
      message: '[999] Saját hiba',
    })
    expect(agent.invoices.size).toBe(1)
  })

  test('a hiba csak a megadott műveletre és a megadott számú alkalommal hat', async () => {
    const { agent, kassza } = fakeKassza()
    agent.fail('maintenance', { action: 'createReceipt', times: 2 })

    await kassza.invoices.create(INVOICE)
    await expect(kassza.receipts.create(RECEIPT)).rejects.toMatchObject({ code: 1 })
    await expect(kassza.receipts.create(RECEIPT)).rejects.toMatchObject({ code: 1 })
    const receipt = await kassza.receipts.create(RECEIPT)

    expect(receipt.number).toBe('NYGT-2026-1')
  })

  test('a kezdeti hibák a reset után újra élesednek, az állapot kiürül', async () => {
    const { agent, kassza } = fakeKassza({
      faults: [{ fault: 'maintenance', action: 'createInvoice' }],
    })

    await expect(kassza.invoices.create(INVOICE)).rejects.toMatchObject({ code: 1 })
    await kassza.invoices.create(INVOICE)
    agent.fail('timeout')
    agent.reset()

    expect(agent.invoices.size).toBe(0)
    expect(agent.requests).toHaveLength(0)
    await expect(kassza.invoices.create(INVOICE)).rejects.toMatchObject({ code: 1 })
    expect((await kassza.invoices.create(INVOICE)).number).toBe('KASSZA-2026-1')
  })

  test('hibás hibabeállításra TypeError-t dob', () => {
    const agent = createFakeAgentFetch()

    expect(() => agent.fail('nincs-ilyen' as 'timeout')).toThrow(TypeError)
    expect(() => agent.fail('timeout', { times: 0 })).toThrow(TypeError)
    expect(() => agent.fail('timeout', { times: 1.5 })).toThrow(TypeError)
    expect(() => agent.fail({ code: 0 })).toThrow(TypeError)
    expect(() => agent.fail('timeout', { action: 'nincs' as 'createInvoice' })).toThrow(TypeError)
    expect(() => createFakeAgentFetch({ faults: [{ fault: 'timeout', times: -1 }] })).toThrow(
      TypeError,
    )
  })

  test('a próbálkozásnapló 5 sikertelen próbálkozás után blokkolja az azonos kérést', async () => {
    const { agent, kassza } = fakeKassza({}, { attemptLedger: memoryCookieStore() })
    agent.fail('maintenance', { times: 5 })

    for (let attempt = 0; attempt < 5; attempt++) {
      await expect(kassza.invoices.create(INVOICE)).rejects.toMatchObject({ code: 1 })
    }
    await expect(kassza.invoices.create(INVOICE)).rejects.toMatchObject({
      category: 'attempt_limit',
    })
    expect(agent.requests).toHaveLength(5)
  })

  test('megszakított kérést nem dolgoz fel', async () => {
    const agent = createFakeAgentFetch()
    const controller = new AbortController()
    controller.abort(new Error('megszakítva'))

    await expect(
      agent.fetch('https://www.szamlazz.hu/szamla/', {
        method: 'POST',
        body: new FormData(),
        signal: controller.signal,
      }),
    ).rejects.toThrow('megszakítva')
    expect(agent.requests).toHaveLength(0)
  })
})

describe('createFakeAgentFetch: issueForPayment végponttól végpontig', () => {
  test('fizetésből nyugta, ismételt webhook nem duplikál, visszatérítés sztornóz', async () => {
    const { agent, kassza } = fakeKassza()

    const issued = await kassza.issueForPayment(paid(), { vat: 27, recoveryDelayMs: 0 })
    const repeated = await kassza.issueForPayment(paid(), { vat: 27, recoveryDelayMs: 0 })
    const refund = await kassza.issueForPayment(paid({ kind: 'refunded' }), {
      vat: 27,
      recoveryDelayMs: 0,
    })
    const refundAgain = await kassza.issueForPayment(paid({ kind: 'refunded' }), {
      vat: 27,
      recoveryDelayMs: 0,
    })
    const paidAfterRefund = await kassza.issueForPayment(paid(), { vat: 27, recoveryDelayMs: 0 })

    expect(issued).toMatchObject({
      kind: 'receipt',
      orderNumber: 'STRIPE-pi_1',
      number: 'NYGT-2026-1',
      created: true,
    })
    expect(repeated).toMatchObject({ kind: 'receipt', number: 'NYGT-2026-1', created: false })
    expect(refund).toMatchObject({
      kind: 'reversal',
      document: 'receipt',
      reversedNumber: 'NYGT-2026-1',
      number: 'NYGT-2026-2',
      created: true,
    })
    expect(refundAgain).toMatchObject({ kind: 'reversal', number: 'NYGT-2026-2', created: false })
    expect(paidAfterRefund).toMatchObject({ kind: 'skipped' })
    expect([...agent.receipts.values()].map((receipt) => [receipt.number, receipt.callId])).toEqual(
      [
        ['NYGT-2026-1', 'STRIPE-pi_1'],
        ['NYGT-2026-2', 'STRIPE-pi_1/SN'],
      ],
    )
  })

  test('céges vevőnek számlát állít ki, visszatérítéskor sztornó számlát, szellem-siker mellett is egyszer', async () => {
    const { agent, kassza } = fakeKassza()
    const company = paid({
      customer: {
        name: 'Példa Kft.',
        taxNumber: '12345678-2-42',
        address: { country: 'HU', zip: '1111', city: 'Budapest', line1: 'Fő utca 1.' },
      },
    })
    agent.fail('ghostSuccess', { action: 'createInvoice' })
    agent.fail('ghostSuccess', { action: 'reverseInvoice' })

    const issued = await kassza.issueForPayment(company, { vat: 27, recoveryDelayMs: 0 })
    const refund = await kassza.issueForPayment(
      { ...company, kind: 'refunded' },
      { vat: 27, recoveryDelayMs: 0 },
    )

    expect(issued).toMatchObject({ kind: 'invoice', number: 'KASSZA-2026-1', created: true })
    expect(refund).toMatchObject({
      kind: 'reversal',
      document: 'invoice',
      reversedNumber: 'KASSZA-2026-1',
      number: 'KASSZA-2026-2',
      created: true,
    })
    expect(
      [...agent.invoices.values()].map((invoice) => [invoice.number, invoice.externalId]),
    ).toEqual([
      ['KASSZA-2026-1', 'STRIPE-pi_1'],
      ['KASSZA-2026-2', 'STRIPE-pi_1/SS'],
    ])
  })
})
