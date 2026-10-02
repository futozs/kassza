import { describe, expect, test } from 'vitest'
import { type MockHandler, mockAgent, TEST_AGENT_KEY } from '../../tests/helpers'
import { createKassza } from '../client'
import type { SzamlazzError } from '../core/errors'
import { receiptErrorResponse, receiptResponse } from './test-fixtures'

const ITEMS = [{ name: 'Belépő', grossUnitPrice: 4_990, vat: 27 as const }]
const BASE = { prefix: 'NYGT', paymentMethod: 'bankkártya', items: ITEMS }

function receiptXml(number: string, orderNumber: string, callId = orderNumber): MockHandler {
  return receiptResponse(`  <sikeres>true</sikeres>
  <nyugta>
    <alap>
      <id>7</id>
      <hivasAzonosito>${callId}</hivasAzonosito>
      <nyugtaszam>${number}</nyugtaszam>
      <tipus>NY</tipus>
      <stornozott>false</stornozott>
      <kelt>2026-10-02</kelt>
      <fizmod>bankkártya</fizmod>
      <penznem>HUF</penznem>
      <teszt>true</teszt>
      <rendelesSzam>${orderNumber}</rendelesSzam>
    </alap>
    <tetelek>
      <tetel>
        <megnevezes>Belépő</megnevezes>
        <mennyiseg>1</mennyiseg>
        <mennyisegiEgyseg>db</mennyisegiEgyseg>
        <nettoEgysegar>3929.13</nettoEgysegar>
        <netto>3929.13</netto>
        <afakulcs>27</afakulcs>
        <afa>1060.87</afa>
        <brutto>4990</brutto>
      </tetel>
    </tetelek>
    <osszegek>
      <afakulcsossz><afakulcs>27</afakulcs><netto>3929.13</netto><afa>1060.87</afa><brutto>4990</brutto></afakulcsossz>
      <totalossz><netto>3929.13</netto><afa>1060.87</afa><brutto>4990</brutto></totalossz>
    </osszegek>
  </nyugta>`)
}

const NOT_FOUND = receiptErrorResponse(339, 'A nyugtaszám nem létezik.')

function kasszaWith(...handlers: MockHandler[]) {
  const agent = mockAgent(...handlers)
  const kassza = createKassza({ agentKey: TEST_AGENT_KEY, retryDelayMs: 0, fetch: agent.fetch })
  return { kassza, agent }
}

describe('receipts.createOnce', () => {
  test('rendelésszám nélkül validációs hibát dob', async () => {
    const { kassza, agent } = kasszaWith(NOT_FOUND)

    await expect(kassza.receipts.createOnce(BASE)).rejects.toMatchObject({
      category: 'validation',
    })
    expect(agent.calls).toHaveLength(0)
  })

  test('rendelésszámmal keres, és ha nincs, a rendelésszámot hívásazonosítónak használja', async () => {
    const { kassza, agent } = kasszaWith(NOT_FOUND, receiptXml('NYGT-2026-1', 'POS-1'))

    const result = await kassza.receipts.createOnce({ ...BASE, orderNumber: 'POS-1' })

    expect(result.created).toBe(true)
    expect(result.receipt.number).toBe('NYGT-2026-1')
    expect(agent.calls.map((call) => call.field)).toEqual([
      'action-szamla_agent_nyugta_get',
      'action-szamla_agent_nyugta_create',
    ])
    expect(agent.calls[0]?.xml).toContain('<rendelesSzam>POS-1</rendelesSzam>')
    expect(agent.calls[1]?.xml).toContain('<hivasAzonosito>POS-1</hivasAzonosito>')
    expect(agent.calls[1]?.xml).toContain('<rendelesSzam>POS-1</rendelesSzam>')
  })

  test('meglévő nyugtánál nem hoz létre újat', async () => {
    const { kassza, agent } = kasszaWith(receiptXml('NYGT-2026-3', 'POS-1'))

    const result = await kassza.receipts.createOnce({ ...BASE, orderNumber: 'POS-1' })

    expect(result).toMatchObject({ created: false, receipt: { number: 'NYGT-2026-3' } })
    expect(agent.calls).toHaveLength(1)
  })

  test('a saját hívásazonosítót megtartja', async () => {
    const { kassza, agent } = kasszaWith(NOT_FOUND, receiptXml('NYGT-2026-1', 'POS-1', 'SAJAT'))

    await kassza.receipts.createOnce({ ...BASE, orderNumber: 'POS-1', callId: 'SAJAT' })

    expect(agent.calls[1]?.xml).toContain('<hivasAzonosito>SAJAT</hivasAzonosito>')
  })

  test('338-as duplikált hívásazonosítónál visszakeres, és nem létrehozottnak jelöli', async () => {
    const { kassza } = kasszaWith(
      NOT_FOUND,
      receiptErrorResponse(338, 'A hívásazonosító már létezik.'),
      receiptXml('NYGT-2026-8', 'POS-1'),
    )

    const result = await kassza.receipts.createOnce(
      { ...BASE, orderNumber: 'POS-1' },
      { recoveryDelayMs: 0 },
    )

    expect(result).toMatchObject({ created: false, receipt: { number: 'NYGT-2026-8' } })
  })

  test('hálózati hiba után (a biztonságos újrapróbálások után is) visszakeres', async () => {
    const { kassza, agent } = kasszaWith(
      NOT_FOUND,
      new TypeError('fetch failed'),
      new TypeError('fetch failed'),
      new TypeError('fetch failed'),
      receiptXml('NYGT-2026-9', 'POS-1'),
    )

    const result = await kassza.receipts.createOnce(
      { ...BASE, orderNumber: 'POS-1' },
      { recoveryDelayMs: 0 },
    )

    expect(result).toMatchObject({ created: true, receipt: { number: 'NYGT-2026-9' } })
    expect(agent.calls).toHaveLength(5)
  })

  test('ha a visszakeresés sem találja, ismeretlen kimenetű hibát ad', async () => {
    const { kassza } = kasszaWith(
      NOT_FOUND,
      new TypeError('fetch failed'),
      new TypeError('fetch failed'),
      new TypeError('fetch failed'),
      NOT_FOUND,
    )

    const error = (await kassza.receipts
      .createOnce({ ...BASE, orderNumber: 'POS-1' }, { recoveryDelayMs: 0 })
      .catch((caught: unknown) => caught)) as SzamlazzError

    expect(error).toMatchObject({ category: 'network' })
    expect(error.details?.outcome).toBe('unknown')
  })

  test('duplikáltnál, ha nem található, az eredeti hibát adja', async () => {
    const { kassza } = kasszaWith(
      NOT_FOUND,
      receiptErrorResponse(338, 'A hívásazonosító már létezik.'),
      NOT_FOUND,
    )

    await expect(
      kassza.receipts.createOnce({ ...BASE, orderNumber: 'POS-1' }, { recoveryDelayMs: 0 }),
    ).rejects.toMatchObject({ code: 338, category: 'duplicate' })
  })

  test('üzleti hibánál nem keres vissza, lookupFirst: false esetén nem keres előre', async () => {
    const { kassza, agent } = kasszaWith(receiptErrorResponse(337, 'Előtag hiba'))

    await expect(
      kassza.receipts.createOnce({ ...BASE, orderNumber: 'POS-1' }, { lookupFirst: false }),
    ).rejects.toMatchObject({ code: 337 })
    expect(agent.calls).toHaveLength(1)
  })
})
