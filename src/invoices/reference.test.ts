import { describe, expect, test } from 'vitest'
import { createTestContext } from '../../tests/helpers'
import {
  agentDate,
  type InvoiceReference,
  optionalAgentDate,
  optionalText,
  parseInvoiceResult,
  referenceValue,
  requireText,
  resolveInvoiceReference,
} from './reference'

describe('resolveInvoiceReference', () => {
  test('a szöveges hivatkozást számlaszámnak veszi', () => {
    expect(resolveInvoiceReference(' E-1 ')).toEqual({ kind: 'invoiceNumber', value: 'E-1' })
  })

  test('az objektum formákat felismeri', () => {
    expect(resolveInvoiceReference({ invoiceNumber: 'E-1' })).toEqual({
      kind: 'invoiceNumber',
      value: 'E-1',
    })
    expect(resolveInvoiceReference({ orderNumber: 'R-1' })).toEqual({
      kind: 'orderNumber',
      value: 'R-1',
    })
    expect(resolveInvoiceReference({ externalId: 'X-1' })).toEqual({
      kind: 'externalId',
      value: 'X-1',
    })
  })

  test('üres, többértelmű vagy hibás hivatkozásra validációs hibát dob', () => {
    const invalid = [
      '',
      {},
      { invoiceNumber: '' },
      { invoiceNumber: 'E-1', orderNumber: 'R-1' },
      { orderNumber: 42 },
      null,
      7,
    ] as unknown as InvoiceReference[]
    for (const reference of invalid) {
      expect(() => resolveInvoiceReference(reference)).toThrow(
        expect.objectContaining({ category: 'validation' }),
      )
    }
  })

  test('a referenceValue csak az egyező fajtára ad értéket', () => {
    const resolved = resolveInvoiceReference({ orderNumber: 'R-1' })

    expect(referenceValue(resolved, 'orderNumber')).toBe('R-1')
    expect(referenceValue(resolved, 'invoiceNumber')).toBeUndefined()
  })
})

describe('szöveg és dátum segédfüggvények', () => {
  test('a requireText és az optionalText vágja a szóközöket', () => {
    expect(requireText(' a ', 'hiba')).toBe('a')
    expect(() => requireText(undefined, 'hiányzik')).toThrow('hiányzik')
    expect(optionalText('  ')).toBeUndefined()
    expect(optionalText(undefined)).toBeUndefined()
    expect(optionalText(' b ')).toBe('b')
  })

  test('az agentDate budapesti dátumot ad, hibás dátumra validációs hibát dob', () => {
    expect(agentDate(new Date('2026-09-15T22:30:00Z'), 'date')).toBe('2026-09-16')
    expect(() => agentDate('2026-02-30', 'issueDate')).toThrow(
      expect.objectContaining({
        category: 'validation',
        message: expect.stringContaining('issueDate'),
      }),
    )
    expect(optionalAgentDate(undefined, 'x')).toBeUndefined()
  })
})

describe('parseInvoiceResult', () => {
  test('XML válaszban a fejlécből pótolja a hiányzó mezőket', async () => {
    const { ctx } = createTestContext({
      headers: {
        szlahu_szamlaszam: 'E-9',
        szlahu_nettovegosszeg: '100',
        szlahu_bruttovegosszeg: '127',
        szlahu_kintlevoseg: 'nem-szám',
        szlahu_vevoifiokurl: encodeURIComponent('https://example.hu/?a=1&b=2'),
      },
      body: '<?xml version="1.0"?><xmlszamlavalasz><sikeres>true</sikeres></xmlszamlavalasz>',
    })

    const result = await ctx.execute({ action: 'reverseInvoice', xml: '<x/>' }, parseInvoiceResult)

    expect(result).toEqual({
      number: 'E-9',
      netTotal: 100,
      grossTotal: 127,
      outstanding: undefined,
      buyerAccountUrl: 'https://example.hu/?a=1&b=2',
      pdf: undefined,
    })
  })

  test('sikeres jelzés nélküli xmlszamlavalasz választ nem fogad el', async () => {
    const { ctx } = createTestContext({
      body: '<?xml version="1.0"?><xmlszamlavalasz><szamlaszam>E-1</szamlaszam></xmlszamlavalasz>',
    })

    await expect(
      ctx.execute({ action: 'reverseInvoice', xml: '<x/>' }, parseInvoiceResult),
    ).rejects.toMatchObject({ category: 'unexpected_response' })
  })
})
