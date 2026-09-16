import { describe, expect, test } from 'vitest'
import { createKassza, isSzamlazzError, type Kassza } from '../src/index'
import { isSzamlazzIp } from '../src/ipn/index'
import { calculateInvoiceItem, calculateReceiptItem } from '../src/money/index'
import { invoicePdfKey, memoryStorage, s3FetchStorage, storePdf } from '../src/storage/index'
import { createMockKassza } from '../src/testing/index'
import {
  isValidHungarianBankAccount,
  isValidHungarianTaxNumber,
  parseHungarianAddress,
} from '../src/validators/index'

const buyer = {
  name: 'Vevő Kft.',
  zip: '1111',
  city: 'Budapest',
  address: 'Fő utca 1.',
  email: 'vevo@ceg.hu',
}
const items = [{ name: 'Póló', quantity: 2, grossUnitPrice: 5_990, vat: 27 as const }]

describe('README példák', () => {
  test('beállítás alapértékekkel és hookokkal típushelyes', () => {
    const logger = { info: (_: unknown) => undefined, warn: (_: unknown) => undefined }
    const kassza: Kassza = createKassza({
      agentKey: 'tesztkulcs',
      timeoutMs: 30_000,
      maxAttempts: 3,
      defaults: {
        invoice: {
          prefix: 'WEB',
          paymentDueInDays: 8,
          seller: { emailReplyTo: 'penzugy@ceg.hu', emailSubject: 'Elkészült a számlád' },
        },
        receipt: { prefix: 'NYGT', paymentMethod: 'bankkártya' },
      },
      hooks: {
        onResponse: ({ action, status, durationMs }) => logger.info({ action, status, durationMs }),
        onError: ({ action, error, willRetry }) =>
          logger.warn({ action, code: error.code, willRetry }),
      },
    })

    expect(kassza.invoices.create).toBeTypeOf('function')
  })

  test('minden számla-művelet lefut', async () => {
    const kassza = createMockKassza()

    const szamla = await kassza.invoices.create({
      orderNumber: 'REND-1001',
      paymentMethod: 'bankkártya',
      paid: true,
      buyer: { ...buyer, taxNumber: '12345678-2-42' },
      items: [
        { name: 'Póló', quantity: 2, grossUnitPrice: 5_990, vat: 27 },
        { name: 'Szállítás', grossUnitPrice: 1_490, vat: 27 },
      ],
    })
    expect(szamla.grossTotal).toBe(13_470)

    await kassza.invoices.create({
      buyer,
      items: [
        { name: 'Tanácsadás', netUnitPrice: 20_000, vat: 27 },
        { name: 'Belépő', grossUnitPrice: 4_990, vat: 27 },
        { name: 'Könyv', grossUnitPrice: 3_500, vat: 5 },
        { name: 'Oktatás', netUnitPrice: 50_000, vat: 'AAM' },
      ],
    })

    const dijbekero = await kassza.invoices.create({
      type: 'proforma',
      orderNumber: 'NEV-42',
      buyer,
      items,
    })
    await kassza.invoices.create({
      proformaNumber: dijbekero.number,
      orderNumber: 'NEV-42',
      paid: true,
      buyer,
      items,
    })
    await kassza.invoices.deleteProforma({ orderNumber: 'NEV-42' })

    const eloleg = await kassza.invoices.create({
      type: 'advance',
      orderNumber: 'PROJ-7',
      buyer,
      items: [{ name: 'Előleg', netUnitPrice: 300_000, vat: 27 }],
    })
    await kassza.invoices.create({
      type: 'final',
      advanceInvoiceNumber: eloleg.number,
      orderNumber: 'PROJ-7',
      buyer,
      items: [
        { name: 'Weboldal', netUnitPrice: 1_000_000, vat: 27 },
        { name: 'Előleg levonása', quantity: -1, netUnitPrice: 300_000, vat: 27 },
      ],
    })
    await kassza.invoices.create({
      type: 'corrective',
      correctedInvoiceNumber: szamla.number,
      buyer,
      items: [{ name: 'Póló visszáru', quantity: -1, grossUnitPrice: 5_990, vat: 27 }],
    })
    await kassza.invoices.create({ type: 'deliveryNote', buyer, items })
    await kassza.invoices.create({
      currency: 'EUR',
      language: 'en',
      buyer: {
        name: 'Acme GmbH',
        country: 'Germany',
        zip: '10115',
        city: 'Berlin',
        address: 'Hauptstr. 1',
        euTaxNumber: 'DE123456789',
        taxpayerType: 'euBusiness',
      },
      items: [{ name: 'Consulting', quantity: 8, unit: 'hour', netUnitPrice: 95, vat: 'EUFAD37' }],
    })
    const { pdf, grossTotal } = await kassza.invoices.preview({ buyer, items })
    expect(pdf).toBeInstanceOf(Uint8Array)
    expect(grossTotal).toBe(11_980)

    await kassza.invoices.create({
      buyer,
      items,
      attachments: [{ filename: 'aszf.pdf', content: pdf, contentType: 'application/pdf' }],
    })

    await kassza.invoices.registerPayment({ invoiceNumber: szamla.number, amount: 12_700 })
    await kassza.invoices.registerPayment({
      invoiceNumber: szamla.number,
      payments: [
        { method: 'készpénz', amount: 5_000, date: '2026-09-01' },
        { method: 'átutalás', amount: 7_700 },
      ],
    })
    await kassza.invoices.clearPayments(szamla.number)

    const pdfResult = await kassza.invoices.getPdf(szamla.number, {
      signal: AbortSignal.timeout(5_000),
    })
    expect(pdfResult.pdf).toBeInstanceOf(Uint8Array)
    await kassza.invoices.getPdf({ orderNumber: 'REND-1001' })

    const adatok = await kassza.invoices.get({ orderNumber: 'REND-1001' })
    expect(adatok.buyer.name).toBe('Vevő Kft.')
    expect(adatok.header.issueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    await expect(kassza.invoices.find({ orderNumber: 'REND-9999' })).resolves.toBeNull()

    const sztorno = await kassza.invoices.reverse(szamla.number)
    expect(sztorno.number).toBeTruthy()
    await expect(kassza.verifyCredentials()).resolves.toBe(true)
    await kassza.resetSession()
  })

  test('minden nyugta-művelet és az adószám lekérdezés lefut', async () => {
    const kassza = createMockKassza()

    const nyugta = await kassza.receipts.create({
      prefix: 'NYGT',
      paymentMethod: 'készpénz',
      callId: 'KASSZA-2026-0001',
      orderNumber: 'REND-1001',
      items: [
        { name: 'Kávé', quantity: 2, grossUnitPrice: 890, vat: 27 },
        { name: 'Kifli', grossUnitPrice: 250, vat: 5 },
      ],
    })
    expect(nyugta.totals.grossAmount).toBe(2_030)

    await kassza.receipts.send({ receiptNumber: nyugta.number, emails: 'vevo@ceg.hu' })
    await expect(kassza.receipts.get(nyugta.number)).resolves.toMatchObject({
      number: nyugta.number,
    })
    await expect(kassza.receipts.find({ orderNumber: 'REND-1001' })).resolves.not.toBeNull()
    await kassza.receipts.reverse(nyugta.number)

    const ceg = await kassza.taxpayer.query('13421739')
    expect(ceg.valid).toBe(false)
  })

  test('a hibakezelési példa a duplikált rendelésszámot visszakeresi', async () => {
    const kassza = createMockKassza()
    const input = { orderNumber: 'REND-1', buyer, items }
    await kassza.invoices.create(input)
    kassza.failNext(
      'invoices.create',
      new (await import('../src/core/errors')).SzamlazzError('[152] Már létező rendelésszám', {
        category: 'duplicate',
        code: 152,
      }),
    )

    const handle = async () => {
      try {
        return await kassza.invoices.create(input)
      } catch (error) {
        if (!isSzamlazzError(error)) throw error
        if (error.isDuplicate) return kassza.invoices.find({ orderNumber: input.orderNumber })
        throw error
      }
    }

    await expect(handle()).resolves.toMatchObject({ header: { orderNumber: 'REND-1' } })
  })

  test('tárhely, IPN IP, validátor és pénz példák a README szerinti eredményt adják', async () => {
    const kassza = createMockKassza()
    const szamla = await kassza.invoices.create({ buyer, items })
    const tarhely = memoryStorage()
    const fajl = await storePdf(
      tarhely,
      invoicePdfKey({ number: szamla.number, date: '2026-09-16' }),
      szamla.pdf ?? new Uint8Array(),
    )

    expect(fajl.key).toBe(`szamlak/2026/09/${szamla.number}.pdf`)
    expect(
      s3FetchStorage({
        bucket: 'szamlak',
        region: 'auto',
        endpoint: 'https://account-id.r2.cloudflarestorage.com',
        accessKeyId: 'id',
        secretAccessKey: 'secret',
      }).put,
    ).toBeTypeOf('function')
    expect(isSzamlazzIp('3.73.214.98')).toBe(true)
    expect(isValidHungarianTaxNumber('13421739-2-41')).toBe(true)
    expect(isValidHungarianBankAccount('11773016-11111018')).toBe(true)
    expect(parseHungarianAddress('1031 Budapest, Záhony utca 7.')).toMatchObject({
      zip: '1031',
      city: 'Budapest',
      address: 'Záhony utca 7.',
    })
    expect(calculateInvoiceItem({ quantity: 3, grossUnitPrice: 500, vat: 27 })).toMatchObject({
      netAmount: 1181,
      vatAmount: 319,
      grossAmount: 1500,
    })
    expect(calculateReceiptItem({ grossUnitPrice: 1_000, vat: 27 })).toMatchObject({
      netAmount: 787.4,
      vatAmount: 212.6,
      grossAmount: 1000,
    })
  })
})
