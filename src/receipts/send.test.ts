import { describe, expect, test } from 'vitest'
import { createTestContext, TEST_AGENT_KEY, textErrorResponse } from '../../tests/helpers'
import { canValidateXsd, validateAgainstXsd } from '../../tests/xsd'
import { el } from '../core/xml/serialize'
import { buildSendReceiptXml, isValidEmail, normalizeEmails, sendReceipt } from './send'
import { SEND_ERROR_RESPONSE, SEND_SUCCESS_RESPONSE } from './test-fixtures'
import type { SendReceiptInput } from './types'

const CREDENTIALS = [el('szamlaagentkulcs', TEST_AGENT_KEY)]
const SCHEMA = 'nyugtasend/xmlnyugtasend.xsd'

const MINIMAL_INPUT: SendReceiptInput = {
  receiptNumber: 'NYGT-2026-1',
  emails: 'vevo@example.hu',
}

const FULL_INPUT: SendReceiptInput = {
  receiptNumber: 'NYGT-2026-1',
  emails: ['vevo@example.hu', 'konyveles@example.hu'],
  replyTo: 'bolt@example.hu',
  subject: 'A nyugtád & köszönet',
  text: 'Kedves Vásárló!\n\nCsatoltuk a nyugtát.\nÜdv: Bolt',
}

describe.skipIf(!canValidateXsd(SCHEMA))('buildSendReceiptXml XSD szerződés', () => {
  test('a minimális kérés megfelel az XSD-nek', () => {
    expect(validateAgainstXsd(buildSendReceiptXml(CREDENTIALS, MINIMAL_INPUT), SCHEMA)).toEqual([])
  })

  test('a teljes kérés megfelel az XSD-nek', () => {
    expect(validateAgainstXsd(buildSendReceiptXml(CREDENTIALS, FULL_INPUT), SCHEMA)).toEqual([])
  })
})

describe('buildSendReceiptXml', () => {
  test('a minimális kérésben alapértelmezett tárgyat küld', () => {
    expect(buildSendReceiptXml(CREDENTIALS, MINIMAL_INPUT)).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<xmlnyugtasend xmlns="http://www.szamlazz.hu/xmlnyugtasend" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.szamlazz.hu/xmlnyugtasend https://www.szamlazz.hu/szamla/docs/xsds/nyugtasend/xmlnyugtasend.xsd">',
        '  <beallitasok>',
        `    <szamlaagentkulcs>${TEST_AGENT_KEY}</szamlaagentkulcs>`,
        '  </beallitasok>',
        '  <fejlec>',
        '    <nyugtaszam>NYGT-2026-1</nyugtaszam>',
        '  </fejlec>',
        '  <emailKuldes>',
        '    <email>vevo@example.hu</email>',
        '    <emailTargy>Nyugta NYGT-2026-1</emailTargy>',
        '  </emailKuldes>',
        '</xmlnyugtasend>',
        '',
      ].join('\n'),
    )
  })

  test('a teljes kérésben vesszővel fűzi össze a címzetteket, és az XSD sorrendjét tartja', () => {
    expect(buildSendReceiptXml(CREDENTIALS, FULL_INPUT)).toContain(
      [
        '  <emailKuldes>',
        '    <email>vevo@example.hu,konyveles@example.hu</email>',
        '    <emailReplyto>bolt@example.hu</emailReplyto>',
        '    <emailTargy>A nyugtád &amp; köszönet</emailTargy>',
        '    <emailSzoveg>Kedves Vásárló!\n\nCsatoltuk a nyugtát.\nÜdv: Bolt</emailSzoveg>',
        '  </emailKuldes>',
      ].join('\n'),
    )
  })

  test('az üres szöveget kihagyja', () => {
    expect(buildSendReceiptXml(CREDENTIALS, { ...MINIMAL_INPUT, text: '  ' })).not.toContain(
      'emailSzoveg',
    )
  })

  test.each([
    [{ ...MINIMAL_INPUT, receiptNumber: '' }, /nyugtaszámot/],
    [{ ...MINIMAL_INPUT, emails: [] }, /legalább egy címzett/],
    [{ ...MINIMAL_INPUT, emails: ' , ' }, /legalább egy címzett/],
    [{ ...MINIMAL_INPUT, emails: 'nem-email' }, /Érvénytelen e-mail cím a\(z\) emails/],
    [{ ...MINIMAL_INPUT, emails: ['jo@example.hu', 'rossz@'] }, /rossz@/],
    [{ ...MINIMAL_INPUT, replyTo: 'valasz@localhost' }, /replyTo/],
  ])('kliensoldali validációs hibát dob: %#', (input, message) => {
    expect(() => buildSendReceiptXml(CREDENTIALS, input)).toThrow(message)
  })
})

