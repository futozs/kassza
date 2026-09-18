import { createKassza } from 'kassza'

const kassza = createKassza()

const szamla = await kassza.invoices.create({
  orderNumber: 'REND-1500',
  buyer: { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' },
  items: [{ name: 'Konferenciajegy', quantity: 2, grossUnitPrice: 39_900, vat: 27 }],
})

const sztorno = await kassza.invoices.reverse({
  invoiceNumber: szamla.number,
  comment: 'A rendezvény elmaradt, a jegyek árát visszautaltuk.',
})

console.log({ eredeti: szamla.number, sztorno: sztorno.number, brutto: sztorno.grossTotal })

const adatok = await kassza.invoices.get(szamla.number)
console.log('Az eredeti számla sztornózva:', adatok.header.reversed)
