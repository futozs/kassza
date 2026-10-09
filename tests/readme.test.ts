import { describe, expect, test } from 'vitest'
import { hmacHex } from '../src/core/crypto'
import { dataLinkHandler } from '../src/data-link/index'
import { connectPrincipal, createKasszaPool } from '../src/delegation/index'
import {
  chooseDocument,
  createKassza,
  type DocumentEvent,
  isSzamlazzError,
  type Kassza,
} from '../src/index'
import { isSzamlazzIp } from '../src/ipn/index'
import { calculateInvoiceItem, calculateReceiptItem } from '../src/money/index'
import { createNavReceiptClient, reconcileNavReports } from '../src/nav/index'
import { stripeWebhook } from '../src/payments/stripe'
import { navDailyReports } from '../src/reports/index'
import { invoicePdfKey, memoryStorage, s3FetchStorage, storePdf } from '../src/storage/index'
import { createFakeAgentFetch, createMockKassza } from '../src/testing/index'
import {
  isValidHungarianBankAccount,
  isValidHungarianTaxNumber,
  parseHungarianAddress,
} from '../src/validators/index'
import { DATA_LINK_KEY, outgoingInvoiceXml } from './data-link-fixtures'
import { FAKE_NOW } from './fake-agent'
import { TEST_AGENT_KEY } from './helpers'

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
      buyer: { ...buyer, taxNumber: '12345676-2-42' },
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

  test('nyugta vagy számla és az utólagos számla a README szerint működik', async () => {
    const kassza = createMockKassza()
    const nyugta = await kassza.receipts.create({
      prefix: 'NYGT',
      paymentMethod: 'készpénz',
      items: [{ name: 'Kávé', grossUnitPrice: 890, vat: 27 }],
    })

    const dontes = chooseDocument({ grossTotal: 18_990, invoiceRequested: false })
    const atalakitas = await kassza.receipts.convertToInvoice({
      receiptNumber: nyugta.number,
      buyer: {
        name: 'Példa Kft.',
        zip: '1111',
        city: 'Budapest',
        address: 'Fő utca 1.',
        taxNumber: '12345676-2-42',
      },
    })

    expect(dontes.type).toBe('receipt')
    expect(dontes.reasons).toHaveLength(1)
    expect(atalakitas.invoice.number).toBeTruthy()
  })

  test('a createOnce példa a második hívásnál a meglévő számlát adja', async () => {
    const kassza = createMockKassza()
    const input = { orderNumber: 'REND-1001', paid: true, buyer, items }

    const elso = await kassza.invoices.createOnce(input)
    const masodik = await kassza.invoices.createOnce(input)

    expect(elso.created).toBe(true)
    expect(masodik).toMatchObject({ number: elso.number, created: false })
  })

  test('a Stripe webhook példa egyszer állít ki nyugtát, újraküldésnél sem többet', async () => {
    const kassza = createMockKassza({ defaults: { receipt: { prefix: 'NYGT' } } })
    const secret = 'whsec_readme'
    const POST = stripeWebhook({
      secret,
      apiKey: undefined,
      onPayment: (payment) => kassza.issueForPayment(payment, { vat: 27 }),
    })
    const payload = JSON.stringify({
      id: 'evt_1',
      object: 'event',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1',
          object: 'checkout.session',
          payment_intent: 'pi_1',
          payment_status: 'paid',
          amount_total: 1_270_000,
          currency: 'huf',
        },
      },
    })
    const deliver = async () => {
      const timestamp = Math.floor(Date.now() / 1000)
      const v1 = await hmacHex('SHA-256', secret, `${timestamp}.${payload}`)
      return POST(
        new Request('https://bolt.example.hu/api/stripe/webhook', {
          method: 'POST',
          headers: { 'stripe-signature': `t=${timestamp},v1=${v1}` },
          body: payload,
        }),
      )
    }

    expect((await deliver()).status).toBe(200)
    expect((await deliver()).status).toBe(200)
    expect(kassza.receiptRecords.size).toBe(1)
    expect([...kassza.receiptRecords.values()][0]?.receipt.totals.grossAmount).toBe(12_700)
  })

  test('a NAV példa kliense létrehozható, az egyeztetés a hiányzó napot jelzi', async () => {
    const kassza = createMockKassza({ now: () => new Date('2026-09-15T10:00:00Z') })
    const nyugtak = [
      await kassza.receipts.create({ prefix: 'NYGT', paymentMethod: 'készpénz', items }),
    ]
    const nav = createNavReceiptClient({
      environment: 'production',
      login: 'technikai',
      password: 'jelszo',
      signatureKey: 'alairokulcs-0123456789',
      taxNumber: '12345676',
    })

    const helyi = navDailyReports(nyugtak, { includeTest: true })
    const { missing, mismatched } = reconcileNavReports(helyi, [])

    expect(nav.canWrite).toBe(false)
    expect(missing).toHaveLength(1)
    expect(mismatched).toHaveLength(0)
  })

  test('a megbízotti példa csatlakoztat, és a pool kliense a megbízó előtagjával számláz', async () => {
    const agent = createFakeAgentFetch({ now: FAKE_NOW })
    const user = {
      email: 'kassza+pelda@platform.hu',
      password: 'platform-jelszo',
      firstName: 'Platform',
    }
    const { status } = await connectPrincipal(
      {
        principal: {
          name: 'Példa Kft.',
          taxNumber: '12345676-2-42',
          invoicePrefix: 'PLDA',
          zip: '1111',
          city: 'Budapest',
          address: 'Fő utca 1.',
          email: 'penzugy@pelda.hu',
        },
        user,
      },
      { agentKey: TEST_AGENT_KEY, fetch: agent.fetch },
    )
    agent.acceptDelegation('12345676-2-42')
    const megbizoAdatai = (megbizoId: string) =>
      megbizoId === 'pelda'
        ? { username: user.email, password: user.password, invoicePrefix: 'PLDA' }
        : undefined
    const pool = createKasszaPool({
      resolve: (megbizoId) => megbizoAdatai(megbizoId),
      fetch: agent.fetch,
      retryDelayMs: 0,
    })

    const kliens = await pool.get('pelda')
    const szamla = await kliens.invoices.createOnce({ orderNumber: 'FOGLALAS-881', buyer, items })

    expect(status).toBe('account-created')
    expect(szamla.number).toBe('PLDA-2026-1')
  })

  test('az adatkapcsolati példa iktatószámmal nyugtázza a számlát', async () => {
    const ugyfelKulcsai = async () => [DATA_LINK_KEY]
    const bizonylatMentese = async () => 'IKT-2026-1'
    const POST = dataLinkHandler({
      verifyKey: async (kulcs) => (await ugyfelKulcsai()).includes(kulcs),
      onPush: async () => {
        const iktatoszam = await bizonylatMentese()
        return { registrationNumber: iktatoszam }
      },
    })

    const valasz = await POST(
      new Request('https://konyveles.example.hu/api/szamlazz/adatkapcsolat', {
        method: 'POST',
        headers: { 'X-Szamlazzhu-Key': DATA_LINK_KEY },
        body: outgoingInvoiceXml(),
      }),
    )

    expect(valasz.status).toBe(200)
    expect(await valasz.text()).toContain('IKT-2026-1')
  })

  test('a hamis Agent példa: elveszett válasz után is egy számla, created igaz', async () => {
    const agent = createFakeAgentFetch({ now: FAKE_NOW })
    const kassza = createKassza({ agentKey: 'teszt-kulcs', fetch: agent.fetch, retryDelayMs: 0 })

    agent.fail('ghostSuccess', { action: 'createInvoice' })
    const eredmeny = await kassza.invoices.createOnce(
      { orderNumber: 'WEB-1', buyer, items },
      { recoveryDelayMs: 0 },
    )

    expect(eredmeny.created).toBe(true)
    expect(agent.invoices.size).toBe(1)
  })

  test('az onDocument és a maintenanceCooldownMs példa', async () => {
    const naplo: string[] = []
    const auditNaplo = async (...reszek: string[]) => {
      naplo.push(reszek.join(' '))
    }
    const kassza: Kassza = createKassza({
      agentKey: 'tesztkulcs',
      maintenanceCooldownMs: 60_000,
      hooks: {
        onDocument: async (esemeny: DocumentEvent) => {
          await auditNaplo(esemeny.kind, esemeny.action, esemeny.number)
        },
      },
    })
    const mock = createMockKassza({
      hooks: {
        onDocument: async (esemeny) => {
          await auditNaplo(esemeny.kind, esemeny.action, esemeny.number)
        },
      },
    })

    const szamla = await mock.invoices.create({ buyer, items })

    expect(kassza.invoices.create).toBeTypeOf('function')
    expect(naplo).toEqual([`invoice created ${szamla.number}`])
  })
})

