import type { Kassza } from 'kassza'
import { createMockKassza } from 'kassza/testing'

async function fizetesUtanSzamla(rendelesId: number, kassza: Kassza): Promise<string> {
  const orderNumber = `REND-${rendelesId}`
  const meglevo = await kassza.invoices.find({ orderNumber })
  if (meglevo) return meglevo.header.number
  const szamla = await kassza.invoices.create({
    orderNumber,
    paid: true,
    paymentMethod: 'bankkártya',
    buyer: { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' },
    items: [{ name: 'Termék', grossUnitPrice: 12_700, vat: 27 }],
  })
  return szamla.number
}

const mock = createMockKassza()

await fizetesUtanSzamla(1, mock)
await fizetesUtanSzamla(1, mock)

console.log(
  'Hívások:',
  mock.calls.map((hivas) => hivas.method),
)
console.log(
  'Bruttó összegek:',
  [...mock.invoiceRecords.values()].map((rekord) => rekord.details.totals.grossAmount),
)

mock.failNext('invoices.create')
try {
  await fizetesUtanSzamla(2, mock)
} catch (error) {
  console.log('A mock hibát dobott:', error)
}
