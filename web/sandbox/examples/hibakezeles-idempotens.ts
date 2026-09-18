import { createKassza, isSzamlazzError } from 'kassza'
import { simulator } from 'kassza-sandbox'

const kassza = createKassza()

interface Rendeles {
  readonly id: number
  readonly nev: string
  readonly email: string
  readonly osszeg: number
}

async function szamlazRendelest(rendeles: Rendeles): Promise<string> {
  const orderNumber = `REND-${rendeles.id}`

  const meglevo = await kassza.invoices.find({ orderNumber })
  if (meglevo) return `${meglevo.header.number} (már létezett)`

  try {
    const szamla = await kassza.invoices.create({
      orderNumber,
      paid: true,
      paymentMethod: 'bankkártya',
      buyer: {
        name: rendeles.nev,
        zip: '1111',
        city: 'Budapest',
        address: 'Fő utca 1.',
        email: rendeles.email,
      },
      items: [{ name: 'Rendelés', grossUnitPrice: rendeles.osszeg, vat: 27 }],
    })
    return `${szamla.number} (új)`
  } catch (error) {
    const bizonytalan = ['network', 'timeout', 'partial_success', 'duplicate']
    if (isSzamlazzError(error) && bizonytalan.includes(error.category)) {
      console.warn(`Bizonytalan kimenet (${error.category}), ellenőrzés rendelésszám alapján…`)
      const letrejott = await kassza.invoices.find({ orderNumber })
      if (letrejott) return `${letrejott.header.number} (a hiba ellenére elkészült)`
    }
    throw error
  }
}

const rendeles: Rendeles = {
  id: 5001,
  nev: 'Nagy Péter',
  email: 'peter@example.hu',
  osszeg: 12_700,
}

simulator.failNext('createInvoice', 56)
console.log('Első próbálkozás:', await szamlazRendelest(rendeles))
console.log('A webhook újraküldése:', await szamlazRendelest(rendeles))
console.log('Számlák a fiókban:', simulator.account().invoices.length)
