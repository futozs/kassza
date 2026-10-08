import { describe, expect, test, vi } from 'vitest'
import { fakeKassza } from '../../tests/fake-agent'
import { SzamlazzError } from '../core/errors'
import { createMockKassza } from '../testing'
import type { CreateInvoiceInput } from './create-types'
import type { InvoiceDetails } from './get'
import { type PaymentOnceApi, paymentMarker, registerPaymentOnce } from './payment-once'

const INVOICE: CreateInvoiceInput = {
  orderNumber: 'PAY-ONCE-1',
  buyer: { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' },
  items: [{ name: 'Termék', grossUnitPrice: 12_700, vat: 27 }],
}

async function withInvoice() {
  const setup = fakeKassza()
  const invoice = await setup.kassza.invoices.create(INVOICE)
  return { ...setup, number: invoice.number }
}

describe('paymentMarker', () => {
  test('rövid, géppel olvasható jelölőt ad, és ellenőrzi a kulcsot', () => {
    expect(paymentMarker('BANK-123')).toBe('[kassza:BANK-123]')
    expect(paymentMarker('  a.b:c_d-1  ')).toBe('[kassza:a.b:c_d-1]')
    for (const bad of ['', '   ', 'van ]zárójel', 'x'.repeat(49), 'ékezet']) {
      expect(() => paymentMarker(bad)).toThrow(SzamlazzError)
    }
  })
})

describe('invoices.registerPaymentOnce', () => {
  test('egyszer rögzít, az ismételt hívás a meglévőt adja vissza', async () => {
    const { agent, kassza, number } = await withInvoice()

    const first = await kassza.invoices.registerPaymentOnce({
      invoiceNumber: number,
      key: 'BANK-1',
      amount: 12_700,
      description: 'Utalás',
    })
    const second = await kassza.invoices.registerPaymentOnce({
      invoiceNumber: number,
      key: 'BANK-1',
      amount: 12_700,
    })

    expect(first).toMatchObject({ created: true, key: 'BANK-1', marker: '[kassza:BANK-1]' })
    expect(first.existing?.comment).toBe('Utalás [kassza:BANK-1]')
    expect(second).toMatchObject({ created: false, existing: { amount: 12_700 } })
    expect(agent.invoices.get(number)?.payments).toHaveLength(1)
  })

  test('más kulccsal új befizetést rögzít (additív)', async () => {
    const { agent, kassza, number } = await withInvoice()
    await kassza.invoices.registerPaymentOnce({ invoiceNumber: number, key: 'A', amount: 5_000 })
    await kassza.invoices.registerPaymentOnce({ invoiceNumber: number, key: 'B', amount: 7_700 })
    expect(agent.invoices.get(number)?.payments.map((payment) => payment.amount)).toEqual([
      5_000, 7_700,
    ])
  })

  test('párhuzamos hívásokból is csak egy befizetés lesz', async () => {
    const { agent, kassza, number } = await withInvoice()
    const input = { invoiceNumber: number, key: 'PAR', amount: 1_000 }

    const results = await Promise.all([
      kassza.invoices.registerPaymentOnce(input),
      kassza.invoices.registerPaymentOnce(input),
      kassza.invoices.registerPaymentOnce(input),
    ])

    expect(results.filter((result) => result.created)).toHaveLength(1)
    expect(agent.invoices.get(number)?.payments).toHaveLength(1)
  })

  test('időtúllépés után visszakeresi, és nem rögzít duplán', async () => {
    const { agent, kassza, number } = await withInvoice()
    agent.fail('ghostSuccess', { action: 'registerPayment' })

    const result = await kassza.invoices.registerPaymentOnce(
      { invoiceNumber: number, key: 'GHOST', amount: 1_000 },
      { recoveryDelayMs: 0 },
    )

    expect(result.created).toBe(true)
    expect(agent.invoices.get(number)?.payments).toHaveLength(1)
  })

  test('ha a visszakeresés sem találja, a bizonytalan hibát adja tovább', async () => {
    const { agent, kassza, number } = await withInvoice()
    agent.fail('timeout', { action: 'registerPayment' })

    await expect(
      kassza.invoices.registerPaymentOnce(
        { invoiceNumber: number, key: 'LOST', amount: 1_000 },
        { recoveryDelayMs: 0 },
      ),
    ).rejects.toMatchObject({ category: 'timeout' })
  })

  test('biztos hibánál (ismeretlen számla) nem keres vissza', async () => {
    const { kassza } = fakeKassza()
    await expect(
      kassza.invoices.registerPaymentOnce({ invoiceNumber: 'NINCS-1', key: 'K', amount: 1 }),
    ).rejects.toBeInstanceOf(SzamlazzError)
  })

  test('ha a jelölő a lekérdezésben nem látszik, hangosan megáll, hogy ne legyen dupla rögzítés', async () => {
    const details = { payments: [] } as unknown as InvoiceDetails
    const api: PaymentOnceApi = {
      registerPayment: vi.fn(async () => ({ invoiceNumber: 'E-1' })),
      get: vi.fn(async () => details),
    }

    const error = await registerPaymentOnce(api, {
      invoiceNumber: 'E-1',
      key: 'K',
      amount: 1,
    }).catch((caught: unknown) => caught)

    expect(error).toMatchObject({
      category: 'unexpected_response',
      details: { registered: 'true', marker: '[kassza:K]' },
    })
    expect((error as SzamlazzError).hint).toContain('NE hívd újra')
    expect(api.registerPayment).toHaveBeenCalledOnce()
  })

  test('érvénytelen bemenetre validációs hibát dob, kérés nélkül', async () => {
    const { agent, kassza, number } = await withInvoice()
    const before = agent.requests.length
    for (const input of [
      { invoiceNumber: '', key: 'K', amount: 1 },
      { invoiceNumber: number, key: 'K', amount: 0 },
      { invoiceNumber: number, key: 'K', amount: Number.NaN },
      { invoiceNumber: number, key: 'rossz kulcs', amount: 1 },
    ]) {
      await expect(kassza.invoices.registerPaymentOnce(input)).rejects.toMatchObject({
        category: 'validation',
      })
    }
    expect(agent.requests.length).toBe(before)
  })

  test('a mock kassza is támogatja', async () => {
    const kassza = createMockKassza()
    const invoice = await kassza.invoices.create(INVOICE)
    const input = { invoiceNumber: invoice.number, key: 'M', amount: 100 }

    expect((await kassza.invoices.registerPaymentOnce(input)).created).toBe(true)
    expect((await kassza.invoices.registerPaymentOnce(input)).created).toBe(false)
  })
})
