import { describe, expect, test, vi } from 'vitest'
import {
  invoiceXmlResponse,
  type MockHandler,
  mockAgent,
  TEST_AGENT_KEY,
  textErrorResponse,
} from '../tests/helpers'
import { attemptKeyOf, createKassza } from './client'
import type { DocumentEvent, DocumentHook } from './core/document-events'
import { SzamlazzError } from './core/errors'
import { memoryCookieStore } from './core/session'
import { RECEIPT_WITH_PDF_RESPONSE, receiptErrorResponse } from './receipts/test-fixtures'
import { createMockKassza } from './testing'

const BUYER = { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' }
const INVOICE = invoiceXmlResponse(
  '<sikeres>true</sikeres><szamlaszam>E-TST-2026-1</szamlaszam><szamlanetto>1000</szamlanetto><szamlabrutto>1270</szamlabrutto>',
)
const REVERSAL = invoiceXmlResponse(
  '<sikeres>true</sikeres><szamlaszam>E-TST-2026-2</szamlaszam><szamlanetto>-1000</szamlanetto><szamlabrutto>-1270</szamlabrutto>',
)
const PAYMENT = invoiceXmlResponse(
  '<sikeres>true</sikeres><szamlaszam>E-TST-2026-1</szamlaszam><szamlanetto>1000</szamlanetto><szamlabrutto>1270</szamlabrutto><kintlevoseg>0</kintlevoseg>',
)

function kasszaWith(handlers: MockHandler[], onDocument: DocumentHook) {
  const agent = mockAgent(...handlers)
  const kassza = createKassza({
    agentKey: TEST_AGENT_KEY,
    retryDelayMs: 0,
    fetch: agent.fetch,
    hooks: { onDocument },
  })
  return { kassza, agent }
}

describe('onDocument hook', () => {
  test('a számla kiállítását, sztornóját és befizetését jelzi', async () => {
    const events: DocumentEvent[] = []
    const { kassza } = kasszaWith([INVOICE, REVERSAL, PAYMENT, PAYMENT], (event) => {
      events.push(event)
    })
    const input = { buyer: BUYER, items: [{ name: 'A', netUnitPrice: 1000, vat: 27 as const }] }

    await kassza.invoices.create(input)
    await kassza.invoices.reverse({ invoiceNumber: 'E-TST-2026-1' })
    await kassza.invoices.registerPayment({ invoiceNumber: 'E-TST-2026-1', amount: 1270 })
    await kassza.invoices.clearPayments('E-TST-2026-1')

    expect(events.map((event) => [event.kind, event.action, event.number])).toEqual([
      ['invoice', 'created', 'E-TST-2026-1'],
      ['invoice', 'reversed', 'E-TST-2026-2'],
      ['invoice', 'payment', 'E-TST-2026-1'],
      ['invoice', 'payment', 'E-TST-2026-1'],
    ])
    expect(events[0]).toMatchObject({ input })
    expect(events[1]).toMatchObject({ reversedNumber: 'E-TST-2026-1' })
  })

  test('a nyugta kiállítását és sztornóját jelzi, a hookot megvárja', async () => {
    const order: string[] = []
    const { kassza } = kasszaWith(
      [RECEIPT_WITH_PDF_RESPONSE, RECEIPT_WITH_PDF_RESPONSE],
      async (event) => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        order.push(`${event.kind}:${event.action}`)
      },
    )

    await kassza.receipts.create({
      prefix: 'NYGT',
      paymentMethod: 'készpénz',
      items: [{ name: 'A', grossUnitPrice: 100, vat: 27 }],
    })
    order.push('create-resolved')
    await kassza.receipts.reverse('NYGT-2017-123')

    expect(order).toEqual(['receipt:created', 'create-resolved', 'receipt:reversed'])
  })

  test('a hook hibája nem buktatja el a már elkészült bizonylatot', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { kassza } = kasszaWith([INVOICE], () => {
      throw new Error('napló nem elérhető')
    })

    const invoice = await kassza.invoices.create({
      buyer: BUYER,
      items: [{ name: 'A', netUnitPrice: 1000, vat: 27 }],
    })

    expect(invoice.number).toBe('E-TST-2026-1')
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0]?.[0])).toContain('E-TST-2026-1')
    warn.mockRestore()
  })

  test('sikertelen kiállításnál nem jelez', async () => {
    const events: DocumentEvent[] = []
    const { kassza } = kasszaWith([textErrorResponse('XML hiba', 57)], (event) => {
      events.push(event)
    })

    await kassza.invoices
      .create({ buyer: BUYER, items: [{ name: 'A', netUnitPrice: 1000, vat: 27 }] })
      .catch(() => undefined)

    expect(events).toHaveLength(0)
  })
})

describe('resetAttempts', () => {
  test('az attempt_limit hibából vagy kulcsból törli a számlálót', async () => {
    const store = memoryCookieStore()
    const agent = mockAgent((_, index) => (index < 5 ? textErrorResponse('XML hiba', 57) : INVOICE))
    const kassza = createKassza({
      agentKey: TEST_AGENT_KEY,
      retryDelayMs: 0,
      fetch: agent.fetch,
      attemptLedger: store,
    })
    const input = { buyer: BUYER, items: [{ name: 'A', netUnitPrice: 1000, vat: 27 as const }] }
    for (let index = 0; index < 5; index++)
      await kassza.invoices.create(input).catch(() => undefined)
    const error = (await kassza.invoices.create(input).catch((caught) => caught)) as SzamlazzError

    expect(error.category).toBe('attempt_limit')
    await kassza.resetAttempts(error)
    expect(agent.calls).toHaveLength(5)
    await expect(kassza.invoices.create(input)).resolves.toMatchObject({ number: 'E-TST-2026-1' })
  })

  test('kulcs nélküli hibára TypeError-t dob, szöveget változatlanul ad vissza', () => {
    expect(attemptKeyOf('szamlazz:attempts:abc')).toBe('szamlazz:attempts:abc')
    expect(() => attemptKeyOf(new SzamlazzError('x', { category: 'validation' }))).toThrow(
      TypeError,
    )
  })
})

