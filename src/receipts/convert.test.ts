import { describe, expect, test } from 'vitest'
import { createMockKassza } from '../testing'
import {
  conversionExternalId,
  convertReceiptToInvoice,
  receiptItemsToInvoiceItems,
} from './convert'
import type { Receipt } from './types'

const BUYER = {
  name: 'Példa Kft.',
  zip: '1117',
  city: 'Budapest',
  address: 'Fő utca 1.',
  taxNumber: '12345678-2-41',
}

function sampleReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    id: 1,
    number: 'NYGT-2026-5',
    type: 'receipt',
    isReversed: false,
    issueDate: '2026-10-01',
    paymentMethod: 'bankkártya',
    currency: 'HUF',
    isTest: true,
    items: [
      {
        name: 'Kávé',
        quantity: 3,
        unit: 'db',
        netUnitPrice: 700.79,
        vat: 27,
        vatPercentage: 27,
        netAmount: 2102.36,
        vatAmount: 567.64,
        grossAmount: 2670,
      },
    ],
    payments: [],
    totals: { netAmount: 2102.36, vatAmount: 567.64, grossAmount: 2670, byVat: [] },
    ...overrides,
  }
}

describe('receiptItemsToInvoiceItems', () => {
  test('a tételeket bruttó egységárral és változatlan mennyiséggel viszi át', () => {
    expect(receiptItemsToInvoiceItems(sampleReceipt())).toEqual([
      {
        name: 'Kávé',
        identifier: undefined,
        quantity: 3,
        unit: 'db',
        grossUnitPrice: 890,
        vat: 27,
      },
    ])
  })

  test('nyugta-specifikus áfakódnál leképezést kér, és azt használja', () => {
    const receipt = sampleReceipt({
      items: [{ ...sampleReceipt().items[0], vat: 'ÁKK', vatPercentage: 0 } as Receipt['items'][0]],
    })

    expect(() => receiptItemsToInvoiceItems(receipt)).toThrow(/csak nyugtán használható/)
    expect(receiptItemsToInvoiceItems(receipt, { ÁKK: 'TAHK' })[0]?.vat).toBe('TAHK')
  })

  test('nem pozitív mennyiségnél validációs hibát dob', () => {
    const receipt = sampleReceipt({
      items: [{ ...sampleReceipt().items[0], quantity: 0 } as Receipt['items'][0]],
    })

    expect(() => receiptItemsToInvoiceItems(receipt)).toThrow(/nem pozitív/)
  })
})

describe('receipts.convertToInvoice', () => {
  test('sztornózza a nyugtát, és ugyanazokkal az összegekkel kiállítja a számlát', async () => {
    const kassza = createMockKassza()
    const receipt = await kassza.receipts.create({
      prefix: 'NYGT',
      paymentMethod: 'bankkártya',
      orderNumber: 'POS-9',
      items: [{ name: 'Kávé', quantity: 3, grossUnitPrice: 890, vat: 27 }],
    })

    const result = await kassza.receipts.convertToInvoice({
      receiptNumber: receipt.number,
      buyer: BUYER,
    })

    expect(result.reversal?.type).toBe('reversal')
    expect(result.reversal?.reversedReceiptNumber).toBe(receipt.number)
    expect(result.invoice).toMatchObject({
      created: true,
      externalId: conversionExternalId(receipt.number),
    })
    expect(result.invoice.invoice?.grossTotal).toBe(2670)
    const record = kassza.invoiceRecords.get(result.invoice.number)
    expect(record?.input).toMatchObject({
      orderNumber: 'POS-9',
      paid: true,
      paymentMethod: 'bankkártya',
      fulfillmentDate: receipt.issueDate,
    })
    expect(record?.input?.exchangeRate).toBeUndefined()
    expect(record?.input?.comment).toContain(`A(z) ${receipt.number} nyugta alapján`)
    expect(record?.input?.comment).toContain(`sztornó: ${result.reversal?.number}`)
  })

  test('második hívásra a meglévő számlát adja, nem sztornóz újra', async () => {
    const kassza = createMockKassza()
    const receipt = await kassza.receipts.create({
      prefix: 'NYGT',
      paymentMethod: 'készpénz',
      items: [{ name: 'Kávé', grossUnitPrice: 890, vat: 27 }],
    })
    const first = await kassza.receipts.convertToInvoice({
      receiptNumber: receipt.number,
      buyer: BUYER,
    })

    const second = await kassza.receipts.convertToInvoice({
      receiptNumber: receipt.number,
      buyer: BUYER,
    })

    expect(second.invoice).toMatchObject({ number: first.invoice.number, created: false })
    expect(second.reversal).toBeUndefined()
    expect(kassza.calls.filter((call) => call.method === 'receipts.reverse')).toHaveLength(1)
    expect(kassza.calls.filter((call) => call.method === 'invoices.create')).toHaveLength(1)
  })

  test('sztornó nyugtát nem alakít át', async () => {
    const kassza = createMockKassza()
    const receipt = await kassza.receipts.create({
      prefix: 'NYGT',
      paymentMethod: 'készpénz',
      items: [{ name: 'Kávé', grossUnitPrice: 890, vat: 27 }],
    })
    const reversal = await kassza.receipts.reverse(receipt.number)

    await expect(
      kassza.receipts.convertToInvoice({ receiptNumber: reversal.number, buyer: BUYER }),
    ).rejects.toThrow(/sztornó nyugta/)
  })

  test('már sztornózott nyugtánál csak kifejezett engedéllyel folytatja', async () => {
    const kassza = createMockKassza()
    const receipt = await kassza.receipts.create({
      prefix: 'NYGT',
      paymentMethod: 'készpénz',
      items: [{ name: 'Kávé', grossUnitPrice: 890, vat: 27 }],
    })
    await kassza.receipts.reverse(receipt.number)

    await expect(
      kassza.receipts.convertToInvoice({ receiptNumber: receipt.number, buyer: BUYER }),
    ).rejects.toMatchObject({ category: 'validation' })
    const result = await kassza.receipts.convertToInvoice({
      receiptNumber: receipt.number,
      buyer: BUYER,
      allowAlreadyReversed: true,
      comment: 'Vevői kérésre.',
    })

    expect(result.reversal).toBeUndefined()
    expect(result.invoice.created).toBe(true)
    const comment = kassza.invoiceRecords.get(result.invoice.number)?.input?.comment
    expect(comment).toBe(
      `A(z) ${receipt.number} nyugta alapján kiállított számla (a nyugta sztornózva). Vevői kérésre.`,
    )
  })

  test('devizás nyugtánál átadja az árfolyamot', async () => {
    const kassza = createMockKassza()
    const receipt = sampleReceipt({ currency: 'EUR', exchangeRate: 395.5, exchangeBank: 'MNB' })
    const api = {
      receipts: {
        get: async () => receipt,
        reverse: async () => ({ ...receipt, type: 'reversal' as const, number: 'NYGT-2026-6' }),
      },
      invoices: kassza.invoices,
    }

    const result = await convertReceiptToInvoice(api, {
      receiptNumber: receipt.number,
      buyer: BUYER,
    })

    expect(kassza.invoiceRecords.get(result.invoice.number)?.input).toMatchObject({
      currency: 'EUR',
      exchangeRate: 395.5,
      exchangeBank: 'MNB',
    })
  })

  test('üres nyugtaszámnál validációs hibát dob', async () => {
    const kassza = createMockKassza()

    await expect(
      kassza.receipts.convertToInvoice({ receiptNumber: ' ', buyer: BUYER }),
    ).rejects.toThrow(/nyugta számát/)
  })
})
