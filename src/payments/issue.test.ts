import { describe, expect, test, vi } from 'vitest'
import { SzamlazzError } from '../core/errors'
import type { InvoiceBuyer } from '../invoices/create-types'
import { createMockKassza } from '../testing'
import { buyerFromCustomer, issueForPayment, paymentOrderNumber } from './issue'
import type { PaymentCustomer, PaymentEvent } from './types'

const now = (): Date => new Date('2026-10-02T10:00:00Z')

function mockKassza(): ReturnType<typeof createMockKassza> {
  return createMockKassza({ now, defaults: { receipt: { prefix: 'NYGT' } } })
}

const BUYER: InvoiceBuyer = {
  name: 'Példa Kft.',
  zip: '1111',
  city: 'Budapest',
  address: 'Fő utca 1.',
  taxNumber: '12345678-2-42',
}

const COMPANY_CUSTOMER: PaymentCustomer = {
  name: 'Példa Kft.',
  email: 'penzugy@pelda.hu',
  taxNumber: '12345678-2-42',
  address: { country: 'HU', zip: '1111', city: 'Budapest', line1: 'Fő utca 1.' },
}

function paid(overrides: Partial<PaymentEvent> = {}): PaymentEvent {
  return {
    provider: 'stripe',
    kind: 'paid',
    id: 'pi_123',
    amount: { value: 2540, currency: 'HUF' },
    method: 'bankkártya',
    raw: {},
    ...overrides,
  }
}

function refunded(overrides: Partial<PaymentEvent> = {}): PaymentEvent {
  return paid({ kind: 'refunded', ...overrides })
}

function networkError(): SzamlazzError {
  return new SzamlazzError('Hálózati hiba a Számlázz.hu elérésekor.', { category: 'network' })
}

describe('paymentOrderNumber', () => {
  test('a szolgáltató nagybetűs nevéből és az azonosítóból áll', () => {
    expect(paymentOrderNumber(paid())).toBe('STRIPE-pi_123')
    expect(paymentOrderNumber(paid({ provider: 'simplepay', id: '501180380' }))).toBe(
      'SIMPLEPAY-501180380',
    )
    expect(paymentOrderNumber(paid({ provider: 'terminal', id: '42' }))).toBe('TERMINAL-42')
  })
})

describe('buyerFromCustomer', () => {
  test('teljes címből vevőt készít, magyar címnél nem ír országot', () => {
    expect(
      buyerFromCustomer({
        name: ' Kovács Éva ',
        email: ' eva@example.hu ',
        address: {
          country: 'HU',
          zip: '1111',
          city: 'Budapest',
          line1: 'Fő utca 1.',
          line2: '2/3',
        },
      }),
    ).toEqual({
      name: 'Kovács Éva',
      zip: '1111',
      city: 'Budapest',
      address: 'Fő utca 1., 2/3',
      country: undefined,
      email: 'eva@example.hu',
      taxNumber: undefined,
      euTaxNumber: undefined,
    })
  })

  test('külföldi országkódot magyar országnévre fordít', () => {
    expect(
      buyerFromCustomer({
        name: 'Max Muster',
        address: { country: 'at', zip: '1010', city: 'Wien', line1: 'Ring 1' },
      })?.country,
    ).toBe('Ausztria')
  })

  test('ha a futtatókörnyezetben nincs magyar régiónév-adat, az országkódot hagyja', async () => {
    const original = Intl.DisplayNames
    vi.resetModules()
    Object.defineProperty(Intl, 'DisplayNames', {
      configurable: true,
      value: class {
        constructor() {
          throw new RangeError('Incorrect locale information provided')
        }
      },
    })
    try {
      const fresh = await import('./issue')
      expect(
        fresh.buyerFromCustomer({
          name: 'Max Muster',
          address: { country: 'at', zip: '1010', city: 'Wien', line1: 'Ring 1' },
        })?.country,
      ).toBe('at')
    } finally {
      Object.defineProperty(Intl, 'DisplayNames', { configurable: true, value: original })
    }
  })

  test('a nem kétbetűs országot változatlanul hagyja', () => {
    expect(
      buyerFromCustomer({
        name: 'Max Muster',
        address: { country: 'Österreich', zip: '1010', city: 'Wien', line1: 'Ring 1' },
      })?.country,
    ).toBe('Österreich')
  })

  test('hiányos névnél vagy címnél undefined-ot ad', () => {
    expect(buyerFromCustomer(undefined)).toBeUndefined()
    expect(buyerFromCustomer({ name: 'Kovács Éva' })).toBeUndefined()
    expect(
      buyerFromCustomer({ name: 'Kovács Éva', address: { zip: '1111', city: 'Budapest' } }),
    ).toBeUndefined()
  })
})

