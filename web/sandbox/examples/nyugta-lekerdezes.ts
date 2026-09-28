import { createKassza } from 'kassza'

const kassza = createKassza({
  defaults: { receipt: { prefix: 'NYGT', paymentMethod: 'készpénz' } },
})

const nyugta = await kassza.receipts.create({
  callId: 'PENZTAR-2026-0212',
  orderNumber: 'PENZTAR-2026-0212',
  items: [{ name: 'Napijegy', grossUnitPrice: 4_500, vat: 27 }],
})

await kassza.receipts.get(nyugta.number)
await kassza.receipts.get({
  orderNumber: 'PENZTAR-2026-0212',
  downloadPdf: false,
})

await kassza.receipts.find({ receiptNumber: 'NYGT-2026-999' })
