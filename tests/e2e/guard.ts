import type { Kassza } from '../../src/client'
import type { CreateInvoiceInput } from '../../src/invoices/create-types'

export const BUYER = {
  name: 'Kassza E2E Teszt Kft.',
  zip: '1111',
  city: 'Budapest',
  address: 'Teszt utca 1.',
  sendEmail: false,
} as const

export const ITEMS = [
  { name: 'E2E tétel 27%', quantity: 2, unit: 'db', netUnitPrice: 1000, vat: 27 },
  { name: 'E2E tétel 5%', quantity: 1, unit: 'db', netUnitPrice: 3000, vat: 5 },
] as const

export function invoiceInput(
  orderNumber: string,
  overrides: Partial<CreateInvoiceInput> = {},
): CreateInvoiceInput {
  return {
    buyer: BUYER,
    items: ITEMS,
    orderNumber,
    paymentMethod: 'átutalás',
    eInvoice: false,
    downloadPdf: false,
    ...overrides,
  } as CreateInvoiceInput
}

export async function assertTestAccount(kassza: Kassza, orderNumber: string): Promise<void> {
  const proforma = await kassza.invoices.create(invoiceInput(orderNumber, { type: 'proforma' }))
  const details = await kassza.invoices.get(proforma.number, { includePdf: false })
  if (details.header.test !== true) {
    await kassza.invoices.deleteProforma(proforma.number).catch(() => undefined)
    throw new Error(
      `A fiók nem tesztfiók (a díjbekérő teszt jelzője: ${String(details.header.test)}). ` +
        'A díjbekérőt töröltem, a futás leáll. Csak tesztfiók Agent kulcsával futtasd az e2e-t.',
    )
  }
  if (details.header.type !== 'proforma' || details.header.number !== proforma.number) {
    throw new Error(
      `A díjbekérő lekérdezése mást adott vissza: ${details.header.type} ${details.header.number}.`,
    )
  }
  await kassza.invoices.deleteProforma(proforma.number)
}
