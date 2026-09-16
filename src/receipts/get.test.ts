import { describe, expect, test } from 'vitest'
import { createTestContext, FAKE_PDF_BYTES, TEST_AGENT_KEY } from '../../tests/helpers'
import { canValidateXsd, validateAgainstXsd } from '../../tests/xsd'
import { el } from '../core/xml/serialize'
import { buildGetReceiptXml, getReceipt } from './get'
import { RECEIPT_WITH_PDF_RESPONSE, receiptErrorResponse } from './test-fixtures'
import type { GetReceiptInput } from './types'

const CREDENTIALS = [el('szamlaagentkulcs', TEST_AGENT_KEY)]
const SCHEMA = 'nyugtaget/xmlnyugtaget.xsd'

const FULL_INPUT: GetReceiptInput = {
  receiptNumber: 'NYGT-2026-1',
  callId: 'get-42',
  template: 'A',
  downloadPdf: false,
}

describe.skipIf(!canValidateXsd(SCHEMA))('buildGetReceiptXml XSD szerződés', () => {
  test('a minimális kérés megfelel az XSD-nek', () => {
    expect(validateAgainstXsd(buildGetReceiptXml(CREDENTIALS, 'NYGT-2026-1'), SCHEMA)).toEqual([])
  })

  test('a teljes kérés megfelel az XSD-nek', () => {
    expect(validateAgainstXsd(buildGetReceiptXml(CREDENTIALS, FULL_INPUT), SCHEMA)).toEqual([])
  })

  test('a rendelesSzam a docs XSD-jében szerepel, a letölthető XSD-ben még nem', () => {
    const xml = buildGetReceiptXml(CREDENTIALS, { orderNumber: 'ORD-2026-001' })

    expect(validateAgainstXsd(xml, SCHEMA).join('\n')).toContain('rendelesSzam')
  })
})

describe('buildGetReceiptXml', () => {
  test('szöveges nyugtaszámból PDF letöltéssel építi a kérést', () => {
    expect(buildGetReceiptXml(CREDENTIALS, 'NYGT-2026-1')).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<xmlnyugtaget xmlns="http://www.szamlazz.hu/xmlnyugtaget" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.szamlazz.hu/xmlnyugtaget https://www.szamlazz.hu/szamla/docs/xsds/nyugtaget/xmlnyugtaget.xsd">',
        '  <beallitasok>',
        `    <szamlaagentkulcs>${TEST_AGENT_KEY}</szamlaagentkulcs>`,
        '    <pdfLetoltes>true</pdfLetoltes>',
        '  </beallitasok>',
        '  <fejlec>',
        '    <nyugtaszam>NYGT-2026-1</nyugtaszam>',
        '  </fejlec>',
        '</xmlnyugtaget>',
        '',
      ].join('\n'),
    )
  })

  test('a teljes kérés minden mezőt tartalmaz', () => {
    expect(buildGetReceiptXml(CREDENTIALS, FULL_INPUT)).toContain(
      [
        '    <pdfLetoltes>false</pdfLetoltes>',
        '  </beallitasok>',
        '  <fejlec>',
        '    <nyugtaszam>NYGT-2026-1</nyugtaszam>',
        '    <hivasAzonosito>get-42</hivasAzonosito>',
        '    <pdfSablon>A</pdfSablon>',
        '  </fejlec>',
      ].join('\n'),
    )
  })

  test('rendelésszám alapján a docs szerinti rendelesSzam elemmel kérdez le', () => {
    const xml = buildGetReceiptXml(CREDENTIALS, { orderNumber: 'ORD-2026-001' })

    expect(xml).toContain('  <fejlec>\n    <rendelesSzam>ORD-2026-001</rendelesSzam>\n  </fejlec>')
    expect(xml).not.toContain('nyugtaszam')
  })

  test.each([
    ['', /nyugtaszámot \(receiptNumber\) vagy a rendelésszámot/],
    [{ receiptNumber: ' ' } as GetReceiptInput, /vagy a rendelésszámot/],
    [{ receiptNumber: 'NYGT-1', orderNumber: 'ORD-1' } as never, /csak az egyiket/],
    [{ receiptNumber: 'NYGT-1', template: 'Q' as never }, /PDF sablon/],
  ])('kliensoldali validációs hibát dob: %#', (input, message) => {
    expect(() => buildGetReceiptXml(CREDENTIALS, input)).toThrow(message)
  })
})

describe('getReceipt', () => {
  test('a get mezőben küldi a kérést és a nyugtát PDF-fel adja vissza', async () => {
    const { ctx, agent } = createTestContext(RECEIPT_WITH_PDF_RESPONSE)

    const receipt = await getReceipt(ctx, { orderNumber: 'ORD-2026-001' })

    expect(agent.lastCall().field).toBe('action-szamla_agent_nyugta_get')
    expect(receipt).toMatchObject({ number: 'NYGT-2017-123', orderNumber: 'ORD-2026-001' })
    expect(receipt.pdf).toEqual(FAKE_PDF_BYTES)
  })

  test('lekérdezésként hálózati hiba után újrapróbálja', async () => {
    const { ctx, agent } = createTestContext(
      [new TypeError('fetch failed'), RECEIPT_WITH_PDF_RESPONSE],
      { maxAttempts: 2 },
    )

    await expect(getReceipt(ctx, 'NYGT-2017-123')).resolves.toMatchObject({
      number: 'NYGT-2017-123',
    })
    expect(agent.calls).toHaveLength(2)
  })

  test('nem létező nyugtaszámra not_found hibát ad és nem próbálja újra', async () => {
    const { ctx, agent } = createTestContext(
      receiptErrorResponse(339, 'A nyugtaszám nem létezik.'),
      { maxAttempts: 3 },
    )

    await expect(getReceipt(ctx, 'NYGT-0')).rejects.toMatchObject({ isNotFound: true, code: 339 })
    expect(agent.calls).toHaveLength(1)
  })
})
