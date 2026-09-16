import { describe, expect, test } from 'vitest'
import {
  createTestContext,
  FAKE_PDF_BYTES,
  invoiceXmlResponse,
  TEST_AGENT_KEY,
  textErrorResponse,
} from '../../tests/helpers'
import { canValidateXsd, validateAgainstXsd } from '../../tests/xsd'
import { bytesToBase64 } from '../core/binary'
import { el } from '../core/xml/serialize'
import { buildInvoicePdfXml, getInvoicePdf } from './pdf'

const CREDENTIALS = [el('szamlaagentkulcs', TEST_AGENT_KEY)]

const SUCCESS_XML = invoiceXmlResponse(
  [
    '<sikeres>true</sikeres>',
    '<szamlaszam>XXX-2012-3</szamlaszam>',
    '<szamlanetto>30000</szamlanetto>',
    '<szamlabrutto>38100</szamlabrutto>',
    `<pdf>${bytesToBase64(FAKE_PDF_BYTES).replace(/(.{8})/g, '$1\n')}</pdf>`,
  ].join('\n'),
)

describe('buildInvoicePdfXml', () => {
  test('számlaszám alapján az XSD sorrendjében építi a kérést', () => {
    const xml = buildInvoicePdfXml(CREDENTIALS, 'E-TST-2026-1')

    expect(xml).toContain('<szamlaszam>E-TST-2026-1</szamlaszam>')
    expect(xml.indexOf('<szamlaszam>')).toBeLessThan(xml.indexOf('<valaszVerzio>2</valaszVerzio>'))
    expect(xml).not.toContain('<beallitasok>')
  })

  test('rendelésszám és külső azonosító alapján is épít kérést', () => {
    expect(buildInvoicePdfXml(CREDENTIALS, { orderNumber: 'R-1' })).toContain(
      '<rendelesSzam>R-1</rendelesSzam>',
    )
    const byExternalId = buildInvoicePdfXml(CREDENTIALS, { externalId: 'ext-1' })
    expect(byExternalId).toContain('<szamlaKulsoAzon>ext-1</szamlaKulsoAzon>')
    expect(byExternalId).not.toContain('<szamlaszam>')
  })
})

describe.skipIf(!canValidateXsd('agentpdf/xmlszamlapdf.xsd'))('PDF lekérés XSD szerződés', () => {
  test.each([
    ['számlaszám', 'E-1'],
    ['rendelésszám', { orderNumber: 'R-1' }],
    ['külső azonosító', { externalId: 'ext-1' }],
  ] as const)('a(z) %s alapú kérés megfelel az XSD-nek', (_label, reference) => {
    const xml = buildInvoicePdfXml(CREDENTIALS, reference)
    expect(validateAgainstXsd(xml, 'agentpdf/xmlszamlapdf.xsd')).toEqual([])
  })
})

describe('getInvoicePdf', () => {
  test('az XML válaszból dekódolja a base64 PDF-et', async () => {
    const { ctx, agent } = createTestContext(SUCCESS_XML)

    const result = await getInvoicePdf(ctx, 'XXX-2012-3')

    expect(agent.lastCall().field).toBe('action-szamla_agent_pdf')
    expect(result).toEqual({
      pdf: FAKE_PDF_BYTES,
      number: 'XXX-2012-3',
      netTotal: 30000,
      grossTotal: 38100,
      outstanding: undefined,
      buyerAccountUrl: undefined,
    })
  })

  test('a nyers PDF választ is elfogadja', async () => {
    const { ctx } = createTestContext({
      headers: { szlahu_szamlaszam: 'E-1', szlahu_bruttovegosszeg: '1270' },
      body: FAKE_PDF_BYTES,
    })

    await expect(getInvoicePdf(ctx, 'E-1')).resolves.toMatchObject({
      pdf: FAKE_PDF_BYTES,
      number: 'E-1',
      grossTotal: 1270,
    })
  })

  test('PDF nélküli sikeres válaszra unexpected_response hibát dob', async () => {
    const { ctx } = createTestContext(
      invoiceXmlResponse('<sikeres>true</sikeres><szamlaszam>E-1</szamlaszam>'),
    )

    await expect(getInvoicePdf(ctx, 'E-1')).rejects.toMatchObject({
      category: 'unexpected_response',
    })
  })

  test('érvénytelen base64 PDF-re unexpected_response hibát dob', async () => {
    const { ctx } = createTestContext(invoiceXmlResponse('<sikeres>true</sikeres><pdf>A</pdf>'))

    await expect(getInvoicePdf(ctx, 'E-1')).rejects.toMatchObject({
      category: 'unexpected_response',
    })
  })

  test('a 7-es kódot not_found hibaként adja vissza', async () => {
    const { ctx } = createTestContext(
      invoiceXmlResponse(
        '<sikeres>false</sikeres><hibakod>7</hibakod><hibauzenet>Hiányzó adat: számla xml</hibauzenet>',
      ),
    )

    const error = await getInvoicePdf(ctx, 'NINCS-1').catch((caught: unknown) => caught)

    expect(error).toMatchObject({ code: 7, category: 'not_found', isNotFound: true })
  })

  test('az [ERR] szöveges hibát és a fejléc hibát is kezeli', async () => {
    const text = createTestContext({ body: '[ERR] Sikertelen bejelentkezés ---------- x' })
    const header = createTestContext(textErrorResponse('Hiányzó adat', 7))

    await expect(getInvoicePdf(text.ctx, 'E-1')).rejects.toThrow('Sikertelen bejelentkezés')
    await expect(getInvoicePdf(header.ctx, 'E-1')).rejects.toMatchObject({ category: 'not_found' })
  })

  test('hálózati hiba után újrapróbál, mert a lekérdezés biztonságos', async () => {
    const { ctx, agent } = createTestContext([new TypeError('fetch failed'), SUCCESS_XML])

    await expect(getInvoicePdf(ctx, 'E-1')).resolves.toMatchObject({ number: 'XXX-2012-3' })
    expect(agent.calls).toHaveLength(2)
  })

  test('más gyökérelemű XML-re unexpected_response hibát dob', async () => {
    const { ctx } = createTestContext({
      body: '<?xml version="1.0"?><valami><sikeres>true</sikeres></valami>',
    })

    await expect(getInvoicePdf(ctx, 'E-1')).rejects.toMatchObject({
      category: 'unexpected_response',
    })
  })
})
