import { createKassza } from 'kassza'

const kassza = createKassza()

await kassza.invoices.create({
  orderNumber: 'REND-4001',
  paymentMethod: 'bankkártya',
  paid: true,
  buyer: {
    name: 'Vevő Kft.',
    zip: '1111',
    city: 'Budapest',
    address: 'Fő utca 1.',
    email: 'vevo@example.hu',
  },
  items: [
    { name: 'Laptop tok', grossUnitPrice: 8_990, vat: 27 },
    { name: 'E-könyv', grossUnitPrice: 2_490, vat: 5 },
  ],
})

const adatok = await kassza.invoices.get({ orderNumber: 'REND-4001' })
console.log(adatok.header)
console.log(adatok.totals)
console.log(adatok.payments)

const nincs = await kassza.invoices.find({ orderNumber: 'REND-9999' })
console.log('Nem létező rendelés:', nincs)
