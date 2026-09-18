import { createKassza, type InvoiceBuyer } from 'kassza'
import { parseHungarianTaxNumber } from 'kassza/validators'

const kassza = createKassza()

const bevitt = '12345676-2-41'
if (!parseHungarianTaxNumber(bevitt)) throw new Error('Érvénytelen adószám')

const ceg = await kassza.taxpayer.query(bevitt)
console.log(ceg)

if (ceg.valid && ceg.address) {
  const vevo: InvoiceBuyer = {
    name: ceg.shortName ?? ceg.name ?? '',
    zip: ceg.address.postalCode,
    city: ceg.address.city,
    address: ceg.address.formatted.split(', ').slice(1).join(', '),
    taxNumber: ceg.taxNumber?.formatted,
  }
  console.log('A számla vevője:', vevo)
}

const ismeretlen = await kassza.taxpayer.query('87654321')
console.log('Ismeretlen törzsszám érvényes?', ismeretlen.valid)
