import { createKassza } from 'kassza'

const kassza = createKassza({
  defaults: { receipt: { prefix: 'NYGT', paymentMethod: 'készpénz' } },
})

const nyugta = await kassza.receipts.create({
  callId: 'PENZTAR-2026-0001',
  orderNumber: 'PENZTAR-2026-0001',
  items: [
    { name: 'Kávé', quantity: 2, grossUnitPrice: 890, vat: 27 },
    { name: 'Kifli', grossUnitPrice: 250, vat: 5 },
  ],
})

console.log(nyugta.number, nyugta.type, nyugta.issueDate)
console.log(nyugta.totals)
console.log(
  nyugta.items.map(
    (tetel) => `${tetel.name}: ${tetel.netAmount} + ${tetel.vatAmount} = ${tetel.grossAmount}`,
  ),
)
