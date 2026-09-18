import { createKassza } from 'kassza'
import { simulator } from 'kassza-sandbox'

const kassza = createKassza({
  defaults: { receipt: { prefix: 'NYGT', paymentMethod: 'bankkártya' } },
})

const nyugta = await kassza.receipts.create({
  callId: 'WEB-2026-0391',
  items: [{ name: 'Online kurzus, 1 hónap', grossUnitPrice: 7_990, vat: 27 }],
})

await kassza.receipts.send({
  receiptNumber: nyugta.number,
  emails: ['vevo@example.hu', 'konyveles@example.hu'],
  replyTo: 'ugyfelszolgalat@example.hu',
  subject: `Nyugta a vásárlásodról (${nyugta.number})`,
  text: 'Köszönjük a vásárlást! A nyugtát csatolva küldjük.',
})

console.log('Címzettek:', simulator.account().receipts[0]?.sentTo)