describe('normalizeEmails', () => {
  test('a vesszővel vagy pontosvesszővel elválasztott listát szétbontja és megtisztítja', () => {
    expect(normalizeEmails(' a@example.hu, b@example.hu;c@example.hu ')).toEqual([
      'a@example.hu',
      'b@example.hu',
      'c@example.hu',
    ])
  })

  test('az egyszerű e-mail formátumot ellenőrzi', () => {
    expect(isValidEmail('kovacs.anna+nyugta@pelda-bolt.co.hu')).toBe(true)
    expect(isValidEmail('kovacs anna@pelda.hu')).toBe(false)
    expect(isValidEmail('<a@b.hu>')).toBe(false)
  })
})

describe('sendReceipt', () => {
  test('a send mezőben küldi a kérést, és a docs sikeres válaszára nem dob hibát', async () => {
    const { ctx, agent } = createTestContext(SEND_SUCCESS_RESPONSE)

    await expect(sendReceipt(ctx, MINIMAL_INPUT)).resolves.toBeUndefined()
    expect(agent.lastCall().field).toBe('action-szamla_agent_nyugta_send')
  })

  test('a docs hibamintáját típusos hibává alakítja', async () => {
    const { ctx } = createTestContext(SEND_ERROR_RESPONSE)

    await expect(sendReceipt(ctx, MINIMAL_INPUT)).rejects.toMatchObject({
      name: 'SzamlazzError',
      code: 7,
      message: '[7] Hiányzó adat: emailtargy elem.',
      action: 'sendReceipt',
    })
  })

  test('a fejléces és a szöveges hibát is kezeli', async () => {
    const header = createTestContext(textErrorResponse('A nyugtaszám nem létezik.', 339))
    const text = createTestContext({ body: '[ERR] Ismeretlen hiba ---------- stack' })

    await expect(sendReceipt(header.ctx, MINIMAL_INPUT)).rejects.toMatchObject({ code: 339 })
    await expect(sendReceipt(text.ctx, MINIMAL_INPUT)).rejects.toMatchObject({
      message: 'Ismeretlen hiba',
    })
  })

  test('az xmlagentresponse=DONE szöveges választ sikerként kezeli', async () => {
    const { ctx } = createTestContext({ body: 'xmlagentresponse=DONE;NYGT-2026-1' })

    await expect(sendReceipt(ctx, MINIMAL_INPUT)).resolves.toBeUndefined()
  })

  test.each([
    [{ body: '' }, 'unexpected_response'],
    [{ status: 500, body: 'Internal Server Error' }, 'network'],
    [{ body: '<xmlnyugtasendvalasz/>' }, 'unexpected_response'],
    [{ status: 503, body: '<xmlnyugtasendvalasz/>' }, 'network'],
  ])('váratlan választ hibaként jelez: %#', async (response, category) => {
    const { ctx } = createTestContext(response)

    await expect(sendReceipt(ctx, MINIMAL_INPUT)).rejects.toMatchObject({ category })
  })

  test('az e-mail kiküldést hálózati hiba után sem küldi újra', async () => {
    const { ctx, agent } = createTestContext(new TypeError('fetch failed'), { maxAttempts: 3 })

    await expect(sendReceipt(ctx, MINIMAL_INPUT)).rejects.toMatchObject({ category: 'network' })
    expect(agent.calls).toHaveLength(1)
  })
})
