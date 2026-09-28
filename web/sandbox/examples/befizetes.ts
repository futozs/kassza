import { createKassza } from 'kassza'

const kassza = createKassza()

const szamla = await kassza.invoices.create({
  orderNumber: 'REND-2001',
  buyer: { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' },
  items: [{ name: 'Tanácsadás', quantity: 4, unit: 'óra', netUnitPrice: 25_000, vat: 27 }],
})

await kassza.invoices.registerPayment({
  invoiceNumber: szamla.number,
  amount: 50_000,
  method: 'átutalás',
  description: 'Első részlet',
})

await kassza.invoices.registerPayment({
  invoiceNumber: szamla.number,
  payments: [
    { method: 'készpénz', amount: 20_000 },
    { method: 'bankkártya', amount: 57_000 },
  ],
})

await kassza.invoices.clearPayments(szamla.number)