describe('README példák: új modulok', async () => {
  const { billingPeriodAt, runBatch } = await import('../src/batch/index')
  const { createJournal, memoryJournal } = await import('../src/journal/index')
  const { toNodeHandler } = await import('../src/node/index')
  const { combineHooks, createMetricsRegistry, observe } = await import('../src/observe/index')
  const { diagnoseStore, memoryStore } = await import('../src/stores/index')

  test('pontosan egyszer közös tárolóval, napló a NAV összesítőhöz', async () => {
    const store = memoryStore()
    const journal = createJournal(memoryJournal(), { now: FAKE_NOW })
    const agent = createFakeAgentFetch({ now: FAKE_NOW, testAccount: false })
    const kassza = createKassza({
      agentKey: TEST_AGENT_KEY,
      fetch: agent.fetch,
      cookieStore: store,
      attemptLedger: store,
      createOnceLock: store,
      hooks: { onDocument: (event) => journal.record(event), onDocumentError: 'throw' },
      defaults: { receipt: { prefix: 'NYGT', paymentMethod: 'bankkártya' } },
    })

    await kassza.receipts.createOnce({ orderNumber: 'R-1', items })
    const jelentesek = navDailyReports(
      await journal.receipts({ from: '2026-10-01', to: '2026-10-31' }),
    )

    expect(jelentesek).toHaveLength(1)
    expect((await diagnoseStore(store)).ok).toBe(true)
  })

  test('megfigyelhetőség és tömeges számlázás', async () => {
    const metrics = createMetricsRegistry()
    const agent = createFakeAgentFetch({ now: FAKE_NOW })
    const kassza = createKassza({
      agentKey: TEST_AGENT_KEY,
      fetch: agent.fetch,
      hooks: combineHooks(observe({ metrics }), {}),
    })
    const idoszak = billingPeriodAt({ interval: 'month', anchor: '2026-01-31' }, '2026-10-15')
    const eredmeny = await runBatch(kassza, {
      items: [1, 2].map((id) => ({
        key: `SUB-${id}-${idoszak.start}`,
        document: () => ({ kind: 'invoice' as const, input: { buyer, items } }),
      })),
      ratePerMinute: 600_000,
      dryRun: false,
    })

    expect(idoszak.start).toBe('2026-09-30')
    expect(eredmeny.created).toHaveLength(2)
    expect(metrics.renderPrometheus()).toContain('kassza_documents_total')
  })

  test('Express-kezelő típushelyes', () => {
    const handler = toNodeHandler(stripeWebhook({ secret: 'whsec_x', onPayment: () => undefined }))
    expect(handler).toBeTypeOf('function')
  })
})
