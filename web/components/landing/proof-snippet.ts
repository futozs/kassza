export const proofSnippet = `import { createKassza } from 'kassza'

const kassza = createKassza()

const szamla = await kassza.invoices.create({
  orderNumber: 'REND-1001',
  paid: true,
  paymentMethod: 'bankkártya',
  buyer: {
    name: 'Nagy Péter',
    zip: '1111',
    city: 'Budapest',
    address: 'Fő utca 1.',
    email: 'peter@example.hu',
  },
  items: [{
    name: 'Póló',
    quantity: 3,
    grossUnitPrice: 5_990,
    vat: 27,
  }],
})

szamla.number
szamla.pdf`
