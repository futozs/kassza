import { describe, expect, test } from 'vitest'
import {
  invoiceXmlResponse,
  type MockHandler,
  type MockResponse,
  mockAgent,
  TEST_AGENT_KEY,
  textErrorResponse,
} from '../../tests/helpers'
import { createKassza } from '../client'
import { SzamlazzError } from '../core/errors'
import { createInvoiceOnce, invoiceOnceExternalId } from './create-once'

const BUYER = { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' }
const ITEMS = [{ name: 'Termék', grossUnitPrice: 12_700, vat: 27 as const }]
const NOT_FOUND: MockResponse = { headers: { szlahu_error_code: '7' } }
const CREATED = invoiceXmlResponse(
  '<sikeres>true</sikeres><szamlaszam>E-TST-2026-1</szamlaszam><szamlanetto>10000</szamlanetto><szamlabrutto>12700</szamlabrutto>',
)

function existing(number: string, typeCode = 'SZ', orderNumber = 'ORDER-1'): MockResponse {
  return {
    headers: { 'content-type': 'application/xml; charset=UTF-8' },
    body: `<?xml version="1.0" encoding="UTF-8"?>
<szamla xmlns="http://www.szamlazz.hu/szamla">
  <szallito><id>1</id><nev>Eladó Kft.</nev><adoszam>12345678-2-41</adoszam></szallito>
  <alap>
    <id>9</id>
    <szamlaszam>${number}</szamlaszam>
    <tipus>${typeCode}</tipus>
    <eszamla>1</eszamla>
    <kelt>2026-10-01</kelt>
    <rendelesszam>${orderNumber}</rendelesszam>
  </alap>
  <vevo><nev>Vevő Kft.</nev></vevo>
  <osszegek><totalossz><netto>10000</netto><afa>2700</afa><brutto>12700</brutto></totalossz></osszegek>
</szamla>`,
  }
}

function kasszaWith(...handlers: MockHandler[]) {
  const agent = mockAgent(...handlers)
  const kassza = createKassza({ agentKey: TEST_AGENT_KEY, retryDelayMs: 0, fetch: agent.fetch })
  return { kassza, agent }
}

describe('invoiceOnceExternalId', () => {
  test('számlánál a rendelésszám, más bizonylatnál típusjelöléssel', () => {
    expect(invoiceOnceExternalId('invoice', 'R-1')).toBe('R-1')
    expect(invoiceOnceExternalId('proforma', 'R-1')).toBe('R-1/D')
    expect(invoiceOnceExternalId('advance', 'R-1')).toBe('R-1/E')
    expect(invoiceOnceExternalId('final', 'R-1')).toBe('R-1/V')
    expect(invoiceOnceExternalId('corrective', 'R-1')).toBe('R-1/H')
    expect(invoiceOnceExternalId('deliveryNote', 'R-1')).toBe('R-1/SZL')
  })
})

describe('invoices.createOnce', () => {
  test('rendelésszám nélkül validációs hibát dob, és nem küld kérést', async () => {
    const { kassza, agent } = kasszaWith(CREATED)

    await expect(kassza.invoices.createOnce({ buyer: BUYER, items: ITEMS })).rejects.toMatchObject({
      category: 'validation',
    })
    await expect(
      kassza.invoices.createOnce({ buyer: BUYER, items: ITEMS, orderNumber: '  ' }),
    ).rejects.toMatchObject({ category: 'validation' })
    expect(agent.calls).toHaveLength(0)
  })

  test('külső azonosítóval, majd rendelésszámmal keres, és ha nincs, a külső azonosítóval hozza létre', async () => {
    const { kassza, agent } = kasszaWith(NOT_FOUND, NOT_FOUND, CREATED)

    const result = await kassza.invoices.createOnce({
      buyer: BUYER,
      items: ITEMS,
      orderNumber: 'ORDER-1',
    })

    expect(result).toMatchObject({ number: 'E-TST-2026-1', created: true, externalId: 'ORDER-1' })
    expect(result.invoice?.grossTotal).toBe(12_700)
    expect(agent.calls.map((call) => call.field)).toEqual([
      'action-szamla_agent_xml',
      'action-szamla_agent_xml',
      'action-xmlagentxmlfile',
    ])
    expect(agent.calls[0]?.xml).toContain('<szamlaKulsoAzon>ORDER-1</szamlaKulsoAzon>')
    expect(agent.calls[1]?.xml).toContain('<rendelesSzam>ORDER-1</rendelesSzam>')
    expect(agent.calls[2]?.xml).toContain('<szamlaKulsoAzon>ORDER-1</szamlaKulsoAzon>')
    expect(agent.calls[2]?.xml).toContain('<rendelesSzam>ORDER-1</rendelesSzam>')
  })

  test('ha a külső azonosítóval már létezik, nem hoz létre újat', async () => {
    const { kassza, agent } = kasszaWith(existing('E-TST-2026-7'))

    const result = await kassza.invoices.createOnce({
      buyer: BUYER,
      items: ITEMS,
      orderNumber: 'ORDER-1',
    })

    expect(result).toMatchObject({ number: 'E-TST-2026-7', created: false })
    expect(result.details?.header.type).toBe('invoice')
    expect(agent.calls).toHaveLength(1)
  })

  test('a rendelésszámon talált díjbekérőt nem tekinti a számla meglétének', async () => {
    const { kassza, agent } = kasszaWith(NOT_FOUND, existing('D-TST-2026-1', 'D'), CREATED)

    const result = await kassza.invoices.createOnce({
      buyer: BUYER,
      items: ITEMS,
      orderNumber: 'ORDER-1',
    })

    expect(result.created).toBe(true)
    expect(agent.calls).toHaveLength(3)
  })

  test('a rendelésszámon talált azonos típusú vagy sztornó bizonylatot meglévőnek tekinti', async () => {
    const invoice = kasszaWith(NOT_FOUND, existing('E-TST-2026-3'))
    const reversal = kasszaWith(NOT_FOUND, existing('E-TST-2026-4', 'SS'))

    await expect(
      invoice.kassza.invoices.createOnce({ buyer: BUYER, items: ITEMS, orderNumber: 'ORDER-1' }),
    ).resolves.toMatchObject({ number: 'E-TST-2026-3', created: false })
    await expect(
      reversal.kassza.invoices.createOnce({ buyer: BUYER, items: ITEMS, orderNumber: 'ORDER-1' }),
    ).resolves.toMatchObject({ number: 'E-TST-2026-4', created: false })
  })

  test('díjbekérőnél típusjelölt külső azonosítót használ, és a díjbekérőt meglévőnek tekinti', async () => {
    const { kassza, agent } = kasszaWith(NOT_FOUND, existing('D-TST-2026-2', 'D'))

    const result = await kassza.invoices.createOnce({
      type: 'proforma',
      buyer: BUYER,
      items: ITEMS,
      orderNumber: 'ORDER-1',
    })

    expect(result).toMatchObject({ created: false, externalId: 'ORDER-1/D' })
    expect(agent.calls[0]?.xml).toContain('<szamlaKulsoAzon>ORDER-1/D</szamlaKulsoAzon>')
  })

  test('hálózati hiba után visszakeres, és a megtalált bizonylatot létrehozottnak jelöli', async () => {
    const { kassza, agent } = kasszaWith(
      NOT_FOUND,
      NOT_FOUND,
      new TypeError('fetch failed'),
      existing('E-TST-2026-9'),
    )

    const result = await kassza.invoices.createOnce(
      { buyer: BUYER, items: ITEMS, orderNumber: 'ORDER-1' },
      { recoveryDelayMs: 0 },
    )

    expect(result).toMatchObject({ number: 'E-TST-2026-9', created: true })
    expect(result.details).toBeDefined()
    expect(agent.calls).toHaveLength(4)
  })

  test('duplikált rendelésszám (71) után visszakeres, és nem létrehozottnak jelöli', async () => {
    const { kassza } = kasszaWith(
      NOT_FOUND,
      NOT_FOUND,
      textErrorResponse('Már létező rendelésszám.', 71),
      existing('E-TST-2026-5'),
    )

    const result = await kassza.invoices.createOnce(
      { buyer: BUYER, items: ITEMS, orderNumber: 'ORDER-1' },
      { recoveryDelayMs: 0 },
    )

    expect(result).toMatchObject({ number: 'E-TST-2026-5', created: false })
  })

  test('ha a visszakeresés sem találja, ismeretlen kimenetű hibát ad', async () => {
    const { kassza, agent } = kasszaWith(
      NOT_FOUND,
      NOT_FOUND,
      new TypeError('fetch failed'),
      NOT_FOUND,
    )

    const error = (await kassza.invoices
      .createOnce({ buyer: BUYER, items: ITEMS, orderNumber: 'ORDER-1' }, { recoveryDelayMs: 0 })
      .catch((caught: unknown) => caught)) as SzamlazzError

    expect(error).toMatchObject({ category: 'network' })
    expect(error.details).toMatchObject({ outcome: 'unknown', reference: 'ORDER-1 rendelés' })
    expect(error.hint).toContain('Ne állítsd ki kézzel újra')
    expect(agent.calls).toHaveLength(7)
  })

  test('duplikáltnál, ha a bizonylat nem kereshető vissza, az eredeti hibát adja', async () => {
    const { kassza } = kasszaWith(
      NOT_FOUND,
      NOT_FOUND,
      textErrorResponse('Már létező rendelésszám.', 71),
      NOT_FOUND,
    )

    const error = (await kassza.invoices
      .createOnce({ buyer: BUYER, items: ITEMS, orderNumber: 'ORDER-1' }, { recoveryDelayMs: 0 })
      .catch((caught: unknown) => caught)) as SzamlazzError

    expect(error).toMatchObject({ code: 71, category: 'duplicate' })
    expect(error.details).toBeUndefined()
  })

  test('üzleti hibánál nem keres vissza', async () => {
    const { kassza, agent } = kasszaWith(NOT_FOUND, NOT_FOUND, textErrorResponse('XML hiba', 57))

    await expect(
      kassza.invoices.createOnce({ buyer: BUYER, items: ITEMS, orderNumber: 'ORDER-1' }),
    ).rejects.toMatchObject({ code: 57 })
    expect(agent.calls).toHaveLength(3)
  })

  test('a visszakeresés közbeni hálózati hibát átvészeli; a nem újrapróbálhatónál ismeretlen kimenetet jelez, az okkal', async () => {
    const recovers = kasszaWith(
      NOT_FOUND,
      NOT_FOUND,
      new TypeError('fetch failed'),
      new TypeError('fetch failed'),
      new TypeError('fetch failed'),
      new TypeError('fetch failed'),
      existing('E-TST-2026-6'),
    )
    const fails = kasszaWith(
      NOT_FOUND,
      NOT_FOUND,
      new TypeError('fetch failed'),
      textErrorResponse('Sikertelen bejelentkezés', 3),
    )

    await expect(
      recovers.kassza.invoices.createOnce(
        { buyer: BUYER, items: ITEMS, orderNumber: 'ORDER-1' },
        { recoveryDelayMs: 0 },
      ),
    ).resolves.toMatchObject({ number: 'E-TST-2026-6', created: true })
    await expect(
      fails.kassza.invoices.createOnce(
        { buyer: BUYER, items: ITEMS, orderNumber: 'ORDER-1' },
        { recoveryDelayMs: 0 },
      ),
    ).rejects.toMatchObject({
      category: 'network',
      details: { outcome: 'unknown', lookupError: expect.stringContaining('auth') },
      hint: expect.stringContaining('A visszakeresés is hibát adott'),
    })
  })

  test('lookupFirst: false esetén azonnal létrehoz, a saját externalId-t megtartja', async () => {
    const { kassza, agent } = kasszaWith(CREATED)

    const result = await kassza.invoices.createOnce(
      { buyer: BUYER, items: ITEMS, orderNumber: 'ORDER-1', externalId: 'SAJAT-42' },
      { lookupFirst: false },
    )

    expect(result).toMatchObject({ created: true, externalId: 'SAJAT-42' })
    expect(agent.calls).toHaveLength(1)
    expect(agent.calls[0]?.xml).toContain('<szamlaKulsoAzon>SAJAT-42</szamlaKulsoAzon>')
  })

  test('matchOrderNumber: false esetén csak a külső azonosítóval keres', async () => {
    const { kassza, agent } = kasszaWith(NOT_FOUND, CREATED)

    await kassza.invoices.createOnce(
      { buyer: BUYER, items: ITEMS, orderNumber: 'ORDER-1' },
      { matchOrderNumber: false },
    )

    expect(agent.calls.map((call) => call.field)).toEqual([
      'action-szamla_agent_xml',
      'action-xmlagentxmlfile',
    ])
  })

  test('érvénytelen recoveryDelayMs értékre konfigurációs hibát dob', async () => {
    const { kassza } = kasszaWith(CREATED)

    await expect(
      kassza.invoices.createOnce(
        { buyer: BUYER, items: ITEMS, orderNumber: 'ORDER-1' },
        { recoveryDelayMs: -5 },
      ),
    ).rejects.toMatchObject({ category: 'configuration' })
  })

  test('a megszakítás a visszakeresés előtti várakozást is leállítja', async () => {
    const { kassza } = kasszaWith(NOT_FOUND, NOT_FOUND, new TypeError('fetch failed'))
    const controller = new AbortController()
    const pending = createInvoiceOnce(
      kassza.invoices,
      { buyer: BUYER, items: ITEMS, orderNumber: 'ORDER-1' },
      { recoveryDelayMs: 10_000, signal: controller.signal },
    )
    setTimeout(() => controller.abort(new Error('megszakítva')), 5)

    await expect(pending).rejects.toThrow('megszakítva')
  })

  test('már megszakított jelnél a várakozás azonnal elutasít', async () => {
    const controller = new AbortController()
    const signal = controller.signal
    const api = {
      create: async (): Promise<never> => {
        controller.abort(new Error('már leállítva'))
        throw new SzamlazzError('Hálózati hiba a Számlázz.hu elérésekor.', { category: 'network' })
      },
      find: () => Promise.resolve(null),
    }

    await expect(
      createInvoiceOnce(
        api,
        { buyer: BUYER, items: ITEMS, orderNumber: 'ORDER-1' },
        {
          recoveryDelayMs: 50,
          signal,
        },
      ),
    ).rejects.toThrow('már leállítva')
  })
})
