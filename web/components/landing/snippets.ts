export const heroSnippet = `import { createKassza } from 'kassza'

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

export const installSnippet = 'npm i kassza'

export const envSnippet = 'SZAMLAZZ_AGENT_KEY=a-te-agent-kulcsod'

export const quickInvoiceSnippet = `await kassza.invoices.create({
  orderNumber: 'REND-1002',
  buyer,
  items,
})`
