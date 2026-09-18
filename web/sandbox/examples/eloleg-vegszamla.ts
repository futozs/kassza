import { createKassza, type InvoiceBuyer } from 'kassza'

const kassza = createKassza({ defaults: { invoice: { prefix: 'PROJ', paymentDueInDays: 15 } } })

const vevo: InvoiceBuyer = {
  name: 'Tiszapart Vendéglátó Kft.',
  zip: '6000',
  city: 'Kecskemét',
  address: 'Rákóczi út 3.',
  taxNumber: '12345676-2-41',
}

const eloleg = await kassza.invoices.create({
  type: 'advance',
  orderNumber: 'PROJ-7',
  buyer: vevo,
  items: [{ name: 'Előleg a webáruház fejlesztésére', netUnitPrice: 300_000, vat: 27 }],
})

const vegszamla = await kassza.invoices.create({
  type: 'final',
  advanceInvoiceNumber: eloleg.number,
  orderNumber: 'PROJ-7',
  buyer: vevo,
  items: [
    { name: 'Webáruház fejlesztése', netUnitPrice: 1_000_000, vat: 27 },
    { name: 'Előleg levonása', quantity: -1, netUnitPrice: 300_000, vat: 27 },
  ],
})

console.log({
  elolegszamla: eloleg.number,
  eloleg: eloleg.grossTotal,
  vegszamla: vegszamla.number,
  fizetendo: vegszamla.grossTotal,
})
