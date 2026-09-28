import { createKassza } from 'kassza'
import { invoicePdfKey, memoryStorage, storePdf } from 'kassza/storage'

const kassza = createKassza()
const tarhely = memoryStorage({ publicBaseUrl: 'https://cdn.example.hu' })

const szamla = await kassza.invoices.create({
  orderNumber: 'REND-6001',
  buyer: { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' },
  items: [{ name: 'Fotózás', netUnitPrice: 85_000, vat: 27 }],
})

if (szamla.pdf) {
  await storePdf(tarhely, invoicePdfKey({ number: szamla.number }), szamla.pdf)
}
