import { createKassza } from 'kassza'
import { simulator } from 'kassza-sandbox'

const kassza = createKassza()

const elonezet = await kassza.invoices.preview({
  buyer: { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' },
  items: [{ name: 'Éves karbantartás', netUnitPrice: 480_000, vat: 27 }],
})

console.log('Bruttó:', elonezet.grossTotal)
console.log('PDF:', elonezet.pdf)
console.log('Kiállított bizonylatok a fiókban:', simulator.account().invoices.length)
