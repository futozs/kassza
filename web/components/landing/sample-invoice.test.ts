import { describe, expect, it } from 'vitest'
import { readInvoiceTotals, renderSampleInvoiceXml } from './sample-invoice'

describe('mintaszámla', () => {
  it('a valódi kérés XML-jéből olvassa ki az összegeket', async () => {
    const totals = readInvoiceTotals(await renderSampleInvoiceXml())
    expect(totals).toEqual({ netUnitPrice: 4716.67, net: 14150, vat: 3820, gross: 17970 })
  })

  it('a nettó és az áfa összege a bruttó', async () => {
    const totals = readInvoiceTotals(await renderSampleInvoiceXml())
    expect(totals.net + totals.vat).toBe(totals.gross)
  })

  it('hibát dob, ha hiányzik egy összeg', () => {
    expect(() => readInvoiceTotals('<nettoErtek>1</nettoErtek>')).toThrow(/nettoEgysegar/)
  })
})
