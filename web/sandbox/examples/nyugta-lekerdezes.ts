import { createKassza } from 'kassza'

const kassza = createKassza({
  defaults: { receipt: { prefix: 'NYGT', paymentMethod: 'készpénz' } },
})

const nyugta = await kassza.receipts.create({
  callId: 'PENZTAR-2026-0212',
  orderNumber: 'PENZTAR-2026-0212',
  items: [{ name: 'Napijegy', grossUnitPrice: 4_500, vat: 27 }],
})

const szamAlapjan = await kassza.receipts.get(nyugta.number)
const rendelesAlapjan = await kassza.receipts.get({
  orderNumber: 'PENZTAR-2026-0212',
  downloadPdf: false,
})

console.log(szamAlapjan.number === rendelesAlapjan.number)
console.log(rendelesAlapjan.totals, rendelesAlapjan.pdf)

const nincs = await kassza.receipts.find({ receiptNumber: 'NYGT-2026-999' })
console.log('Nem létező nyugta:', nincs)
