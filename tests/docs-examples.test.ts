import { describe, expect, test } from 'vitest'
import { dataLinkHandler } from '../src/data-link/index'
import { connectPrincipal, createKasszaPool } from '../src/delegation/index'
import { chooseDocument, createKassza, type Kassza, type Receipt } from '../src/index'
import { ipnOkResponse, readIpnNotification } from '../src/ipn/index'
import { type NavReportListItem, reconcileNavReports } from '../src/nav/index'
import type { PaymentEvent } from '../src/payments/index'
import { navDailyReports } from '../src/reports/index'
import { invoicePdfKey, memoryStorage, storePdf } from '../src/storage/index'
import { createFakeAgentFetch, createMockKassza } from '../src/testing/index'
import { parseHungarianTaxNumber } from '../src/validators/index'
import { DATA_LINK_KEY, outgoingInvoiceXml } from './data-link-fixtures'
import { FAKE_NOW } from './fake-agent'
import { TEST_AGENT_KEY } from './helpers'

const buyer = {
  name: 'Vevő Kft.',
  zip: '1111',
  city: 'Budapest',
  address: 'Fő utca 1.',
  email: 'vevo@example.hu',
}

const items = [{ name: 'Termék', quantity: 1, grossUnitPrice: 12_700, vat: 27 as const }]

async function invoiceOrder(order: { id: number; total: number }, kassza: Kassza): Promise<string> {
  const { number } = await kassza.invoices.createOnce({
    orderNumber: `ORDER-${order.id}`,
    paid: true,
    paymentMethod: 'bankkártya',
    buyer,
    items: [{ name: 'Termék', quantity: 1, grossUnitPrice: order.total, vat: 27 }],
  })
  return number
}

function stripePayment(kind: PaymentEvent['kind']): PaymentEvent {
  return {
    provider: 'stripe',
    kind,
    id: 'pi_123',
    amount: { value: 12_700, currency: 'HUF' },
    method: 'bankkártya',
    raw: {},
  }
}

