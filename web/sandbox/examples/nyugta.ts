import { createKassza } from 'kassza'

const kassza = createKassza({
  defaults: { receipt: { prefix: 'NYGT', paymentMethod: 'készpénz' } },
})

await kassza.receipts.create({
  callId: 'PENZTAR-2026-0001',
  orderNumber: 'PENZTAR-2026-0001',
  items: [
    { name: 'Kávé', quantity: 2, grossUnitPrice: 890, vat: 27 },
    { name: 'Kifli', grossUnitPrice: 250, vat: 5 },
  ],
})
