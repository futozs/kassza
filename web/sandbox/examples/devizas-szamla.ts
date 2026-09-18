import { createKassza } from 'kassza'

const kassza = createKassza()

const szamla = await kassza.invoices.create({
  currency: 'EUR',
  language: 'en',
  orderNumber: 'EU-2026-3',
  paymentDueInDays: 30,
  buyer: {
    name: 'Hafenblick Software GmbH',
    country: 'Germany',
    zip: '20457',
    city: 'Hamburg',
    address: 'Am Sandtorkai 12',
    euTaxNumber: 'DE123456789',
    taxpayerType: 'euBusiness',
    email: 'billing@example.de',
  },
  items: [{ name: 'Consulting', quantity: 8, unit: 'hour', netUnitPrice: 95, vat: 'EUFAD37' }],
})

console.log(szamla.number, szamla.netTotal, szamla.grossTotal)
console.log(szamla.items[0])