function remoteReport(report: ReturnType<typeof navDailyReports>[number]): NavReportListItem {
  return {
    id: `nav-${report.serialNumber}`,
    applicableDate: report.applicableDate,
    serialNumber: report.serialNumber,
    numberOfSaleDocument: report.numberOfSaleDocument,
    numberOfModifyingDocument: report.numberOfModifyingDocument,
    totalAmount: report.total,
    totalAmountInForint: report.total,
    status: 'RECORDED',
    softwareName: 'Számlázz.hu',
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

  test('pénztári nyugta recept: az ismételt gombnyomás ugyanazt a nyugtát adja', async () => {
    const kassza = createMockKassza({ defaults: { receipt: { prefix: 'NYGT' } } })
    const sale = {
      orderNumber: 'POS-42',
      paymentMethod: 'készpénz',
      items: [{ name: 'Lángos', quantity: 2, grossUnitPrice: 1_490, vat: 5 as const }],
    }

    const first = await kassza.receipts.createOnce(sale, { lookupFirst: false })
    const second = await kassza.receipts.createOnce(sale, { lookupFirst: false })

    expect(second.receipt.number).toBe(first.receipt.number)
    expect([first.created, second.created]).toEqual([true, false])
    expect(kassza.receiptRecords.size).toBe(1)
  })

  test('fizetésből bizonylat recept: egyszer nyugta, visszatérítéskor sztornó', async () => {
    const kassza = createMockKassza({ defaults: { receipt: { prefix: 'NYGT' } } })

    const issued = await kassza.issueForPayment(stripePayment('paid'), { vat: 27 })
    const redelivered = await kassza.issueForPayment(stripePayment('paid'), { vat: 27 })
    const refunded = await kassza.issueForPayment(stripePayment('refunded'), { vat: 27 })

    expect(issued).toMatchObject({ kind: 'receipt', created: true, orderNumber: 'STRIPE-pi_123' })
    expect(redelivered).toMatchObject({ kind: 'receipt', created: false })
    expect(refunded).toMatchObject({ kind: 'reversal', document: 'receipt', created: true })
  })

  test('nyugta vagy számla recept: döntés és utólagos számla', async () => {
    const kassza = createMockKassza({ defaults: { receipt: { prefix: 'NYGT' } } })
    const receipt = await kassza.receipts.create({ paymentMethod: 'bankkártya', items })

    const decision = chooseDocument({ grossTotal: 12_700, buyer: { taxNumber: '12345676-2-42' } })
    const converted = await kassza.receipts.convertToInvoice({
      receiptNumber: receipt.number,
      buyer: { ...buyer, taxNumber: '12345676-2-42' },
    })

    expect(decision.type).toBe('invoice')
    expect(converted.reversal?.type).toBe('reversal')
    expect(converted.invoice).toMatchObject({ created: true, externalId: `CONV/${receipt.number}` })
  })

  test('NAV egyeztetés recept: a hiányzó nap kiderül', async () => {
    const kassza = createMockKassza({
      defaults: { receipt: { prefix: 'NYGT' } },
      now: () => new Date('2026-09-15T10:00:00Z'),
    })
    const receipts: Receipt[] = [
      await kassza.receipts.create({ paymentMethod: 'bankkártya', items }),
      await kassza.receipts.create({ paymentMethod: 'készpénz', items }),
    ]

    const local = navDailyReports(receipts, { includeTest: true })
    const complete = reconcileNavReports(local, local.map(remoteReport))
    const empty = reconcileNavReports(local, [])

    expect(local).toHaveLength(1)
    expect(complete.matched).toHaveLength(1)
    expect(empty.missing).toHaveLength(1)
  })

  test('megbízotti pool recept: kiállítás a megbízó előtagjával', async () => {
    const agent = createFakeAgentFetch({ now: FAKE_NOW })
    const user = {
      email: 'kassza+megbizo@pelda.hu',
      password: 'nagyontitkos1',
      firstName: 'Kassza',
    }
    await connectPrincipal(
      {
        principal: {
          name: 'Megbízó Kft.',
          taxNumber: '12345676-2-42',
          invoicePrefix: 'MEGB',
          zip: '1111',
          city: 'Budapest',
          address: 'Fő utca 1.',
          email: 'penzugy@megbizo.hu',
        },
        user,
      },
      { agentKey: TEST_AGENT_KEY, fetch: agent.fetch },
    )
    agent.acceptDelegation('12345676')
    const pool = createKasszaPool({
      resolve: (merchantId) =>
        merchantId === 'merchant-42'
          ? { username: user.email, password: user.password, invoicePrefix: 'MEGB' }
          : undefined,
      fetch: agent.fetch,
      retryDelayMs: 0,
    })

    const kassza = await pool.get('merchant-42')
    const result = await kassza.invoices.createOnce({ orderNumber: 'BOOKING-881', buyer, items })

    expect(result).toMatchObject({ created: true, number: 'MEGB-2026-1' })
    await expect(pool.get('ismeretlen')).rejects.toThrow()
  })

  test('adatkapcsolat recept: kulcsellenőrzés és iktatószám', async () => {
    const pushes: string[] = []
    const handler = dataLinkHandler({
      verifyKey: async (key) => key === DATA_LINK_KEY,
      onPush: async (push) => {
        pushes.push(push.kind)
        if (push.kind === 'invoice') return { registrationNumber: 'IKT-1' }
        return undefined
      },
    })
    const send = (key: string) =>
      handler(
        new Request('https://erp.example/api/szamlazz/data-link', {
          method: 'POST',
          headers: { 'content-type': 'application/xml', 'X-Szamlazzhu-Key': key },
          body: outgoingInvoiceXml(),
        }),
      )

    const accepted = await send(DATA_LINK_KEY)
    const rejected = await send('ismeretlen-kulcs')

    expect(accepted.status).toBe(200)
    expect(await accepted.text()).toContain('IKT-1')
    expect(await rejected.text()).toContain('KEY_ERR')
    expect(pushes).toEqual(['invoice'])
  })

  test('hamis Agent recept: elveszett válasz után sincs második számla', async () => {
    const agent = createFakeAgentFetch({ now: FAKE_NOW })
    const kassza = createKassza({ agentKey: TEST_AGENT_KEY, fetch: agent.fetch, retryDelayMs: 0 })
    agent.fail('ghostSuccess', { action: 'createInvoice' })

    const result = await kassza.invoices.createOnce(
      { orderNumber: 'WEB-1', buyer, items },
      { recoveryDelayMs: 0 },
    )

    expect(result.created).toBe(true)
    expect(agent.invoices.size).toBe(1)
  })
})
