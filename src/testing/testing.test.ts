import { describe, expect, test } from 'vitest'
import { SzamlazzError } from '../core/errors'
import { createMockKassza, MOCK_PDF } from './index'

const BUYER = { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' }
const NOW = (): Date => new Date('2026-09-16T10:00:00Z')

describe('createMockKassza', () => {
  test('díjbekérő, befizetés, számla, sztornó teljes folyamat valós összegekkel', async () => {
    const kassza = createMockKassza({ now: NOW })

    const proforma = await kassza.invoices.create({
      type: 'proforma',
      orderNumber: 'NEV-1',
      buyer: BUYER,
      items: [{ name: 'Nevezési díj', grossUnitPrice: 26_000, vat: 27 }],
    })
    const invoice = await kassza.invoices.create({
      orderNumber: 'NEV-1',
      proformaNumber: proforma.number,
      buyer: BUYER,
      items: [{ name: 'Nevezési díj', grossUnitPrice: 26_000, vat: 27 }],
    })
    const payment = await kassza.invoices.registerPayment({
      invoiceNumber: invoice.number,
      amount: 26_000,
    })
    const reversal = await kassza.invoices.reverse(invoice.number)
    const details = await kassza.invoices.get({ orderNumber: 'NEV-1' }, { includePdf: true })

    expect(proforma).toMatchObject({ number: 'D-KASSZA-2026-1', grossTotal: 26_000, pdf: MOCK_PDF })
    expect(invoice).toMatchObject({
      number: 'E-KASSZA-2026-1',
      netTotal: 20_472,
      grossTotal: 26_000,
    })
    expect(payment).toMatchObject({ invoiceNumber: invoice.number, outstanding: 0 })
    expect(reversal).toMatchObject({ number: 'E-STORNO-2026-1', grossTotal: -26_000 })
    expect(details.header).toMatchObject({
      number: invoice.number,
      reversed: true,
      type: 'invoice',
    })
    expect(details.payments).toEqual([{ date: '2026-09-16', method: 'átutalás', amount: 26_000 }])
    expect(details.pdf).toBe(MOCK_PDF)
    expect(kassza.calls.map((call) => call.method)).toEqual([
      'invoices.create',
      'invoices.create',
      'invoices.registerPayment',
      'invoices.reverse',
      'invoices.get',
    ])
  })

  test('ugyanazt a kliensoldali validációt futtatja, mint az éles kliens', async () => {
    const kassza = createMockKassza()

    await expect(kassza.invoices.create({ buyer: BUYER, items: [] })).rejects.toMatchObject({
      category: 'validation',
    })
    await expect(
      kassza.receipts.create({
        prefix: 'kisbetu',
        paymentMethod: 'kp',
        items: [{ name: 'A', grossUnitPrice: 1, vat: 27 }],
      }),
    ).rejects.toMatchObject({ category: 'validation' })
  })

  test('a find és a getPdf a nem létező bizonylatot a valódi hibakódokkal kezeli', async () => {
    const kassza = createMockKassza()

    await expect(kassza.invoices.find('E-NINCS')).resolves.toBeNull()
    await expect(kassza.invoices.getPdf({ externalId: 'x' })).rejects.toMatchObject({
      code: 7,
      isNotFound: true,
    })
    await expect(kassza.receipts.find({ orderNumber: 'nincs' })).resolves.toBeNull()
    await expect(kassza.invoices.deleteProforma({ orderNumber: 'nincs' })).rejects.toMatchObject({
      code: 335,
    })
  })

  test('díjbekérő törlése után a díjbekérő nem kérdezhető le', async () => {
    const kassza = createMockKassza()
    const proforma = await kassza.invoices.create({
      type: 'proforma',
      orderNumber: 'R-9',
      externalId: 'ext-9',
      downloadPdf: false,
      buyer: BUYER,
      items: [{ name: 'A', netUnitPrice: 100, vat: 27 }],
    })

    await kassza.invoices.deleteProforma({ proformaNumber: proforma.number })

    expect(proforma.pdf).toBeUndefined()
    await expect(kassza.invoices.find({ externalId: 'ext-9' })).resolves.toBeNull()
  })

  test('befizetések felülírása és törlése, előnézet és PDF lekérés', async () => {
    const kassza = createMockKassza({ now: NOW })
    const invoice = await kassza.invoices.create({
      paid: true,
      buyer: BUYER,
      items: [{ name: 'A', quantity: 3, netUnitPrice: 500, vat: 27 }],
    })

    const partial = await kassza.invoices.registerPayment({
      invoiceNumber: invoice.number,
      additive: false,
      payments: [{ method: 'kp', amount: 905, date: '2026-09-01', description: 'előleg' }],
    })
    const cleared = await kassza.invoices.clearPayments({ invoiceNumber: invoice.number })
    const preview = await kassza.invoices.preview({
      buyer: BUYER,
      items: [{ name: 'A', netUnitPrice: 500, vat: 27 }],
    })
    const pdf = await kassza.invoices.getPdf({ invoiceNumber: invoice.number })

    expect(invoice).toMatchObject({ outstanding: 0, grossTotal: 1905 })
    expect(partial.outstanding).toBe(1000)
    expect(cleared.outstanding).toBe(1905)
    expect(preview).toMatchObject({ grossTotal: 635, pdf: MOCK_PDF })
    expect(pdf).toMatchObject({ number: invoice.number, grossTotal: 1905 })
  })

  test('nyugta létrehozás, lekérdezés, kiküldés és sztornó', async () => {
    const kassza = createMockKassza({
      now: NOW,
      defaults: { receipt: { prefix: 'NYT', paymentMethod: 'kártya' } },
    })

    const receipt = await kassza.receipts.create({
      callId: 'rendeles-1',
      orderNumber: 'R-1',
      items: [{ name: 'Kávé', grossUnitPrice: 1000, vat: 27 }],
    })
    await kassza.receipts.send({ receiptNumber: receipt.number, emails: 'a@b.hu; c@d.hu' })
    await kassza.receipts.send({ receiptNumber: receipt.number, emails: ['e@f.hu'] })
    const reversal = await kassza.receipts.reverse({ receiptNumber: receipt.number })
    const fetched = await kassza.receipts.get({ receiptNumber: receipt.number, downloadPdf: false })
    const byOrder = await kassza.receipts.get({ orderNumber: 'R-1' })

    expect(receipt).toMatchObject({
      number: 'NYT-2026-1',
      paymentMethod: 'kártya',
      totals: { netAmount: 787.4, vatAmount: 212.6, grossAmount: 1000 },
      pdf: MOCK_PDF,
    })
    expect(kassza.receiptRecords.get(receipt.number)?.sentTo).toEqual([
      ['a@b.hu', 'c@d.hu'],
      ['e@f.hu'],
    ])
    expect(reversal).toMatchObject({ type: 'reversal', reversedReceiptNumber: receipt.number })
    expect(fetched).toMatchObject({ isReversed: true })
    expect(fetched.pdf).toBeUndefined()
    expect(byOrder.pdf).toBe(MOCK_PDF)
    await expect(
      kassza.receipts.create({
        callId: 'rendeles-1',
        items: [{ name: 'Kávé', grossUnitPrice: 1000, vat: 27 }],
      }),
    ).rejects.toMatchObject({ code: 338, isDuplicate: true })
  })

  test('failNext a következő hívást hibára futtatja, a reset mindent kiürít', async () => {
    const kassza = createMockKassza({ credentialsValid: false })
    const custom = new SzamlazzError('[136] Lejárt előfizetés', { category: 'account', code: 136 })

    kassza.failNext('invoices.create')
    await expect(
      kassza.invoices.create({ buyer: BUYER, items: [{ name: 'A', netUnitPrice: 1, vat: 27 }] }),
    ).rejects.toMatchObject({
      category: 'network',
    })
    kassza.failNext('taxpayer.query', custom)
    await expect(kassza.taxpayer.query('13421739')).rejects.toBe(custom)
    await expect(kassza.verifyCredentials()).resolves.toBe(false)
    await kassza.invoices.create({ buyer: BUYER, items: [{ name: 'A', netUnitPrice: 1, vat: 27 }] })

    kassza.reset()
    await kassza.resetSession()

    expect(kassza.calls.map((call) => call.method)).toEqual(['resetSession'])
    expect(kassza.invoiceRecords.size).toBe(0)
  })

  test('az adószám lekérdezés a megadott adózókból dolgozik', async () => {
    const kassza = createMockKassza({
      taxpayers: { '13421739': { valid: true, name: 'KBOSS.HU KFT.', addresses: [] } },
    })

    await expect(kassza.taxpayer.query('13421739-2-41')).resolves.toMatchObject({ valid: true })
    await expect(kassza.taxpayer.query('12345678')).resolves.toEqual({
      valid: false,
      addresses: [],
    })
  })
})
