import { createKassza } from 'kassza'

const kassza = createKassza()

const szamla = await kassza.invoices.create({
  orderNumber: 'REND-2001',
  buyer: { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' },
  items: [{ name: 'Tanácsadás', quantity: 4, unit: 'óra', netUnitPrice: 25_000, vat: 27 }],
})
console.log('Bruttó végösszeg:', szamla.grossTotal)

const elso = await kassza.invoices.registerPayment({
  invoiceNumber: szamla.number,
  amount: 50_000,
  method: 'átutalás',
  description: 'Első részlet',
})
console.log('Hátralék az első befizetés után:', elso.outstanding)

const reszletek = await kassza.invoices.registerPayment({
  invoiceNumber: szamla.number,
  payments: [
    { method: 'készpénz', amount: 20_000 },
    { method: 'bankkártya', amount: 57_000 },
  ],
})
console.log('Hátralék a részletek után:', reszletek.outstanding)

const torles = await kassza.invoices.clearPayments(szamla.number)
console.log('Hátralék a befizetések törlése után:', torles.outstanding)
