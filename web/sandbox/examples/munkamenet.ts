import { createKassza } from 'kassza'
import { customCookieStore } from 'kassza/cookie-stores'
import { simulator } from 'kassza-sandbox'

const kozosTar = new Map<string, string>()

const cookieStore = customCookieStore({
  get: (kulcs) => kozosTar.get(kulcs),
  set: (kulcs, ertek) => {
    kozosTar.set(kulcs, ertek)
  },
  delete: (kulcs) => {
    kozosTar.delete(kulcs)
  },
})

const elsoFuggveny = createKassza({ cookieStore })
const masodikFuggveny = createKassza({ cookieStore })

await elsoFuggveny.invoices.find({ orderNumber: 'REND-1' })
await masodikFuggveny.invoices.find({ orderNumber: 'REND-2' })

console.log(
  simulator.calls.map((hivas) => ({
    muvelet: hivas.action,
    sessionUjrahasznositva: hivas.sessionReused,
  })),
)
console.log('A tárolt kulcs:', [...kozosTar.keys()])
