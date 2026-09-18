import { createKassza } from 'kassza'

const kassza = createKassza()

const szamla = await kassza.invoices.create({
  orderNumber: 'REND-1001',
  paymentMethod: 'átutalás',
  paymentDueInDays: 8,
  buyer: {
    name: 'Vevő Kft.',
    zip: '1111',
    city: 'Budapest',
    address: 'Fő utca 1.',
    email: 'vevo@example.hu',
    taxNumber: '12345676-2-41',
  },
  items: [
    { name: 'Webfejlesztés', quantity: 10, unit: 'óra', netUnitPrice: 15_000, vat: 27 },
    { name: 'Tárhely, 12 hónap', netUnitPrice: 24_000, vat: 27 },
  ],
})

console.log(szamla.number)
console.log({ netto: szamla.netTotal, brutto: szamla.grossTotal, hatralek: szamla.outstanding })
console.log(szamla.items)
console.log(szamla.pdf)