describe('issueForPayment: sikeres fizetés', () => {
  test('magánszemély kis összegű fizetéséről nyugtát ad, egyszer', async () => {
    const kassza = mockKassza()

    const first = await kassza.issueForPayment(paid(), { vat: 27 })
    const second = await kassza.issueForPayment(paid(), { vat: 27 })

    expect(first).toMatchObject({ kind: 'receipt', orderNumber: 'STRIPE-pi_123', created: true })
    expect(second).toMatchObject({ kind: 'receipt', created: false })
    if (first.kind !== 'receipt' || second.kind !== 'receipt') throw new Error('nyugta várt')
    expect(second.number).toBe(first.number)
    expect(first.decision.type).toBe('receipt')
    expect(first.receipt).toMatchObject({
      callId: 'STRIPE-pi_123',
      orderNumber: 'STRIPE-pi_123',
      paymentMethod: 'bankkártya',
      currency: 'HUF',
    })
    expect(first.receipt.items).toEqual([
      expect.objectContaining({ name: 'Termék vagy szolgáltatás', grossAmount: 2540, vat: 27 }),
    ])
    expect(kassza.calls.filter((call) => call.method === 'receipts.create')).toHaveLength(1)
  })

  test('a fizetés tételeit áfakulccsal együtt átveszi', async () => {
    const kassza = mockKassza()
    const result = await kassza.issueForPayment(
      paid({
        amount: { value: 2030, currency: 'HUF' },
        items: [
          { name: 'Kávé', quantity: 2, totalGross: 1780, vatPercent: 27, sku: 'KAVE' },
          { name: 'Kifli', quantity: 1, totalGross: 250, vatPercent: 5, unit: 'db' },
        ],
      }),
    )
    if (result.kind !== 'receipt') throw new Error('nyugta várt')
    expect(result.receipt.items).toEqual([
      expect.objectContaining({ name: 'Kávé', quantity: 2, grossAmount: 1780, vat: 27 }),
      expect.objectContaining({ name: 'Kifli', quantity: 1, grossAmount: 250, vat: 5 }),
    ])
  })

  test('nem osztható tételösszegnél is pontosan a fizetett összeget adja', async () => {
    const kassza = mockKassza()
    const result = await kassza.issueForPayment(
      paid({
        amount: { value: 1000, currency: 'HUF' },
        items: [{ name: 'Csomag', quantity: 3, totalGross: 1000 }],
      }),
      { vat: 27 },
    )
    if (result.kind !== 'receipt') throw new Error('nyugta várt')
    expect(result.receipt.totals.grossAmount).toBe(1000)
  })

  test('a vatFor felülírja a tétel saját áfakulcsát', async () => {
    const kassza = mockKassza()
    const result = await kassza.issueForPayment(
      paid({ items: [{ name: 'Könyv', quantity: 1, totalGross: 2540, vatPercent: 27 }] }),
      { vatFor: () => 5 },
    )
    if (result.kind !== 'receipt') throw new Error('nyugta várt')
    expect(result.receipt.items[0]?.vat).toBe(5)
  })

  test('az items opció elsőbbséget élvez a fizetés tételeivel szemben', async () => {
    const kassza = mockKassza()
    const result = await kassza.issueForPayment(
      paid({ items: [{ name: 'Szolgáltatótól', quantity: 1, totalGross: 2540 }] }),
      { items: [{ name: 'Saját rendelésből', grossUnitPrice: 2540, vat: 18 }] },
    )
    if (result.kind !== 'receipt') throw new Error('nyugta várt')
    expect(result.receipt.items[0]).toMatchObject({ name: 'Saját rendelésből', vat: 18 })
  })

  test('ismeretlen áfakulcsú tételnél validációs hibát dob', async () => {
    const kassza = mockKassza()
    await expect(
      kassza.issueForPayment(
        paid({ items: [{ name: 'Bor', quantity: 1, totalGross: 2540, vatPercent: 33 }] }),
      ),
    ).rejects.toMatchObject({ category: 'validation' })
  })

  test('áfakulcs nélkül validációs hibát dob, és nem hív Számlázz.hu-t', async () => {
    const kassza = mockKassza()
    await expect(kassza.issueForPayment(paid())).rejects.toMatchObject({
      category: 'validation',
      hint: expect.stringContaining('vat'),
    })
    expect(kassza.calls.map((call) => call.method)).toEqual(['issueForPayment'])
  })

  test('nem pozitív mennyiségű tételre validációs hibát dob', async () => {
    const kassza = mockKassza()
    await expect(
      kassza.issueForPayment(paid({ items: [{ name: 'Hibás', quantity: 0, totalGross: 2540 }] }), {
        vat: 27,
      }),
    ).rejects.toMatchObject({ category: 'validation' })
  })

  test('összeg és tétel nélkül validációs hibát dob', async () => {
    const kassza = mockKassza()
    await expect(
      kassza.issueForPayment(paid({ amount: undefined }), { vat: 27 }),
    ).rejects.toMatchObject({ category: 'validation' })
  })

  test('összeg nélkül a megadott tételekből és pénznemből dolgozik', async () => {
    const kassza = mockKassza()
    const result = await kassza.issueForPayment(paid({ amount: undefined }), {
      items: [{ name: 'Belépő', grossUnitPrice: 10, vat: 27 }],
      currency: 'EUR',
      exchangeRate: 400,
    })
    if (result.kind !== 'receipt') throw new Error('nyugta várt')
    expect(result.receipt).toMatchObject({ currency: 'EUR' })
  })

  test('eltérő tételösszegnél validációs hibát dob, kivéve allowAmountMismatch mellett', async () => {
    const kassza = mockKassza()
    const items = [{ name: 'Termék', grossUnitPrice: 2000, vat: 27 as const }]
    await expect(kassza.issueForPayment(paid(), { items })).rejects.toMatchObject({
      category: 'validation',
      message: expect.stringContaining('eltér'),
    })
    await expect(
      kassza.issueForPayment(paid(), { items, allowAmountMismatch: true }),
    ).resolves.toMatchObject({ kind: 'receipt', created: true })
  })

  test('0 Ft-os fizetésről nem készít bizonylatot', async () => {
    const kassza = mockKassza()
    await expect(
      kassza.issueForPayment(paid({ amount: { value: 0, currency: 'HUF' } }), { vat: 27 }),
    ).resolves.toMatchObject({ kind: 'skipped', reason: expect.stringContaining('0') })
  })

  test('negatív vagy nem véges összegre validációs hibát dob', async () => {
    const kassza = mockKassza()
    for (const value of [-1, Number.NaN]) {
      await expect(
        kassza.issueForPayment(paid({ amount: { value, currency: 'HUF' } }), { vat: 27 }),
      ).rejects.toMatchObject({ category: 'validation' })
    }
  })

  test('adószámos vevőnek számlát állít ki, egyszer', async () => {
    const kassza = mockKassza()
    const payment = paid({ customer: COMPANY_CUSTOMER })

    const first = await kassza.issueForPayment(payment, { vat: 27 })
    const second = await kassza.issueForPayment(payment, { vat: 27 })

    expect(first).toMatchObject({ kind: 'invoice', created: true, orderNumber: 'STRIPE-pi_123' })
    expect(second).toMatchObject({ kind: 'invoice', created: false })
    if (first.kind !== 'invoice') throw new Error('számla várt')
    const record = kassza.invoiceRecords.get(first.number)
    expect(record?.input).toMatchObject({
      externalId: 'STRIPE-pi_123',
      orderNumber: 'STRIPE-pi_123',
      paid: true,
      paymentMethod: 'bankkártya',
      buyer: expect.objectContaining({ name: 'Példa Kft.', taxNumber: '12345678-2-42' }),
    })
    expect(kassza.calls.filter((call) => call.method === 'invoices.create')).toHaveLength(1)
  })

  test('adószámos vevőnél cím nélkül validációs hibát dob', async () => {
    const kassza = mockKassza()
    await expect(
      kassza.issueForPayment(
        paid({ customer: { name: 'Példa Kft.', taxNumber: '12345678-2-42' } }),
        {
          vat: 27,
        },
      ),
    ).rejects.toMatchObject({ category: 'validation', hint: expect.stringContaining('buyer') })
  })

  test('900 000 Ft-tól számlát állít ki', async () => {
    const kassza = mockKassza()
    const result = await kassza.issueForPayment(
      paid({ amount: { value: 900_000, currency: 'HUF' } }),
      { vat: 27, buyer: BUYER },
    )
    expect(result).toMatchObject({ kind: 'invoice', created: true })
  })

  test('számlakérésnél, cégnél és customer.isBusiness jelzésnél számlát ad', async () => {
    const consumer = { ...BUYER, taxNumber: undefined }
    for (const options of [{ invoiceRequested: true }, { buyerIsBusiness: true }] as const) {
      const kassza = mockKassza()
      await expect(
        kassza.issueForPayment(paid(), { vat: 27, buyer: consumer, ...options }),
      ).resolves.toMatchObject({ kind: 'invoice' })
    }
    const kassza = mockKassza()
    await expect(
      kassza.issueForPayment(paid({ customer: { isBusiness: true } }), {
        vat: 27,
        buyer: consumer,
      }),
    ).resolves.toMatchObject({ kind: 'invoice' })
  })

  test('pénztárgép-köteles tevékenységnél validációs hibát dob', async () => {
    const kassza = mockKassza()
    await expect(
      kassza.issueForPayment(paid(), { vat: 27, cashRegisterRequired: true }),
    ).rejects.toMatchObject({
      category: 'validation',
      message: expect.stringContaining('pénztárgép'),
    })
  })

  test('a document opcióval kényszerített típust a döntésben is jelzi', async () => {
    const kassza = mockKassza()
    const invoice = await kassza.issueForPayment(paid(), {
      vat: 27,
      document: 'invoice',
      buyer: { ...BUYER, taxNumber: undefined },
    })
    expect(invoice).toMatchObject({
      kind: 'invoice',
      decision: {
        type: 'invoice',
        reasons: ['A bizonylat típusát a hívó adta meg.'],
        grossTotalHuf: 2540,
      },
    })
    const foreign = await kassza.issueForPayment(
      paid({ id: 'pi_eur', amount: { value: 10, currency: 'EUR' } }),
      { vat: 27, document: 'receipt', exchangeRate: 400 },
    )
    expect(foreign).toMatchObject({ kind: 'receipt', decision: { grossTotalHuf: 4000 } })
    const unknownRate = await mockKassza().issueForPayment(
      paid({ id: 'pi_eur', amount: { value: 10, currency: 'EUR' } }),
      {
        vat: 27,
        document: 'invoice',
        buyer: BUYER,
      },
    )
    if (unknownRate.kind !== 'invoice') throw new Error('számla várt')
    expect(unknownRate.decision.grossTotalHuf).toBeNaN()
  })

  test('devizás fizetésnél árfolyam nélkül hibát dob, árfolyammal MNB-s devizás nyugtát ad', async () => {
    const kassza = mockKassza()
    const payment = paid({ amount: { value: 12.5, currency: 'EUR' } })
    await expect(kassza.issueForPayment(payment, { vat: 27 })).rejects.toMatchObject({
      category: 'validation',
    })
    const result = await kassza.issueForPayment(payment, { vat: 27, exchangeRate: 395.5 })
    expect(result).toMatchObject({ kind: 'receipt', created: true })
    const create = kassza.calls.find((call) => call.method === 'receipts.create')
    expect(create?.args[0]).toMatchObject({
      currency: 'EUR',
      exchangeRate: 395.5,
      exchangeBank: 'MNB',
    })
  })

  test('devizás számlánál átadja az árfolyamot és a bankot', async () => {
    const kassza = mockKassza()
    await kassza.issueForPayment(paid({ amount: { value: 12.5, currency: 'EUR' } }), {
      vat: 27,
      document: 'invoice',
      buyer: BUYER,
      exchangeRate: 395.5,
      exchangeBank: 'OTP',
    })
    const create = kassza.calls.find((call) => call.method === 'invoices.create')
    expect(create?.args[0]).toMatchObject({
      currency: 'EUR',
      exchangeRate: 395.5,
      exchangeBank: 'OTP',
    })
  })

  test('a fizetés és a megadott pénznem eltérésére validációs hibát dob', async () => {
    const kassza = mockKassza()
    await expect(
      kassza.issueForPayment(paid(), { vat: 27, currency: 'EUR' }),
    ).rejects.toMatchObject({
      category: 'validation',
      message: expect.stringContaining('pénzneme'),
    })
  })

  test('a saját rendelésszámot és a nyugta extra mezőit használja', async () => {
    const kassza = mockKassza()
    const result = await kassza.issueForPayment(paid(), {
      vat: 27,
      orderNumber: ' WEB-1001 ',
      receipt: { paymentMethod: 'Stripe', comment: 'Webshop rendelés' },
    })
    if (result.kind !== 'receipt') throw new Error('nyugta várt')
    expect(result.receipt).toMatchObject({
      orderNumber: 'WEB-1001',
      callId: 'WEB-1001',
      paymentMethod: 'Stripe',
      comment: 'Webshop rendelés',
    })
  })

  test('érvénytelen recoveryDelayMs-re konfigurációs hibát dob', async () => {
    const kassza = mockKassza()
    await expect(
      kassza.issueForPayment(paid(), { vat: 27, recoveryDelayMs: -1 }),
    ).rejects.toMatchObject({ category: 'configuration' })
  })
})

