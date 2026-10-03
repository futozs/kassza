import { createKassza, type ReceiptItemInput } from 'kassza'

const kassza = createKassza({
  defaults: { receipt: { prefix: 'NYGT', paymentMethod: 'bankkártya' } },
})

const tetelek: ReceiptItemInput[] = [
  { name: 'Lángos', quantity: 2, grossUnitPrice: 1_490, vat: 5 },
  { name: 'Ásványvíz 0,5 l', grossUnitPrice: 590, vat: 27 },
]

async function nyugtaEladasrol(eladasId: string): Promise<string> {
  const { receipt } = await kassza.receipts.createOnce(
    { orderNumber: `POS-${eladasId}`, downloadPdf: false, items: tetelek },
    { lookupFirst: false },
  )
  return receipt.number
}

await nyugtaEladasrol('2026-1003-0042')
await nyugtaEladasrol('2026-1003-0042')
