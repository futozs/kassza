import { createKassza, isSzamlazzError, type Kassza } from 'kassza'
import { describe, expect, test } from 'vitest'
import { createAgentSimulator } from './index'

const buyer = {
  name: 'Vevő Kft.',
  zip: '1111',
  city: 'Budapest',
  address: 'Fő utca 1.',
  email: 'vevo@example.hu',
}

function setup(): { kassza: Kassza; simulator: ReturnType<typeof createAgentSimulator> } {
  const simulator = createAgentSimulator()
  const kassza = createKassza({
    agentKey: 'sandbox-kulcs',
    fetch: simulator.fetch,
    retryDelayMs: 0,
  })
  return { kassza, simulator }
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('A hívásnak hibát kellett volna dobnia')
}

describe('Számla Agent szimulátor', () => {
  test('számlát állít ki, a válaszból a kassza kiolvassa a számlaszámot és a PDF-et', async () => {
    const { kassza, simulator } = setup()

    const szamla = await kassza.invoices.create({
      orderNumber: 'REND-1',
      buyer,
      items: [{ name: 'Webfejlesztés', quantity: 10, unit: 'óra', netUnitPrice: 15_000, vat: 27 }],
    })

    expect(szamla.number).toMatch(/^KASSZA-\d{4}-1$/)
    expect(szamla.grossTotal).toBe(190_500)
    expect(szamla.netTotal).toBe(150_000)
    expect(new TextDecoder().decode(szamla.pdf?.slice(0, 5))).toBe('%PDF-')
    expect(simulator.calls[0]?.requestXml).toContain(
      '<szamlaagentkulcs>••••••••</szamlaagentkulcs>',
    )
    expect(simulator.calls[0]?.effects).toContain(
      'Számlaértesítő e-mail a vevőnek: vevo@example.hu',
    )
  })

  test('a második kérés újrahasznosítja a session cookie-t', async () => {
    const { kassza, simulator } = setup()

    await kassza.invoices.create({ buyer, items: [{ name: 'A', netUnitPrice: 1000, vat: 27 }] })
    await kassza.invoices.create({ buyer, items: [{ name: 'B', netUnitPrice: 1000, vat: 27 }] })

    expect(simulator.calls.map((call) => call.sessionReused)).toEqual([false, true])
  })

  test('ismeretlen előtagnál 202-es validációs hibát ad', async () => {
    const { kassza } = setup()

    const error = await captureError(
      kassza.invoices.create({
        prefix: 'NINCS',
        buyer,
        items: [{ name: 'A', netUnitPrice: 1000, vat: 27 }],
      }),
    )

    expect(isSzamlazzError(error) && error.code).toBe(202)
    expect(isSzamlazzError(error) && error.category).toBe('validation')
  })

  test('számla adatai, PDF, befizetés és sztornó egymásra épülnek', async () => {
    const { kassza } = setup()
    const szamla = await kassza.invoices.create({
      orderNumber: 'REND-2',
      buyer,
      items: [{ name: 'Póló', quantity: 2, grossUnitPrice: 5_990, vat: 27 }],
    })

    const adatok = await kassza.invoices.get({ orderNumber: 'REND-2' })
    expect(adatok.header.number).toBe(szamla.number)
    expect(adatok.totals.grossAmount).toBe(11_980)
    expect(adatok.items[0]?.name).toBe('Póló')

    const befizetes = await kassza.invoices.registerPayment({
      invoiceNumber: szamla.number,
      amount: 5_000,
    })
    expect(befizetes.outstanding).toBe(6_980)

    const pdf = await kassza.invoices.getPdf(szamla.number)
    expect(pdf.pdf.byteLength).toBeGreaterThan(500)

    const sztorno = await kassza.invoices.reverse(szamla.number)
    expect(sztorno.number).not.toBe(szamla.number)
    expect(sztorno.grossTotal).toBe(-11_980)

    const ujra = await kassza.invoices.get(szamla.number)
    expect(ujra.header.reversed).toBe(true)
  })

  test('a find null-t ad nem létező számlára, a verifyCredentials igazat', async () => {
    const { kassza } = setup()

    await expect(kassza.invoices.find({ orderNumber: 'NINCS-ILYEN' })).resolves.toBeNull()
    await expect(kassza.verifyCredentials()).resolves.toBe(true)
  })

  test('rossz kulccsal a verifyCredentials hamisat ad', async () => {
    const simulator = createAgentSimulator()
    const kassza = createKassza({ agentKey: 'rossz-kulcs', fetch: simulator.fetch })

    await expect(kassza.verifyCredentials()).resolves.toBe(false)
  })

  test('díjbekérőből számla, majd a díjbekérő törlése és a második törlés 335-ös hibája', async () => {
    const { kassza } = setup()
    const dijbekero = await kassza.invoices.create({
      type: 'proforma',
      orderNumber: 'NEV-1',
      buyer,
      items: [{ name: 'Nevezés', grossUnitPrice: 26_000, vat: 27 }],
    })
    expect(dijbekero.number.startsWith('D-')).toBe(true)

    await kassza.invoices.deleteProforma({ orderNumber: 'NEV-1' })
    const error = await captureError(kassza.invoices.deleteProforma({ orderNumber: 'NEV-1' }))
    expect(isSzamlazzError(error) && error.category).toBe('not_found')
  })

  test('díjbekérő sztornózásakor a kassza validációs hibát dob', async () => {
    const { kassza } = setup()
    const dijbekero = await kassza.invoices.create({
      type: 'proforma',
      buyer,
      items: [{ name: 'Nevezés', grossUnitPrice: 26_000, vat: 27 }],
    })

    const error = await captureError(kassza.invoices.reverse(dijbekero.number))
    expect(isSzamlazzError(error) && error.category).toBe('validation')
  })

  test('nyugta létrehozás, lekérdezés, kiküldés és sztornó', async () => {
    const { kassza, simulator } = setup()

    const nyugta = await kassza.receipts.create({
      prefix: 'NYGT',
      paymentMethod: 'készpénz',
      callId: 'POS-1',
      orderNumber: 'POS-1',
      items: [
        { name: 'Kávé', quantity: 2, grossUnitPrice: 890, vat: 27 },
        { name: 'Kifli', grossUnitPrice: 250, vat: 5 },
      ],
    })
    expect(nyugta.number).toMatch(/^NYGT-\d{4}-1$/)
    expect(nyugta.totals.grossAmount).toBe(2_030)

    const lekert = await kassza.receipts.get({ orderNumber: 'POS-1' })
    expect(lekert.number).toBe(nyugta.number)

    await kassza.receipts.send({ receiptNumber: nyugta.number, emails: 'vevo@example.hu' })
    expect(simulator.snapshot().receipts[0]?.sentTo).toEqual(['vevo@example.hu'])

    const sztorno = await kassza.receipts.reverse(nyugta.number)
    expect(sztorno.type).toBe('reversal')
    expect(sztorno.reversedReceiptNumber).toBe(nyugta.number)

    const duplikalt = await captureError(
      kassza.receipts.create({
        prefix: 'NYGT',
        paymentMethod: 'készpénz',
        callId: 'POS-1',
        items: [{ name: 'Kávé', grossUnitPrice: 890, vat: 27 }],
      }),
    )
    expect(isSzamlazzError(duplikalt) && duplikalt.code).toBe(338)
  })

  test('adószám lekérdezés minta adószámmal és ismeretlen törzsszámmal', async () => {
    const { kassza } = setup()

    const ceg = await kassza.taxpayer.query('12345676-2-41')
    expect(ceg.valid).toBe(true)
    expect(ceg.taxNumber?.formatted).toBe('12345676-2-41')
    expect(ceg.address?.formatted).toBe('1111 Budapest, Minta utca 1.')

    const ismeretlen = await kassza.taxpayer.query('87654321')
    expect(ismeretlen.valid).toBe(false)
  })

  test('hálózati hibánál a lekérdezést a kassza újrapróbálja, a számlát nem', async () => {
    const { kassza, simulator } = setup()
    const szamla = await kassza.invoices.create({
      buyer,
      items: [{ name: 'A', netUnitPrice: 1000, vat: 27 }],
    })

    simulator.failNext('getInvoicePdf', 'network')
    await kassza.invoices.getPdf(szamla.number)
    expect(simulator.calls.filter((call) => call.action === 'getInvoicePdf')).toHaveLength(2)

    simulator.failNext('createInvoice', 'network')
    const error = await captureError(
      kassza.invoices.create({ buyer, items: [{ name: 'B', netUnitPrice: 1000, vat: 27 }] }),
    )
    expect(isSzamlazzError(error) && error.category).toBe('network')
    expect(simulator.calls.filter((call) => call.action === 'createInvoice')).toHaveLength(2)
  })

  test('56-os hibánál a számla elkészül, és find-dal megtalálható', async () => {
    const { kassza, simulator } = setup()
    simulator.failNext('createInvoice', 56)

    const error = await captureError(
      kassza.invoices.create({
        orderNumber: 'REND-56',
        buyer,
        items: [{ name: 'A', netUnitPrice: 1000, vat: 27 }],
      }),
    )
    expect(isSzamlazzError(error) && error.category).toBe('partial_success')
    await expect(kassza.invoices.find({ orderNumber: 'REND-56' })).resolves.not.toBeNull()
  })

  test('előnézet nem hoz létre bizonylatot', async () => {
    const { kassza, simulator } = setup()

    const elonezet = await kassza.invoices.preview({
      buyer,
      items: [{ name: 'A', netUnitPrice: 1000, vat: 27 }],
    })

    expect(elonezet.pdf.byteLength).toBeGreaterThan(500)
    expect(elonezet.grossTotal).toBe(1_270)
    expect(simulator.snapshot().invoices).toHaveLength(0)
  })
})
