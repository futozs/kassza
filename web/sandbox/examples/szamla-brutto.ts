import { createKassza } from 'kassza'

const kassza = createKassza({
  defaults: {
    invoice: {
      prefix: 'WEB',
      seller: { emailReplyTo: 'penzugy@example.hu', emailSubject: 'Elkészült a számlád' },
    },
  },
})

const szamla = await kassza.invoices.create({
  orderNumber: 'WEB-58213',
  paymentMethod: 'bankkártya',
  paid: true,
  buyer: {
    name: 'Szabó Júlia',
    zip: '6720',
    city: 'Szeged',
    address: 'Kárász utca 5.',
    email: 'julia@example.hu',
  },
  items: [
    { name: 'Póló, M', quantity: 2, grossUnitPrice: 5_990, vat: 27 },
    { name: 'Szakácskönyv', grossUnitPrice: 3_500, vat: 5 },
    { name: 'Házhoz szállítás', grossUnitPrice: 1_490, vat: 27 },
  ],
})

console.log(szamla.number, 'bruttó:', szamla.grossTotal, 'hátralék:', szamla.outstanding)

for (const tetel of szamla.items) {
  console.log(
    `${tetel.name}: nettó ${tetel.netAmount}, áfa ${tetel.vatAmount}, bruttó ${tetel.grossAmount}`,
  )
}
