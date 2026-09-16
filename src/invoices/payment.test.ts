import { describe, expect, test, vi } from 'vitest'
import {
  createTestContext,
  invoiceXmlResponse,
  TEST_AGENT_KEY,
  textErrorResponse,
} from '../../tests/helpers'
import { canValidateXsd, validateAgainstXsd } from '../../tests/xsd'
import { el } from '../core/xml/serialize'
import {
  buildClearPaymentsXml,
  buildRegisterPaymentXml,
  clearPayments,
  type PaymentEntry,
  registerPayment,
} from './payment'

const CREDENTIALS = [el('szamlaagentkulcs', TEST_AGENT_KEY)]

const FULL_INPUT = {
  invoiceNumber: 'E-TST-2026-1',
  taxNumber: '12345678-1-13',
  additive: false,
  payments: [
    { date: '2026-09-01', method: 'készpénz', amount: 1000 },
    {
      date: new Date('2026-09-15T23:30:00Z'),
      method: 'átutalás',
      amount: 2000.5,
      description: 'Minta',
    },
  ],
} as const

const SUCCESS_XML = invoiceXmlResponse(
  [
    '<sikeres>true</sikeres>',
    '<szamlaszam>E-TST-2026-1</szamlaszam>',
    '<szamlanetto>30000</szamlanetto>',
    '<szamlabrutto>38100</szamlabrutto>',
    '<kintlevoseg>0</kintlevoseg>',
    '<vevoifiokurl>https://www.szamlazz.hu/szamla/?page=vevoifiokpay</vevoifiokurl>',
  ].join('\n'),
)

describe('buildRegisterPaymentXml', () => {
  test('az egyszerűsített formát additív, mai dátumú átutalásként írja', () => {
    vi.useFakeTimers({ now: new Date('2026-09-15T22:30:00Z') })
    try {
      const xml = buildRegisterPaymentXml(CREDENTIALS, { invoiceNumber: 'E-1', amount: 38100 })

      expect(xml).toContain('<additiv>true</additiv>')
      expect(xml).toContain('<datum>2026-09-16</datum>')
      expect(xml).toContain('<jogcim>átutalás</jogcim>')
      expect(xml).toContain('<osszeg>38100</osszeg>')
      expect(xml).not.toContain('<adoszam>')
    } finally {
      vi.useRealTimers()
    }
  })

  test('a teljes inputot a megadott sorrendben írja', () => {
    const xml = buildRegisterPaymentXml(CREDENTIALS, FULL_INPUT)

    expect(xml).toContain('<adoszam>12345678-1-13</adoszam>')
    expect(xml).toContain('<additiv>false</additiv>')
    expect(xml).toContain('<datum>2026-09-16</datum>')
    expect(xml).toContain('<osszeg>2000.5</osszeg>')
    expect(xml).toContain('<leiras>Minta</leiras>')
    expect(xml.match(/<kifizetes>/g)).toHaveLength(2)
  })

  test('üres befizetéslistára a clearPayments-re utaló hibát dob', () => {
    expect(() =>
      buildRegisterPaymentXml(CREDENTIALS, { invoiceNumber: 'E-1', payments: [] }),
    ).toThrow(/clearPayments/)
  })

  test('ötnél több befizetésre validációs hibát dob', () => {
    const payment: PaymentEntry = { method: 'kp', amount: 1 }
    expect(() =>
      buildRegisterPaymentXml(CREDENTIALS, {
        invoiceNumber: 'E-1',
        payments: Array.from({ length: 6 }, () => payment),
      }),
    ).toThrow(/legfeljebb 5/)
  })

  test('hiányzó számlaszámra, módra, összegre és hibás dátumra validációs hibát dob', () => {
    const cases = [
      { invoiceNumber: '', amount: 1 },
      { invoiceNumber: 'E-1', payments: [{ method: ' ', amount: 1 }] },
      { invoiceNumber: 'E-1', amount: Number.NaN },
      { invoiceNumber: 'E-1', amount: 1, date: '2026-13-01' },
    ]
    for (const input of cases) {
      expect(() => buildRegisterPaymentXml(CREDENTIALS, input)).toThrow(
        expect.objectContaining({ category: 'validation' }),
      )
    }
  })
})

describe('buildClearPaymentsXml', () => {
  test('kifizetés nélküli, felülíró kérést épít', () => {
    const xml = buildClearPaymentsXml(CREDENTIALS, { invoiceNumber: 'E-1', taxNumber: '1-1-1' })

    expect(xml).toContain('<additiv>false</additiv>')
    expect(xml).toContain('<adoszam>1-1-1</adoszam>')
    expect(xml).not.toContain('<kifizetes>')
  })
})

