import { describe, expect, test } from 'vitest'
import {
  FAKE_PDF_BYTES,
  invoiceXmlResponse,
  type MockHandler,
  mockAgent,
  TEST_AGENT_KEY,
  textErrorResponse,
} from '../tests/helpers'
import { createKassza, type KasszaOptions } from './client'

function kasszaWith(handlers: MockHandler[], options: KasszaOptions = {}) {
  const agent = mockAgent(...handlers)
  const kassza = createKassza({
    agentKey: TEST_AGENT_KEY,
    retryDelayMs: 0,
    ...options,
    fetch: agent.fetch,
  })
  return { kassza, agent }
}

const SUCCESS = invoiceXmlResponse(
  '<sikeres>true</sikeres><szamlaszam>E-TST-2026-1</szamlaszam><szamlanetto>1000</szamlanetto><szamlabrutto>1270</szamlabrutto>',
)

const BUYER = { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' }

describe('createKassza', () => {
  test('minden művelet a saját Agent form mezőjébe küld', async () => {
    const { kassza, agent } = kasszaWith([SUCCESS])

    await kassza.invoices.create({
      buyer: BUYER,
      items: [{ name: 'A', netUnitPrice: 1000, vat: 27 }],
    })
    await kassza.invoices.reverse('E-TST-2026-1').catch(() => undefined)
    await kassza.invoices
      .registerPayment({ invoiceNumber: 'E-TST-2026-1', amount: 1270 })
      .catch(() => undefined)
    await kassza.invoices.clearPayments('E-TST-2026-1').catch(() => undefined)
    await kassza.invoices.getPdf('E-TST-2026-1').catch(() => undefined)
    await kassza.invoices.get('E-TST-2026-1').catch(() => undefined)
    await kassza.invoices.deleteProforma('D-TST-2026-1').catch(() => undefined)
    await kassza.receipts
      .create({
        prefix: 'NY',
        paymentMethod: 'készpénz',
        items: [{ name: 'A', grossUnitPrice: 100, vat: 27 }],
      })
      .catch(() => undefined)
    await kassza.receipts.reverse('NY-2026-1').catch(() => undefined)
    await kassza.receipts.get('NY-2026-1').catch(() => undefined)
    await kassza.receipts
      .send({ receiptNumber: 'NY-2026-1', emails: 'a@b.hu' })
      .catch(() => undefined)
    await kassza.taxpayer.query('13421739').catch(() => undefined)

    expect(agent.calls.map((call) => call.field)).toEqual([
      'action-xmlagentxmlfile',
      'action-szamla_agent_st',
      'action-szamla_agent_kifiz',
      'action-szamla_agent_kifiz',
      'action-szamla_agent_pdf',
      'action-szamla_agent_xml',
      'action-szamla_agent_dijbekero_torlese',
      'action-szamla_agent_nyugta_create',
      'action-szamla_agent_nyugta_storno',
      'action-szamla_agent_nyugta_get',
      'action-szamla_agent_nyugta_send',
      'action-szamla_agent_taxpayer',
    ])
  })

  test('a kliensszintű alapértékeket továbbadja a számlának és a nyugtának', async () => {
    const { kassza, agent } = kasszaWith([SUCCESS, textErrorResponse('x', 57)], {
      defaults: {
        invoice: { prefix: 'WEB', seller: { emailSubject: 'Számlád' } },
        receipt: { prefix: 'NYWEB', paymentMethod: 'bankkártya' },
      },
    })

    await kassza.invoices.create({
      buyer: BUYER,
      items: [{ name: 'A', netUnitPrice: 1000, vat: 27 }],
    })
    await kassza.receipts
      .create({ items: [{ name: 'A', grossUnitPrice: 100, vat: 27 }] })
      .catch(() => undefined)

    expect(agent.calls[0]?.xml).toContain('<szamlaszamElotag>WEB</szamlaszamElotag>')
    expect(agent.calls[0]?.xml).toContain('<emailTargy>Számlád</emailTargy>')
    expect(agent.calls[1]?.xml).toContain('<elotag>NYWEB</elotag>')
    expect(agent.calls[1]?.xml).toContain('<fizmod>bankkártya</fizmod>')
  })

  test('a find null-t ad, ha a bizonylat nem létezik, más hibát továbbdob', async () => {
    const { kassza } = kasszaWith([
      { headers: { szlahu_error_code: '7' } },
      textErrorResponse('A nyugtaszám nem létezik.', 339),
      textErrorResponse('Sikertelen bejelentkezés', 3),
    ])

    await expect(kassza.invoices.find({ orderNumber: 'NINCS-1' })).resolves.toBeNull()
    await expect(kassza.receipts.find('NY-NINCS-1')).resolves.toBeNull()
    await expect(kassza.invoices.find('E-1')).rejects.toMatchObject({ category: 'auth' })
  })

  test('a verifyCredentials a hitelesítési hibát false-ként, a nem találtat true-ként adja', async () => {
    const valid = kasszaWith([{ headers: { szlahu_error_code: '7' } }])
    const invalid = kasszaWith([textErrorResponse('Sikertelen bejelentkezés', 3)])
    const broken = kasszaWith([textErrorResponse('Lejárt előfizetés', 136)])
    const pdf = kasszaWith([{ body: FAKE_PDF_BYTES }])

    await expect(valid.kassza.verifyCredentials()).resolves.toBe(true)
    await expect(invalid.kassza.verifyCredentials()).resolves.toBe(false)
    await expect(broken.kassza.verifyCredentials()).rejects.toMatchObject({ code: 136 })
    await expect(pdf.kassza.verifyCredentials()).resolves.toBe(true)
  })

  test('a resetSession után cookie nélkül küld', async () => {
    const { kassza, agent } = kasszaWith([
      { headers: { 'set-cookie': 'JSESSIONID=abc' }, body: FAKE_PDF_BYTES },
      { body: FAKE_PDF_BYTES },
    ])

    await kassza.invoices.getPdf('E-1')
    await kassza.resetSession()
    await kassza.invoices.getPdf('E-1')

    expect(agent.calls[1]?.cookie).toBeNull()
  })
})
