import { describe, expect, test } from 'vitest'
import { isSzamlazzError, type Kassza } from '../src/index'
import { ipnOkResponse, readIpnNotification } from '../src/ipn/index'
import { invoicePdfKey, memoryStorage, storePdf } from '../src/storage/index'
import { createMockKassza } from '../src/testing/index'
import { parseHungarianTaxNumber } from '../src/validators/index'

const buyer = {
  name: 'Vevő Kft.',
  zip: '1111',
  city: 'Budapest',
  address: 'Fő utca 1.',
  email: 'vevo@example.hu',
}

async function invoiceOrder(order: { id: number; total: number }, kassza: Kassza): Promise<string> {
  const orderNumber = `ORDER-${order.id}`
  const existing = await kassza.invoices.find({ orderNumber })
  if (existing) return existing.header.number
  try {
    const invoice = await kassza.invoices.create({
      orderNumber,
      paid: true,
      paymentMethod: 'bankkártya',
      buyer,
      items: [{ name: 'Termék', quantity: 1, grossUnitPrice: order.total, vat: 27 }],
    })
    return invoice.number
  } catch (error) {
    if (
      isSzamlazzError(error) &&
      ['network', 'timeout', 'partial_success', 'duplicate'].includes(error.category)
    ) {
      const created = await kassza.invoices.find({ orderNumber })
      if (created) return created.header.number
    }
    throw error
  }
}

describe('README és agents/ példák', () => {
  test('számla 10 sorban', async () => {
    const kassza = createMockKassza()

    const szamla = await kassza.invoices.create({
      buyer,
      items: [{ name: 'Webfejlesztés', quantity: 10, unit: 'óra', netUnitPrice: 15_000, vat: 27 }],
    })

    expect(szamla).toMatchObject({ grossTotal: 190_500 })
    expect(szamla.pdf).toBeInstanceOf(Uint8Array)
  })

  test('nyugta és kiküldés', async () => {
    const kassza = createMockKassza()

    const nyugta = await kassza.receipts.create({
      prefix: 'NYGT',
      paymentMethod: 'bankkártya',
      items: [{ name: 'Kávé', grossUnitPrice: 890, vat: 27 }],
    })
    await kassza.receipts.send({ receiptNumber: nyugta.number, emails: 'vevo@example.hu' })

    expect(nyugta.totals.grossAmount).toBe(890)
  })

  test('díjbekérő, számla, befizetés', async () => {
    const kassza = createMockKassza()
    const items = [{ name: 'Nevezési díj', grossUnitPrice: 26_000, vat: 27 as const }]

    const dijbekero = await kassza.invoices.create({
      type: 'proforma',
      orderNumber: 'REND-42',
      buyer,
      items,
    })
    const szamla = await kassza.invoices.create({
      proformaNumber: dijbekero.number,
      orderNumber: 'REND-42',
      buyer,
      items,
    })
    const befizetes = await kassza.invoices.registerPayment({
      invoiceNumber: szamla.number,
      amount: szamla.grossTotal,
    })

    expect(befizetes.outstanding).toBe(0)
  })

  test('idempotens webhook recept: egyszer számláz, és hálózati hibát nem nyel el', async () => {
    const kassza = createMockKassza()

    const first = await invoiceOrder({ id: 1, total: 12_700 }, kassza)
    const second = await invoiceOrder({ id: 1, total: 12_700 }, kassza)
    kassza.failNext('invoices.create')

    expect(second).toBe(first)
    expect(kassza.calls.filter((call) => call.method === 'invoices.create')).toHaveLength(1)
    await expect(invoiceOrder({ id: 2, total: 100 }, kassza)).rejects.toMatchObject({
      category: 'network',
    })
  })

  test('IPN webhook recept', async () => {
    const request = new Request('https://shop.example/api/szamlazz-ipn', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'szlahu_szamlaszam=E-2026-1&szlahu_rendelesszam=REND-42&szlahu_bruttovegosszeg=26000&szlahu_kifizetettbrutto=26000',
    })

    const ipn = await readIpnNotification(request)

    expect(ipn).toMatchObject({
      invoiceNumber: 'E-2026-1',
      orderNumber: 'REND-42',
      isFullyPaid: true,
    })
    expect(ipnOkResponse().status).toBe(200)
  })

  test('PDF mentése tárhelyre recept', async () => {
    const kassza = createMockKassza()
    const storage = memoryStorage()

    const invoice = await kassza.invoices.create({
      buyer,
      items: [{ name: 'A', netUnitPrice: 1, vat: 27 }],
    })
    const stored = invoice.pdf
      ? await storePdf(storage, invoicePdfKey({ number: invoice.number }), invoice.pdf)
      : undefined

    expect(stored?.key).toContain(invoice.number)
  })

  test('vevő kitöltése adószámból recept', async () => {
    const kassza = createMockKassza({
      taxpayers: {
        '13421739': {
          valid: true,
          name: 'KBOSS.HU KFT.',
          taxNumber: {
            taxpayerId: '13421739',
            vatCode: '2',
            countyCode: '41',
            formatted: '13421739-2-41',
          },
          addresses: [],
        },
      },
    })

    const company = await kassza.taxpayer.query('13421739-2-41')

    expect(parseHungarianTaxNumber('13421739-2-41')).toBeDefined()
    expect(company).toMatchObject({ valid: true, name: 'KBOSS.HU KFT.' })
  })
})
