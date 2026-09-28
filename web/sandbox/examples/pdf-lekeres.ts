import { createKassza } from 'kassza'

const kassza = createKassza()

await kassza.invoices.create({
  orderNumber: 'REND-3001',
  downloadPdf: false,
  buyer: { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' },
  items: [{ name: 'Havi előfizetés', netUnitPrice: 9_900, vat: 27 }],
})

await kassza.invoices.getPdf({ orderNumber: 'REND-3001' })
