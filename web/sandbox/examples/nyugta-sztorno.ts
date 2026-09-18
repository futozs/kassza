import { createKassza } from 'kassza'

const kassza = createKassza({
  defaults: { receipt: { prefix: 'NYGT', paymentMethod: 'bankkártya' } },
})

const nyugta = await kassza.receipts.create({
  callId: 'PENZTAR-2026-0107',
  items: [{ name: 'Mozijegy', quantity: 2, grossUnitPrice: 2_990, vat: 5 }],
})

const sztorno = await kassza.receipts.reverse({
  receiptNumber: nyugta.number,
  callId: 'PENZTAR-2026-0107-STORNO',
})

console.log({
  eredeti: nyugta.number,
  sztorno: sztorno.number,
  tipus: sztorno.type,
  hivatkozas: sztorno.reversedReceiptNumber,
  brutto: sztorno.totals.grossAmount,
})
