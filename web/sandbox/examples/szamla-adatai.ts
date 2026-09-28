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

await kassza.invoices.get({ orderNumber: 'REND-4001' })

await kassza.invoices.find({ orderNumber: 'REND-9999' })