describe('issueForPayment: nem sikeres fizetés', () => {
  test('a sikertelen és egyéb állapotot kihagyja', async () => {
    const kassza = mockKassza()
    await expect(kassza.issueForPayment(paid({ kind: 'failed' }))).resolves.toMatchObject({
      kind: 'skipped',
      reason: expect.stringContaining('failed'),
    })
    await expect(kassza.issueForPayment(paid({ kind: 'other' }))).resolves.toMatchObject({
      kind: 'skipped',
    })
  })

  test('a részleges visszatérítést nem sztornózza automatikusan', async () => {
    const kassza = mockKassza()
    await kassza.issueForPayment(paid(), { vat: 27 })
    await expect(
      kassza.issueForPayment(paid({ kind: 'partially-refunded' })),
    ).resolves.toMatchObject({ kind: 'skipped', reason: expect.stringContaining('Részleges') })
    expect(kassza.calls.some((call) => call.method === 'receipts.reverse')).toBe(false)
  })
})

describe('issueForPayment: teljes visszatérítés', () => {
  test('a nyugtát egyszer sztornózza', async () => {
    const kassza = mockKassza()
    const issued = await kassza.issueForPayment(paid(), { vat: 27 })
    if (issued.kind !== 'receipt') throw new Error('nyugta várt')

    const first = await kassza.issueForPayment(refunded())
    const second = await kassza.issueForPayment(refunded())

    expect(first).toMatchObject({
      kind: 'reversal',
      document: 'receipt',
      reversedNumber: issued.number,
      created: true,
    })
    expect(second).toMatchObject({
      kind: 'reversal',
      document: 'receipt',
      reversedNumber: issued.number,
      created: false,
    })
    if (first.kind !== 'reversal' || second.kind !== 'reversal') throw new Error('sztornó várt')
    expect(second.number).toBe(first.number)
    const reversal = kassza.receiptRecords.get(first.number ?? '')
    expect(reversal?.receipt).toMatchObject({ type: 'reversal', callId: 'STRIPE-pi_123/SN' })
    expect(kassza.calls.filter((call) => call.method === 'receipts.reverse')).toHaveLength(1)
  })

  test('a számlát egyszer sztornózza a /SS külső azonosítóval', async () => {
    const kassza = mockKassza()
    const issued = await kassza.issueForPayment(paid({ customer: COMPANY_CUSTOMER }), { vat: 27 })
    if (issued.kind !== 'invoice') throw new Error('számla várt')

    const first = await kassza.issueForPayment(refunded())
    const second = await kassza.issueForPayment(refunded())

    expect(first).toMatchObject({
      kind: 'reversal',
      document: 'invoice',
      reversedNumber: issued.number,
      created: true,
    })
    expect(second).toMatchObject({ kind: 'reversal', document: 'invoice', created: false })
    const reverse = kassza.calls.find((call) => call.method === 'invoices.reverse')
    expect(reverse?.args[0]).toMatchObject({
      invoiceNumber: issued.number,
      externalId: 'STRIPE-pi_123/SS',
      downloadPdf: false,
    })
    expect(kassza.calls.filter((call) => call.method === 'invoices.reverse')).toHaveLength(1)
  })

  test('bizonylat nélkül kihagyja a visszatérítést', async () => {
    const kassza = mockKassza()
    await expect(kassza.issueForPayment(refunded())).resolves.toMatchObject({
      kind: 'skipped',
      reason: expect.stringContaining('nem található'),
    })
  })

  test('számlára cserélt nyugtánál a csereszámlát sztornózza', async () => {
    const kassza = mockKassza()
    const issued = await kassza.issueForPayment(paid(), { vat: 27 })
    if (issued.kind !== 'receipt') throw new Error('nyugta várt')
    const converted = await kassza.receipts.convertToInvoice({
      receiptNumber: issued.number,
      buyer: BUYER,
    })

    const result = await kassza.issueForPayment(refunded())

    expect(result).toMatchObject({
      kind: 'reversal',
      document: 'invoice',
      reversedNumber: converted.invoice.number,
      created: true,
    })
  })

  test('visszatérítés után érkező fizetési értesítésre nem állít ki új nyugtát', async () => {
    const kassza = mockKassza()
    await kassza.issueForPayment(paid(), { vat: 27 })
    await kassza.issueForPayment(refunded())

    const late = await kassza.issueForPayment(paid(), { vat: 27 })

    expect(late).toMatchObject({ kind: 'skipped', reason: expect.stringContaining('sztornózták') })
    expect(kassza.calls.filter((call) => call.method === 'receipts.create')).toHaveLength(1)
  })

  test('elveszett válasz után a nyugtasztornót visszakeresi és létrejöttnek jelzi', async () => {
    const kassza = mockKassza()
    await kassza.issueForPayment(paid(), { vat: 27 })
    kassza.failNext('receipts.reverse', networkError(), { afterSuccess: true })

    const result = await kassza.issueForPayment(refunded())

    expect(result).toMatchObject({ kind: 'reversal', document: 'receipt', created: true })
    if (result.kind !== 'reversal') throw new Error('sztornó várt')
    expect(result.number).toMatch(/STORNO/)
  })

  test('elveszett válasz után a számlasztornót visszakeresi és létrejöttnek jelzi', async () => {
    const kassza = mockKassza()
    await kassza.issueForPayment(paid({ customer: COMPANY_CUSTOMER }), { vat: 27 })
    kassza.failNext('invoices.reverse', networkError(), { afterSuccess: true })

    await expect(kassza.issueForPayment(refunded())).resolves.toMatchObject({
      kind: 'reversal',
      document: 'invoice',
      created: true,
    })
  })

  test('ha a számlasztornó sorsa nem deríthető ki, továbbdobja az eredeti hibát', async () => {
    const kassza = mockKassza()
    await kassza.issueForPayment(paid({ customer: COMPANY_CUSTOMER }), { vat: 27 })
    const failure = networkError()
    kassza.failNext('invoices.reverse', failure)

    await expect(kassza.issueForPayment(refunded())).rejects.toBe(failure)
  })

  test('ha a nyugtasztornó sorsa nem deríthető ki, továbbdobja az eredeti hibát', async () => {
    const kassza = mockKassza()
    await kassza.issueForPayment(paid(), { vat: 27 })
    const failure = networkError()
    kassza.failNext('receipts.reverse', failure)

    await expect(kassza.issueForPayment(refunded())).rejects.toBe(failure)
  })

  test('a duplikált hívásazonosító (338) már létező sztornót jelent', async () => {
    const kassza = mockKassza()
    const issued = await kassza.issueForPayment(paid(), { vat: 27 })
    if (issued.kind !== 'receipt') throw new Error('nyugta várt')
    kassza.failNext(
      'receipts.reverse',
      new SzamlazzError('[338] A hívásazonosító már létezik.', {
        category: 'duplicate',
        code: 338,
      }),
    )

    await expect(kassza.issueForPayment(refunded())).resolves.toEqual({
      kind: 'reversal',
      orderNumber: 'STRIPE-pi_123',
      document: 'receipt',
      reversedNumber: issued.number,
      number: undefined,
      created: false,
    })
  })

  test('a nem bizonytalan sztornóhibát továbbdobja', async () => {
    const kassza = mockKassza()
    await kassza.issueForPayment(paid(), { vat: 27 })
    const failure = new SzamlazzError('Üzleti hiba.', { category: 'validation' })
    kassza.failNext('receipts.reverse', failure)

    await expect(kassza.issueForPayment(refunded())).rejects.toBe(failure)
  })
})

describe('issueForPayment közvetlen API-val', () => {
  test('a megadott dokumentum API-kat használja', async () => {
    const kassza = mockKassza()
    const result = await issueForPayment(
      { invoices: kassza.invoices, receipts: kassza.receipts },
      paid(),
      { vat: 27, recoveryDelayMs: 0 },
    )
    expect(result).toMatchObject({ kind: 'receipt', created: true })
  })
})
