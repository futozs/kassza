import { createKassza } from 'kassza'

const kassza = createKassza()

const szamla = await kassza.invoices.create({
  orderNumber: 'REND-1500',
  buyer: { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' },
  items: [{ name: 'Konferenciajegy', quantity: 2, grossUnitPrice: 39_900, vat: 27 }],
})

await kassza.invoices.reverse({
  invoiceNumber: szamla.number,
  comment: 'A rendezvény elmaradt, a jegyek árát visszautaltuk.',
})

await kassza.invoices.get(szamla.number)
