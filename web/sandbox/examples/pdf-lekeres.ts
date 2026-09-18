import { createKassza } from 'kassza'

const kassza = createKassza()

const szamla = await kassza.invoices.create({
  orderNumber: 'REND-3001',
  downloadPdf: false,
  buyer: { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' },
  items: [{ name: 'Havi előfizetés', netUnitPrice: 9_900, vat: 27 }],
})
console.log('PDF a létrehozáskor:', szamla.pdf)

const peldany = await kassza.invoices.getPdf({ orderNumber: 'REND-3001' })
console.log(peldany.number, peldany.pdf)
