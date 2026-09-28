import { createKassza } from 'kassza'

const kassza = createKassza()

await kassza.invoices.preview({
  buyer: { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' },
  items: [{ name: 'Éves karbantartás', netUnitPrice: 480_000, vat: 27 }],
})
