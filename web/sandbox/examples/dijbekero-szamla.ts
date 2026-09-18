import { createKassza, type InvoiceBuyer, type InvoiceItemInput } from 'kassza'

const kassza = createKassza()

const vevo: InvoiceBuyer = {
  name: 'Futóklub Egyesület',
  zip: '1134',
  city: 'Budapest',
  address: 'Váci út 10.',
  email: 'penztar@example.hu',
}

const tetelek: InvoiceItemInput[] = [
  { name: 'Nevezési díj, félmaraton', grossUnitPrice: 12_990, vat: 27 },
]

const dijbekero = await kassza.invoices.create({
  type: 'proforma',
  orderNumber: 'NEV-2026-042',
  buyer: vevo,
  items: tetelek,
})
console.log('Díjbekérő:', dijbekero.number, dijbekero.grossTotal)

const szamla = await kassza.invoices.create({
  proformaNumber: dijbekero.number,
  orderNumber: 'NEV-2026-042',
  paymentMethod: 'átutalás',
  paid: true,
  buyer: vevo,
  items: tetelek,
})
console.log('Számla:', szamla.number, 'hátralék:', szamla.outstanding)
