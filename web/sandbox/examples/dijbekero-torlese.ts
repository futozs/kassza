import { createKassza, isSzamlazzError } from 'kassza'

const kassza = createKassza()

const dijbekero = await kassza.invoices.create({
  type: 'proforma',
  orderNumber: 'NEV-2026-077',
  buyer: { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' },
  items: [{ name: 'Tábori részvételi díj', grossUnitPrice: 64_000, vat: 27 }],
})

await kassza.invoices.deleteProforma({ orderNumber: 'NEV-2026-077' })
console.log('Törölt díjbekérő:', dijbekero.number)

try {
  await kassza.invoices.deleteProforma(dijbekero.number)
} catch (error) {
  if (!isSzamlazzError(error)) throw error
  console.log({
    kod: error.code,
    kategoria: error.category,
    uzenet: error.message,
    tipp: error.hint,
  })
}
