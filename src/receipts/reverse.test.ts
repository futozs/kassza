import { describe, expect, test } from 'vitest'
import { createTestContext, TEST_AGENT_KEY } from '../../tests/helpers'
import { canValidateXsd, validateAgainstXsd } from '../../tests/xsd'
import { el } from '../core/xml/serialize'
import { buildReverseReceiptXml, reverseReceipt } from './reverse'
import { REVERSAL_RESPONSE, receiptErrorResponse } from './test-fixtures'
import type { ReverseReceiptInput } from './types'

const CREDENTIALS = [el('szamlaagentkulcs', TEST_AGENT_KEY)]
const SCHEMA = 'nyugtast/xmlnyugtast.xsd'

const FULL_INPUT: ReverseReceiptInput = {
  receiptNumber: 'NYGT-2026-1',
  callId: 'storno-42',
  template: 'L',
  downloadPdf: false,
}

describe.skipIf(!canValidateXsd(SCHEMA))('buildReverseReceiptXml XSD szerződés', () => {
  test('a minimális kérés megfelel az XSD-nek', () => {
    expect(validateAgainstXsd(buildReverseReceiptXml(CREDENTIALS, 'NYGT-2026-1'), SCHEMA)).toEqual(
      [],
    )
  })

  test('a teljes kérés megfelel az XSD-nek', () => {
    expect(validateAgainstXsd(buildReverseReceiptXml(CREDENTIALS, FULL_INPUT), SCHEMA)).toEqual([])
  })
})

describe('buildReverseReceiptXml', () => {
  test('szöveges nyugtaszámból PDF letöltéssel építi a kérést', () => {
    expect(buildReverseReceiptXml(CREDENTIALS, ' NYGT-2026-1 ')).toBe(
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<xmlnyugtast xmlns="http://www.szamlazz.hu/xmlnyugtast" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.szamlazz.hu/xmlnyugtast https://www.szamlazz.hu/szamla/docs/xsds/nyugtast/xmlnyugtast.xsd">',
        '  <beallitasok>',
        `    <szamlaagentkulcs>${TEST_AGENT_KEY}</szamlaagentkulcs>`,
        '    <pdfLetoltes>true</pdfLetoltes>',
        '  </beallitasok>',
        '  <fejlec>',
        '    <nyugtaszam>NYGT-2026-1</nyugtaszam>',
        '  </fejlec>',
        '</xmlnyugtast>',
        '',
      ].join('\n'),
    )
  })

  test('a teljes kérésben az XSD sequence sorrendjét tartja', () => {
    expect(buildReverseReceiptXml(CREDENTIALS, FULL_INPUT)).toContain(
      [
        '    <pdfLetoltes>false</pdfLetoltes>',
        '  </beallitasok>',
        '  <fejlec>',
        '    <nyugtaszam>NYGT-2026-1</nyugtaszam>',
        '    <pdfSablon>L</pdfSablon>',
        '    <hivasAzonosito>storno-42</hivasAzonosito>',
        '  </fejlec>',
      ].join('\n'),
    )
  })

  test.each([
    ['', /nyugtaszámot/],
    [{ receiptNumber: '  ' }, /nyugtaszámot/],
    [{ receiptNumber: 'NYGT-1', template: 'Z' as never }, /PDF sablon/],
  ])('kliensoldali validációs hibát dob: %#', (input, message) => {
    expect(() => buildReverseReceiptXml(CREDENTIALS, input)).toThrow(message)
  })
})

describe('reverseReceipt', () => {
  test('a storno mezőben küldi a kérést és a sztornó nyugtát adja vissza', async () => {
    const { ctx, agent } = createTestContext(REVERSAL_RESPONSE)

    const receipt = await reverseReceipt(ctx, 'NYGT-2017-123')

    expect(agent.lastCall().field).toBe('action-szamla_agent_nyugta_storno')
    expect(receipt).toMatchObject({
      number: 'NYGT-2017-124',
      type: 'reversal',
      reversedReceiptNumber: 'NYGT-2017-123',
    })
  })

  test('a már sztornózott nyugta hibáját típusosan dobja', async () => {
    const { ctx } = createTestContext(
      receiptErrorResponse(
        7,
        'Hiányzó adat: sztornózandó nyugta (ezt a nyugtát már sztornózták: NYGT-2017-123)',
      ),
    )

    await expect(reverseReceipt(ctx, 'NYGT-2017-123')).rejects.toMatchObject({
      code: 7,
      message: expect.stringContaining('már sztornózták'),
    })
  })

  test('hívásazonosító nélkül nem próbálja újra, hívásazonosítóval igen', async () => {
    const withoutCallId = createTestContext(new TypeError('fetch failed'), { maxAttempts: 3 })
    const withCallId = createTestContext([new TypeError('fetch failed'), REVERSAL_RESPONSE], {
      maxAttempts: 3,
    })

    await expect(reverseReceipt(withoutCallId.ctx, 'NYGT-1')).rejects.toThrow()
    await reverseReceipt(withCallId.ctx, { receiptNumber: 'NYGT-1', callId: 'storno-1' })

    expect(withoutCallId.agent.calls).toHaveLength(1)
    expect(withCallId.agent.calls).toHaveLength(2)
  })
})