describe.skipIf(!canValidateXsd('agentkifiz/xmlszamlakifiz.xsd'))('befizetés XSD szerződés', () => {
  test('a minimális kérés megfelel az XSD-nek', () => {
    const xml = buildRegisterPaymentXml(CREDENTIALS, { invoiceNumber: 'E-1', amount: 100 })
    expect(validateAgainstXsd(xml, 'agentkifiz/xmlszamlakifiz.xsd')).toEqual([])
  })

  test('a teljes kérés megfelel az XSD-nek', () => {
    const xml = buildRegisterPaymentXml(CREDENTIALS, FULL_INPUT)
    expect(validateAgainstXsd(xml, 'agentkifiz/xmlszamlakifiz.xsd')).toEqual([])
  })

  test('az öt befizetéses kérés megfelel az XSD-nek', () => {
    const xml = buildRegisterPaymentXml(CREDENTIALS, {
      invoiceNumber: 'E-1',
      payments: Array.from({ length: 5 }, (_, index) => ({ method: 'kp', amount: index + 1 })),
    })
    expect(validateAgainstXsd(xml, 'agentkifiz/xmlszamlakifiz.xsd')).toEqual([])
  })

  test('a törlő kérés megfelel az XSD-nek', () => {
    const xml = buildClearPaymentsXml(CREDENTIALS, 'E-1')
    expect(validateAgainstXsd(xml, 'agentkifiz/xmlszamlakifiz.xsd')).toEqual([])
  })
})

describe('registerPayment', () => {
  test('XML válaszból kiolvassa a számla egyenlegét', async () => {
    const { ctx, agent } = createTestContext(SUCCESS_XML)

    const result = await registerPayment(ctx, { invoiceNumber: 'E-TST-2026-1', amount: 38100 })

    expect(agent.lastCall().field).toBe('action-szamla_agent_kifiz')
    expect(result).toEqual({
      invoiceNumber: 'E-TST-2026-1',
      netTotal: 30000,
      grossTotal: 38100,
      outstanding: 0,
      buyerAccountUrl: 'https://www.szamlazz.hu/szamla/?page=vevoifiokpay',
    })
  })

  test('a DONE szöveges választ is sikernek veszi, a kért számlaszámmal', async () => {
    const { ctx } = createTestContext({ body: 'xmlagentresponse=DONE' })

    await expect(
      registerPayment(ctx, { invoiceNumber: ' E-1 ', amount: 1, method: 'készpénz' }),
    ).resolves.toMatchObject({ invoiceNumber: 'E-1' })
  })

  test('az [ERR] és a fejléc hibát típusos hibává alakítja', async () => {
    const text = createTestContext({ body: '[ERR] Nincs ilyen számla ---------- x' })
    const header = createTestContext(textErrorResponse('Sikertelen bejelentkezés', 3))

    await expect(registerPayment(text.ctx, { invoiceNumber: 'E-1', amount: 1 })).rejects.toThrow(
      'Nincs ilyen számla',
    )
    await expect(
      registerPayment(header.ctx, { invoiceNumber: 'E-1', amount: 1 }),
    ).rejects.toMatchObject({ code: 3 })
  })

  test('az XML sikertelen választ típusos hibává alakítja', async () => {
    const { ctx } = createTestContext(
      invoiceXmlResponse(
        '<sikeres>false</sikeres><hibakod>3</hibakod><hibauzenet><![CDATA[Bejelentkezési hiba]]></hibauzenet>',
      ),
    )

    await expect(registerPayment(ctx, { invoiceNumber: 'E-1', amount: 1 })).rejects.toMatchObject({
      code: 3,
      category: 'auth',
    })
  })

  test('additív befizetést hálózati hiba után nem küld újra', async () => {
    const { ctx, agent } = createTestContext(new TypeError('fetch failed'), { maxAttempts: 3 })

    await expect(registerPayment(ctx, { invoiceNumber: 'E-1', amount: 1 })).rejects.toThrow()
    expect(agent.calls).toHaveLength(1)
  })

  test('felülíró befizetést hálózati hiba után újrapróbál', async () => {
    const { ctx, agent } = createTestContext([new TypeError('fetch failed'), SUCCESS_XML], {
      maxAttempts: 3,
    })

    await expect(
      registerPayment(ctx, { invoiceNumber: 'E-1', amount: 1, additive: false }),
    ).resolves.toMatchObject({ grossTotal: 38100 })
    expect(agent.calls).toHaveLength(2)
  })

  test('validációs hibánál nem küld kérést', async () => {
    const { ctx, agent } = createTestContext(SUCCESS_XML)

    await expect(
      registerPayment(ctx, { invoiceNumber: 'E-1', payments: [] }),
    ).rejects.toMatchObject({ category: 'validation' })
    expect(agent.calls).toHaveLength(0)
  })
})

describe('clearPayments', () => {
  test('törli a befizetéseket és visszaadja az egyenleget', async () => {
    const { ctx, agent } = createTestContext(SUCCESS_XML)

    await expect(clearPayments(ctx, 'E-TST-2026-1')).resolves.toMatchObject({ outstanding: 0 })
    expect(agent.lastCall().xml).toContain('<additiv>false</additiv>')
    expect(agent.lastCall().xml).not.toContain('<kifizetes>')
  })
})
