import { createKassza, isSzamlazzError } from 'kassza'

const kassza = createKassza()

const vevo = { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' }

async function probald(leiras: string, muvelet: () => Promise<unknown>): Promise<void> {
  try {
    await muvelet()
    console.log(`${leiras}: sikerült`)
  } catch (error) {
    if (!isSzamlazzError(error)) throw error
    console.log(leiras, {
      kod: error.code,
      kategoria: error.category,
      uzenet: error.message,
      tipp: error.hint,
    })
  }
}

await probald('Hiányzó egységár', () =>
  kassza.invoices.create({ buyer: vevo, items: [{ name: 'Termék', vat: 27 }] }),
)

await probald('Ismeretlen áfakulcs', () =>
  kassza.invoices.create({
    buyer: vevo,
    items: [{ name: 'Termék', netUnitPrice: 1_000, vat: 28 }],
  }),
)

await probald('Nem regisztrált számlaszám előtag', () =>
  kassza.invoices.create({
    prefix: 'XYZ',
    buyer: vevo,
    items: [{ name: 'Termék', netUnitPrice: 1_000, vat: 27 }],
  }),
)

await probald('Kisbetűs nyugta előtag', () =>
  kassza.receipts.create({
    prefix: 'nygt',
    paymentMethod: 'készpénz',
    items: [{ name: 'Kávé', grossUnitPrice: 890, vat: 27 }],
  }),
)
