import { createKassza, type InvoiceBuyer } from 'kassza'

const kassza = createKassza()

const vevo: InvoiceBuyer = {
  name: 'Kiss Bence',
  zip: '9021',
  city: 'Győr',
  address: 'Baross Gábor út 22.',
  email: 'bence@example.hu',
}

const eredeti = await kassza.invoices.create({
  orderNumber: 'WEB-1200',
  paymentMethod: 'bankkártya',
  paid: true,
  buyer: vevo,
  items: [{ name: 'Póló, M', quantity: 3, grossUnitPrice: 5_990, vat: 27 }],
})

const helyesbito = await kassza.invoices.create({
  type: 'corrective',
  correctedInvoiceNumber: eredeti.number,
  orderNumber: 'WEB-1200',
  buyer: vevo,
  items: [{ name: 'Póló, M (visszáru)', quantity: -1, grossUnitPrice: 5_990, vat: 27 }],
})

console.log('Eredeti:', eredeti.number, eredeti.grossTotal)
console.log('Helyesbítő:', helyesbito.number, helyesbito.grossTotal)
