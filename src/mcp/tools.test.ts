import { afterEach, describe, expect, test, vi } from 'vitest'
import { FAKE_NOW } from '../../tests/fake-agent'
import { MODERN_META, mcpHarness } from '../../tests/mcp'
import { createKasszaMcpServer } from './index'

const BUYER = {
  name: 'Példa Kft.',
  zip: '1111',
  city: 'Budapest',
  address: 'Fő utca 1.',
  email: 'penzugy@pelda.hu',
  taxNumber: '12345678-2-42',
}

const INVOICE = {
  buyer: BUYER,
  items: [{ name: 'Tanácsadás', quantity: 3, unit: 'óra', netUnitPrice: 20_000, vat: 27 }],
}

const RECEIPT = {
  items: [{ name: 'Kávé', quantity: 2, grossUnitPrice: 890, vat: 27 }],
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('MCP eszközök: számla', () => {
  test('az előnézet helyben számol, megerősítő kódot ad, és nem hívja a Számlázz.hu-t', async () => {
    const { call, agent } = mcpHarness({ allowWrite: true })

    const preview = await call('preview_invoice', INVOICE)

    expect(preview.isError).toBe(false)
    expect(preview.data).toMatchObject({
      document: 'invoice',
      issueDate: '2026-10-02',
      sendEmail: false,
      totals: { netAmount: 60_000, vatAmount: 16_200, grossAmount: 76_200 },
      items: [{ name: 'Tanácsadás', quantity: 3, unit: 'óra', grossAmount: 76_200 }],
      confirmation: expect.stringMatching(/^[0-9a-z]+\.[0-9a-f]{32}$/),
    })
    expect(preview.text).toContain('még NEM készült el')
    expect(preview.text).toContain('A vevő nem kap e-mailt')
    expect(agent.requests).toHaveLength(0)
  })

  test('a megerősítő kóddal kiállítja a számlát, e-mail nélkül, az előnézet dátumaival', async () => {
    const { call, agent } = mcpHarness({ allowWrite: true })
    const preview = await call('preview_invoice', INVOICE)

    const created = await call('create_invoice', {
      ...INVOICE,
      confirmation: preview.data.confirmation,
    })

    expect(created).toMatchObject({
      isError: false,
      data: {
        created: true,
        number: 'KASSZA-2026-1',
        grossTotal: 76_200,
        externalId: expect.stringMatching(/^MCP-[0-9A-F]{20}$/),
      },
    })
    const xml = agent.requests.find((request) => request.action === 'createInvoice')?.xml ?? ''
    expect(xml).toContain('<sendEmail>false</sendEmail>')
    expect(xml).toContain('<keltDatum>2026-10-02</keltDatum>')
    expect(agent.invoices.get('KASSZA-2026-1')?.externalId).toBe(created.data.externalId)
  })

  test('ugyanazzal a megerősítéssel másodszor nem állít ki új számlát', async () => {
    const { call, agent } = mcpHarness({ allowWrite: true })
    const preview = await call('preview_invoice', INVOICE)
    const args = { ...INVOICE, confirmation: preview.data.confirmation }

    await call('create_invoice', args)
    const again = await call('create_invoice', args)
    const repreviewed = await call('preview_invoice', INVOICE)
    const third = await call('create_invoice', {
      ...INVOICE,
      confirmation: repreviewed.data.confirmation,
    })

    expect(again.data).toMatchObject({ created: false, number: 'KASSZA-2026-1' })
    expect(third.data).toMatchObject({ created: false, number: 'KASSZA-2026-1' })
    expect(again.text).toContain('Nem állítottam ki újra')
    expect(agent.invoices.size).toBe(1)
  })

  test('saját külső azonosítóval azt használja', async () => {
    const { call, agent } = mcpHarness({ allowWrite: true })
    const input = { ...INVOICE, externalId: 'CRM-42', orderNumber: 'WEB-42', sendEmail: true }
    const preview = await call('preview_invoice', input)

    const created = await call('create_invoice', {
      ...input,
      confirmation: preview.data.confirmation,
    })

    expect(created.data).toMatchObject({ created: true, externalId: 'CRM-42' })
    expect(preview.text).toContain('e-mailben elküldi')
    expect(agent.requests.at(-1)?.xml).toContain('<sendEmail>true</sendEmail>')
  })

  test('hiányzó, módosított adatokhoz tartozó vagy lejárt megerősítő kódra eszközhibát ad', async () => {
    let current = FAKE_NOW()
    const { call, agent } = mcpHarness({ allowWrite: true, now: () => current })
    const preview = await call('preview_invoice', INVOICE)

    const missing = await call('create_invoice', INVOICE)
    const malformed = await call('create_invoice', { ...INVOICE, confirmation: 'nem-kod' })
    const tampered = await call('create_invoice', {
      ...INVOICE,
      items: [{ ...INVOICE.items[0], quantity: 30 }],
      confirmation: preview.data.confirmation,
    })
    current = new Date(current.getTime() + 16 * 60_000)
    const expired = await call('create_invoice', {
      ...INVOICE,
      confirmation: preview.data.confirmation,
    })

    expect(missing).toMatchObject({ isError: true, text: expect.stringContaining('Hiányzik') })
    expect(malformed).toMatchObject({ isError: true, text: expect.stringContaining('formátuma') })
    expect(tampered).toMatchObject({ isError: true, text: expect.stringContaining('eltérnek') })
    expect(expired).toMatchObject({ isError: true, text: expect.stringContaining('lejárt') })
    expect(agent.invoices.size).toBe(0)
  })

  test('a válasz elvesztésekor visszakeresi a létrejött számlát', async () => {
    const { call, agent } = mcpHarness({ allowWrite: true })
    const preview = await call('preview_invoice', INVOICE)
    agent.fail('ghostSuccess', { action: 'createInvoice' })

    const created = await call('create_invoice', {
      ...INVOICE,
      confirmation: preview.data.confirmation,
    })

    expect(created).toMatchObject({
      isError: false,
      data: { created: true, number: 'KASSZA-2026-1' },
    })
    expect(created.text).toContain('visszakereste')
    expect(agent.invoices.size).toBe(1)
  })

  test('a Számlázz.hu üzleti hibáját tippel együtt eszközhibaként adja vissza', async () => {
    const { call, agent } = mcpHarness({ allowWrite: true })
    const preview = await call('preview_invoice', INVOICE)
    agent.fail('maintenance', { action: 'createInvoice' })

    const result = await call('create_invoice', {
      ...INVOICE,
      confirmation: preview.data.confirmation,
    })

    expect(result.isError).toBe(true)
    expect(result.text).toContain('[1]')
    expect(result.text).toContain('Tipp:')
  })

  test('díjbekérő előnézete és kiállítása', async () => {
    const { call } = mcpHarness({ allowWrite: true })
    const input = { ...INVOICE, type: 'proforma' }
    const preview = await call('preview_invoice', input)

    const created = await call('create_invoice', {
      ...input,
      confirmation: preview.data.confirmation,
    })

    expect(preview.text).toContain('Díjbekérő előnézete')
    expect(created.data).toMatchObject({ created: true, number: 'D-KASSZA-2026-1' })
  })
})

describe('MCP eszközök: nyugta', () => {
  test('rendelésszám nélkül hívásazonosítóval állít ki, ismétlésnél nem duplikál', async () => {
    const { call, agent } = mcpHarness({ allowWrite: true })
    const preview = await call('preview_receipt', RECEIPT)
    const args = { ...RECEIPT, confirmation: preview.data.confirmation }

    const created = await call('create_receipt', args)
    const again = await call('create_receipt', args)

    expect(preview.data).toMatchObject({
      document: 'receipt',
      prefix: 'NYGT',
      paymentMethod: 'készpénz',
      totals: { grossAmount: 1780 },
    })
    expect(created.data).toMatchObject({
      created: true,
      number: 'NYGT-2026-1',
      callId: expect.stringMatching(/^MCP-[0-9A-F]{20}$/),
    })
    expect(again).toMatchObject({ isError: true, text: expect.stringContaining('ma már készült') })
    expect(agent.receipts.size).toBe(1)
  })

  test('rendelésszámmal egy rendeléshez egy nyugta készül', async () => {
    const { call, agent } = mcpHarness({ allowWrite: true })
    const input = { ...RECEIPT, orderNumber: 'WEB-7', paymentMethod: 'bankkártya' }
    const first = await call('preview_receipt', input)
    await call('create_receipt', { ...input, confirmation: first.data.confirmation })
    const changed = { ...input, comment: 'Második próba' }
    const second = await call('preview_receipt', changed)

    const result = await call('create_receipt', {
      ...changed,
      confirmation: second.data.confirmation,
    })

    expect(result).toMatchObject({
      isError: false,
      data: { created: false, number: 'NYGT-2026-1' },
    })
    expect(agent.receipts.size).toBe(1)
  })

  test('a forintos kerekítési és kifizetési hibát már az előnézet jelzi', async () => {
    const { call } = mcpHarness({ allowWrite: true })

    const result = await call('preview_receipt', {
      ...RECEIPT,
      payments: [{ method: 'készpénz', amount: 1000 }],
    })

    expect(result).toMatchObject({ isError: true, text: expect.stringContaining('340') })
  })
})

describe('MCP eszközök: sztornó', () => {
  test('számla sztornója előnézettel, ismétléskor nem sztornóz újra', async () => {
    const { call, agent } = mcpHarness({ allowWrite: true })
    const invoicePreview = await call('preview_invoice', INVOICE)
    const invoice = await call('create_invoice', {
      ...INVOICE,
      confirmation: invoicePreview.data.confirmation,
    })
    const number = invoice.data.number

    const preview = await call('preview_reversal', { document: 'invoice', number })
    const reversal = await call('reverse_invoice', {
      invoiceNumber: number,
      confirmation: preview.data.confirmation,
    })
    const again = await call('reverse_invoice', {
      invoiceNumber: number,
      confirmation: preview.data.confirmation,
    })
    const previewAgain = await call('preview_reversal', { document: 'invoice', number })

    expect(preview.data).toMatchObject({ document: 'invoice', number, grossTotal: 76_200 })
    expect(reversal.data).toMatchObject({ created: true, number: 'KASSZA-2026-2' })
    expect(again.data).toMatchObject({ created: false, number: 'KASSZA-2026-2' })
    expect(previewAgain).toMatchObject({
      isError: true,
      text: expect.stringContaining('már sztornózták'),
    })
    expect(agent.invoices.get(String(number))?.reversed).toBe(true)
  })

  test('díjbekérőt és sztornó számlát nem enged sztornózni', async () => {
    const { call } = mcpHarness({ allowWrite: true })
    const input = { ...INVOICE, type: 'proforma' }
    const preview = await call('preview_invoice', input)
    const proforma = await call('create_invoice', {
      ...input,
      confirmation: preview.data.confirmation,
    })

    const result = await call('preview_reversal', {
      document: 'invoice',
      number: proforma.data.number,
    })

    expect(result).toMatchObject({ isError: true, text: expect.stringContaining('díjbekérő') })
  })

  test('a sztornó megerősítő kódja csak ugyanarra a bizonylatra érvényes', async () => {
    const { call } = mcpHarness({ allowWrite: true })
    const invoicePreview = await call('preview_invoice', INVOICE)
    const invoice = await call('create_invoice', {
      ...INVOICE,
      confirmation: invoicePreview.data.confirmation,
    })
    const preview = await call('preview_reversal', {
      document: 'invoice',
      number: invoice.data.number,
    })

    const other = await call('reverse_invoice', {
      invoiceNumber: 'KASSZA-2026-99',
      confirmation: preview.data.confirmation,
    })

    expect(other).toMatchObject({ isError: true, text: expect.stringContaining('eltérnek') })
  })

  test('nyugta sztornója, majd újbóli kérésre nem sztornóz újra', async () => {
    const { call, agent } = mcpHarness({ allowWrite: true })
    const receiptPreview = await call('preview_receipt', RECEIPT)
    const receipt = await call('create_receipt', {
      ...RECEIPT,
      confirmation: receiptPreview.data.confirmation,
    })
    const number = receipt.data.number

    const preview = await call('preview_reversal', { document: 'receipt', number })
    const reversal = await call('reverse_receipt', {
      receiptNumber: number,
      confirmation: preview.data.confirmation,
    })
    const again = await call('reverse_receipt', {
      receiptNumber: number,
      confirmation: preview.data.confirmation,
    })
    const sn = await call('preview_reversal', { document: 'receipt', number: 'NYGT-2026-2' })

    expect(reversal.data).toMatchObject({ created: true, number: 'NYGT-2026-2' })
    expect(again.data).toMatchObject({ created: false })
    expect(sn).toMatchObject({ isError: true, text: expect.stringContaining('sztornónyugta') })
    expect(agent.receipts.get('NYGT-2026-2')?.type).toBe('SN')
  })

  test('a nyugtasztornó elveszett válasza után az újrapróbálás nem duplikál', async () => {
    const { call, agent } = mcpHarness({ allowWrite: true })
    const receiptPreview = await call('preview_receipt', RECEIPT)
    const receipt = await call('create_receipt', {
      ...RECEIPT,
      confirmation: receiptPreview.data.confirmation,
    })
    const preview = await call('preview_reversal', {
      document: 'receipt',
      number: receipt.data.number,
    })
    agent.fail('ghostSuccess', { action: 'reverseReceipt' })

    const reversal = await call('reverse_receipt', {
      receiptNumber: receipt.data.number,
      confirmation: preview.data.confirmation,
    })

    expect(reversal).toMatchObject({ isError: false, data: { created: false } })
    expect(agent.receipts.size).toBe(2)
  })

  test('ismeretlen dokumentumfajtára eszközhibát ad', async () => {
    const { call } = mcpHarness()

    const result = await call('preview_reversal', { document: 'szamla', number: 'X-1' })
    const missing = await call('preview_reversal', { number: 'X-1' })

    expect(result).toMatchObject({
      isError: true,
      text: expect.stringContaining('invoice, receipt'),
    })
    expect(missing).toMatchObject({ isError: true, text: expect.stringContaining('document') })
  })
})

describe('MCP eszközök: lekérdezések', () => {
  test('számlát számlaszám, rendelésszám és külső azonosító alapján is megtalál', async () => {
    const { call } = mcpHarness({ allowWrite: true })
    const input = { ...INVOICE, orderNumber: 'WEB-1', externalId: 'CRM-1' }
    const preview = await call('preview_invoice', input)
    await call('create_invoice', { ...input, confirmation: preview.data.confirmation })

    const byNumber = await call('get_invoice', { invoiceNumber: 'KASSZA-2026-1' })
    const byOrder = await call('get_invoice', { orderNumber: 'WEB-1' })
    const byExternal = await call('get_invoice', { externalId: 'CRM-1' })
    const missing = await call('get_invoice', { invoiceNumber: 'NINCS-1' })
    const ambiguous = await call('get_invoice', { invoiceNumber: 'A', orderNumber: 'B' })

    for (const result of [byNumber, byOrder, byExternal]) {
      expect(result.data).toMatchObject({
        found: true,
        invoice: { header: { number: 'KASSZA-2026-1', type: 'invoice' } },
      })
    }
    expect(byNumber.text).toContain('Számla KASSZA-2026-1: Példa Kft.')
    expect(missing).toMatchObject({ isError: false, data: { found: false } })
    expect(ambiguous).toMatchObject({
      isError: true,
      text: expect.stringContaining('Pontosan egyet'),
    })
  })

  test('nyugtát nyugtaszám és rendelésszám alapján kér le, PDF nélkül', async () => {
    const { call, agent } = mcpHarness({ allowWrite: true })
    const input = { ...RECEIPT, orderNumber: 'WEB-3' }
    const preview = await call('preview_receipt', input)
    await call('create_receipt', { ...input, confirmation: preview.data.confirmation })

    const byNumber = await call('get_receipt', { receiptNumber: 'NYGT-2026-1' })
    const byOrder = await call('get_receipt', { orderNumber: 'WEB-3' })
    const missing = await call('get_receipt', { receiptNumber: 'NYGT-2026-9' })

    expect(byNumber.data).toMatchObject({ found: true, receipt: { number: 'NYGT-2026-1' } })
    expect(byOrder.data).toMatchObject({ found: true, receipt: { orderNumber: 'WEB-3' } })
    expect(JSON.stringify(byNumber.data)).not.toContain('"pdf"')
    expect(missing.data).toEqual({ found: false })
    expect(agent.requests.at(-1)?.xml).toContain('<pdfLetoltes>false</pdfLetoltes>')
  })

  test('adószám-ellenőrzés érvényes és érvénytelen adószámra', async () => {
    const { call } = mcpHarness(
      {},
      {
        taxpayers: {
          '12345678': {
            name: 'PÉLDA KORLÁTOLT FELELŐSSÉGŰ TÁRSASÁG',
            vatCode: '2',
            countyCode: '42',
            address: {
              postalCode: '1111',
              city: 'BUDAPEST',
              streetName: 'FŐ',
              publicPlaceCategory: 'UTCA',
              number: '1',
            },
          },
        },
      },
    )

    const valid = await call('query_taxpayer', { taxNumber: '12345678-2-42' })
    const invalid = await call('query_taxpayer', { taxNumber: '87654321' })
    const malformed = await call('query_taxpayer', { taxNumber: 'abc' })

    expect(valid.text).toContain('PÉLDA KORLÁTOLT FELELŐSSÉGŰ TÁRSASÁG (12345678-2-42)')
    expect(valid.text).toContain('Székhely: 1111 Budapest, Fő utca 1.')
    expect(valid.data).toMatchObject({ valid: true, taxNumber: { taxpayerId: '12345678' } })
    expect(invalid).toMatchObject({ isError: false, data: { valid: false } })
    expect(malformed.isError).toBe(true)
  })

  test('napi NAV-összesítő sorozat-tartományból, hiányzó és tesztnyugták jelzésével', async () => {
    const { call } = mcpHarness({ allowWrite: true }, { testAccount: false })
    for (const gross of [890, 1200]) {
      const input = { items: [{ name: 'Termék', grossUnitPrice: gross, vat: 27 }] }
      const preview = await call('preview_receipt', input)
      await call('create_receipt', { ...input, confirmation: preview.data.confirmation })
    }
    const reversalPreview = await call('preview_reversal', {
      document: 'receipt',
      number: 'NYGT-2026-1',
    })
    await call('reverse_receipt', {
      receiptNumber: 'NYGT-2026-1',
      confirmation: reversalPreview.data.confirmation,
    })

    const summary = await call('nav_daily_summary', { series: 'NYGT-2026', from: 1, to: 4 })

    expect(summary.isError).toBe(false)
    expect(summary.data).toMatchObject({
      receiptCount: 3,
      missing: ['NYGT-2026-4'],
      reports: [
        {
          applicableDate: '2026-10-02',
          series: 'NYGT-2026',
          serialNumber: 'NYGT-2026-1',
          numberOfSaleDocument: 2,
          numberOfModifyingDocument: 1,
          total: 1200,
          vatCategories: [{ vat: '27%', saleDocument: 2090, modifyingDocument: -890 }],
        },
      ],
    })
    expect(summary.text).toContain('Tárgynap: 2026-10-02')
    expect(summary.text).toContain('Nem található nyugták: NYGT-2026-4')
  })

  test('tesztfiók nyugtáit alapból kihagyja az összesítőből', async () => {
    const { call } = mcpHarness({ allowWrite: true })
    const preview = await call('preview_receipt', RECEIPT)
    await call('create_receipt', { ...RECEIPT, confirmation: preview.data.confirmation })

    const skipped = await call('nav_daily_summary', { receiptNumbers: ['NYGT-2026-1'] })
    const included = await call('nav_daily_summary', {
      receiptNumbers: ['NYGT-2026-1', 'NYGT-2026-1'],
      includeTest: true,
    })

    expect(skipped.text).toContain('1 tesztfiókos nyugtát kihagytam')
    expect(skipped.data).toMatchObject({ reports: [] })
    expect(included.data).toMatchObject({ receiptCount: 1, reports: [{ total: 1780 }] })
  })

  test('hibás összesítő-paraméterekre eszközhibát ad', async () => {
    const { call } = mcpHarness()

    const none = await call('nav_daily_summary', {})
    const both = await call('nav_daily_summary', { receiptNumbers: ['A-1'], series: 'A' })
    const reversed = await call('nav_daily_summary', { series: 'A', from: 5, to: 2 })
    const tooMany = await call('nav_daily_summary', { series: 'A', from: 1, to: 201 })
    const badEntry = await call('nav_daily_summary', { receiptNumbers: [''] })

    for (const result of [none, both, reversed, tooMany, badEntry]) {
      expect(result.isError).toBe(true)
    }
    expect(tooMany.text).toContain('201')
  })
})

describe('MCP eszközök: bemenet-ellenőrzés és konfiguráció', () => {
  test.each([
    [{ ...INVOICE, color: 'kék' }, 'Ismeretlen mező a bemenetben: color'],
    [{ ...INVOICE, buyer: { ...BUYER, phone: '1' } }, 'buyer objektumban: phone'],
    [{ ...INVOICE, items: [] }, 'items tömbben 1 és 100'],
    [{ ...INVOICE, items: [{ name: 'A', vat: 27 }] }, 'pontosan az egyiket'],
    [{ ...INVOICE, items: [{ name: 'A', vat: 33, netUnitPrice: 1 }] }, 'Ismeretlen áfakulcs'],
    [{ ...INVOICE, issueDate: '2026.10.02' }, 'ÉÉÉÉ-HH-NN'],
    [{ ...INVOICE, paid: 'igen' }, 'true vagy false'],
    [{ ...INVOICE, type: 'storno' }, 'Lehetséges értékek: invoice, proforma'],
    [{ ...INVOICE, buyer: 'Példa' }, 'buyer mezőnek objektumnak'],
    [{ ...INVOICE, currency: 7 }, 'szövegnek'],
    [{ ...INVOICE, exchangeRate: '400' }, 'véges számnak'],
  ])('hibás számlabemenetre érthető eszközhibát ad (%#)', async (args, message) => {
    const { call } = mcpHarness()

    const result = await call('preview_invoice', args)

    expect(result).toMatchObject({ isError: true, text: expect.stringContaining(message) })
  })

  test('a szövegként küldött áfakulcsot és a kódokat is elfogadja', async () => {
    const { call } = mcpHarness()

    const result = await call('preview_receipt', {
      items: [
        { name: 'A', grossUnitPrice: 100, vat: '27' },
        { name: 'B', grossUnitPrice: 100, vat: 'AAM' },
        { name: 'C', grossUnitPrice: 100, vat: 'ÁKK' },
      ],
    })

    expect(result.isError).toBe(false)
    expect(result.data).toMatchObject({ items: [{ vat: 27 }, { vat: 'AAM' }, { vat: 'ÁKK' }] })
  })

  test('Agent kulcs nélkül az olvasó eszköz a beállítási hibát adja vissza', async () => {
    vi.stubEnv('SZAMLAZZ_AGENT_KEY', '')
    const connection = createKasszaMcpServer({ now: FAKE_NOW }).connect()
    const call = (name: string, args: Record<string, unknown>) =>
      connection.handle({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args, _meta: MODERN_META },
      })

    const lookup = await call('get_invoice', { invoiceNumber: 'KASSZA-2026-1' })
    const preview = await call('preview_invoice', INVOICE)

    expect(lookup).toMatchObject({
      result: { isError: true, content: [{ text: expect.stringContaining('Agent kulcs') }] },
    })
    expect(preview).toMatchObject({ result: { isError: false } })
  })
})