describe('createMockKassza bővítések', () => {
  test('az onDocument hookot a mock is hívja', async () => {
    const events: DocumentEvent[] = []
    const kassza = createMockKassza({ hooks: { onDocument: (event) => void events.push(event) } })

    const invoice = await kassza.invoices.create({
      buyer: BUYER,
      items: [{ name: 'A', netUnitPrice: 1000, vat: 27 }],
    })
    await kassza.invoices.registerPayment({ invoiceNumber: invoice.number, amount: 1270 })
    await kassza.invoices.clearPayments(invoice.number)
    await kassza.invoices.reverse(invoice.number)
    const receipt = await kassza.receipts.create({
      prefix: 'NYGT',
      paymentMethod: 'készpénz',
      items: [{ name: 'A', grossUnitPrice: 100, vat: 27 }],
    })
    await kassza.receipts.reverse({ receiptNumber: receipt.number, callId: 'R-1' })

    expect(events.map((event) => `${event.kind}:${event.action}`)).toEqual([
      'invoice:created',
      'invoice:payment',
      'invoice:payment',
      'invoice:reversed',
      'receipt:created',
      'receipt:reversed',
    ])
  })

  test('a failNext afterSuccess módja elvégzi a műveletet, de hibát ad (elveszett válasz)', async () => {
    const kassza = createMockKassza()
    kassza.failNext('invoices.create', undefined, { afterSuccess: true })

    const result = await kassza.invoices.createOnce({
      buyer: BUYER,
      orderNumber: 'ORDER-77',
      items: [{ name: 'A', netUnitPrice: 1000, vat: 27 }],
    })

    expect(result.created).toBe(true)
    expect(result.details?.header.orderNumber).toBe('ORDER-77')
    expect(kassza.invoiceRecords.size).toBe(1)
  })

  test('a createOnce a mockban is egyszer állít ki', async () => {
    const kassza = createMockKassza()
    const input = {
      orderNumber: 'ORDER-1',
      buyer: BUYER,
      items: [{ name: 'A', netUnitPrice: 1000, vat: 27 as const }],
    }

    const first = await kassza.invoices.createOnce(input)
    const second = await kassza.invoices.createOnce(input)
    const receipt = await kassza.receipts.createOnce({
      orderNumber: 'POS-1',
      prefix: 'NYGT',
      paymentMethod: 'készpénz',
      items: [{ name: 'A', grossUnitPrice: 100, vat: 27 }],
    })
    const receiptAgain = await kassza.receipts.createOnce({
      orderNumber: 'POS-1',
      prefix: 'NYGT',
      paymentMethod: 'készpénz',
      items: [{ name: 'A', grossUnitPrice: 100, vat: 27 }],
    })

    expect(first.created).toBe(true)
    expect(second).toMatchObject({ created: false, number: first.number })
    expect(receipt.created).toBe(true)
    expect(receiptAgain).toMatchObject({
      created: false,
      receipt: { number: receipt.receipt.number },
    })
    expect(receipt.receipt.callId).toBe('POS-1')
    expect(kassza.calls.filter((call) => call.method === 'invoices.create')).toHaveLength(1)
    await expect(kassza.resetAttempts('k')).resolves.toBeUndefined()
  })
})

describe('issueForPayment a valódi kliensen', () => {
  test('a fizetésből visszakeresés után egyszer állít ki nyugtát', async () => {
    const agent = mockAgent(
      receiptErrorResponse(339, 'A nyugtaszám nem létezik.'),
      RECEIPT_WITH_PDF_RESPONSE,
    )
    const kassza = createKassza({
      agentKey: TEST_AGENT_KEY,
      retryDelayMs: 0,
      fetch: agent.fetch,
      defaults: { receipt: { prefix: 'NYGT' } },
    })

    const result = await kassza.issueForPayment(
      {
        provider: 'stripe',
        kind: 'paid',
        id: 'pi_1',
        amount: { value: 1270, currency: 'HUF' },
        method: 'bankkártya',
        raw: {},
      },
      { vat: 27, fallbackItemName: 'Webshop rendelés' },
    )

    expect(result).toMatchObject({ kind: 'receipt', created: true, orderNumber: 'STRIPE-pi_1' })
    expect(agent.calls).toHaveLength(2)
    expect(agent.calls[0]?.xml).toContain('<rendelesSzam>STRIPE-pi_1</rendelesSzam>')
    const createXml = agent.calls[1]?.xml ?? ''
    expect(createXml).toContain('<hivasAzonosito>STRIPE-pi_1</hivasAzonosito>')
    expect(createXml).toContain('<rendelesSzam>STRIPE-pi_1</rendelesSzam>')
    expect(createXml).toContain('<fizmod>bankkártya</fizmod>')
    expect(createXml).toContain('<megnevezes>Webshop rendelés</megnevezes>')
    expect(createXml).toContain('<brutto>1270</brutto>')
  })
})
