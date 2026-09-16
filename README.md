<p align="center">
  <img src="https://cdn.jsdelivr.net/npm/kassza/assets/logo-wordmark.svg" alt="kassza" width="480">
</p>

<p align="center">
  <b>Számlázz.hu, TypeScriptben, egyszerűbben.</b><br>
  Számla, díjbekérő, nyugta, sztornó, befizetés, PDF, adószám. Mind a 11 Agent művelet, 0 függőség.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/kassza"><img src="https://img.shields.io/npm/v/kassza?color=14532D" alt="npm"></a>
  <a href="https://www.npmjs.com/package/kassza"><img src="https://img.shields.io/npm/dm/kassza?color=14532D" alt="letöltések"></a>
  <img src="https://img.shields.io/badge/függőség-0-14532D" alt="0 függőség">
  <img src="https://img.shields.io/npm/l/kassza?color=14532D" alt="MIT">
</p>

```bash
npm i kassza
```

Node 22+, Bun, Deno, Cloudflare Workers és Vercel Edge alatt is fut.

## Számla 10 sorban

```ts
import { createKassza } from 'kassza'

const kassza = createKassza({ agentKey: process.env.SZAMLAZZ_AGENT_KEY })

const szamla = await kassza.invoices.create({
  buyer: { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.', email: 'vevo@example.hu' },
  items: [{ name: 'Webfejlesztés', quantity: 10, unit: 'óra', netUnitPrice: 15_000, vat: 27 }],
})

szamla.number
szamla.grossTotal
szamla.pdf
```

Ha van e-mail cím, a Számlázz.hu ki is küldi a számlát. A kerekítést, a magyar dátumot és az XML-t a csomag intézi.

## Nyugta

```ts
const nyugta = await kassza.receipts.create({
  prefix: 'NYGT',
  paymentMethod: 'bankkártya',
  items: [{ name: 'Kávé', grossUnitPrice: 890, vat: 27 }],
})

await kassza.receipts.send({ receiptNumber: nyugta.number, emails: 'vevo@example.hu' })
```

## Díjbekérő, befizetés, számla

```ts
const dijbekero = await kassza.invoices.create({
  type: 'proforma',
  orderNumber: 'REND-42',
  buyer,
  items: [{ name: 'Nevezési díj', grossUnitPrice: 26_000, vat: 27 }],
})

const szamla = await kassza.invoices.create({ proformaNumber: dijbekero.number, orderNumber: 'REND-42', buyer, items })
await kassza.invoices.registerPayment({ invoiceNumber: szamla.number, amount: szamla.grossTotal })
```

## Minden más

| Mit | Hogyan |
|---|---|
| Előleg-, vég-, helyesbítő számla, szállítólevél | `type: 'advance' \| 'final' \| 'corrective' \| 'deliveryNote'` |
| Bruttó ár (B2C) vagy nettó ár (B2B) | `grossUnitPrice` vagy `netUnitPrice` |
| Devizás számla | `currency: 'EUR'` (az árfolyam alapból MNB) |
| Előnézeti PDF, bizonylat nélkül | `kassza.invoices.preview(input)` |
| Sztornó | `kassza.invoices.reverse('E-2026-12')` |
| PDF utólag | `kassza.invoices.getPdf({ orderNumber: 'REND-42' })` |
| Teljes számla adatai | `kassza.invoices.get(...)` vagy `find(...)` (`null`, ha nincs) |
| Díjbekérő törlése | `kassza.invoices.deleteProforma({ orderNumber: 'REND-42' })` |
| Nyugta sztornó, lekérdezés | `kassza.receipts.reverse(...)`, `get(...)`, `find(...)` |
| Cégadatok adószámból (NAV) | `kassza.taxpayer.query('13421739')` |
| Jó-e az Agent kulcs? | `kassza.verifyCredentials()` |

Közös alapértékek egyszer, a kliensnél:

```ts
const kassza = createKassza({
  defaults: {
    invoice: { prefix: 'WEB', paymentDueInDays: 8, seller: { emailReplyTo: 'penzugy@ceg.hu' } },
    receipt: { prefix: 'NYGT', paymentMethod: 'bankkártya' },
  },
})
```

Az `agentKey` elhagyható, ha a `SZAMLAZZ_AGENT_KEY` környezeti változó be van állítva.

## Hibák

Minden hiba `SzamlazzError`, magyar üzenettel és tippel.

```ts
import { isSzamlazzError } from 'kassza'

try {
  await kassza.invoices.create(input)
} catch (error) {
  if (!isSzamlazzError(error)) throw error
  error.code
  error.category
  error.hint
  error.isDuplicate
}
```

A kategóriák: `auth`, `account`, `validation`, `duplicate`, `not_found`, `partial_success`, `maintenance`, `network`, `timeout`, `configuration`, `unexpected_response`.

A csomag magától csak ott próbálkozik újra, ahol ez biztonságos: lekérdezésnél, hálózati hibánál és karbantartásnál, legfeljebb 5-ször. Számlát soha nem küld újra. A Számlázz.hu kitiltja azt, aki ciklusban próbálkozik.

## Tesztelés API hívás nélkül

```ts
import { createMockKassza } from 'kassza/testing'

const kassza = createMockKassza()
const szamla = await kassza.invoices.create(input)
kassza.calls
kassza.failNext('invoices.create')
```

A mock ugyanazt a validációt és kerekítést futtatja, mint az éles kliens.

## Kiegészítők

| Import | Mire jó |
|---|---|
| `kassza/ipn` | Fizetési értesítés (IPN) webhook: `readIpnNotification(request)` |
| `kassza/validators` | Adószám, bankszámla, IBAN, irányítószám, cím, EU adószám ellenőrzés |
| `kassza/money` | Nettó/bruttó/áfa számítás a hivatalos kerekítési szabályokkal |
| `kassza/storage` | PDF mentése S3, R2, Vercel Blob, UploadThing, Supabase tárhelyre |
| `kassza/storage/fs` | PDF mentése fájlrendszerbe (Node) |
| `kassza/cookie-stores` | Session megosztás serverlessben: Upstash, Redis, Cloudflare KV |
| `kassza/testing` | Mock kliens unit tesztekhez |

## AI-val kódolsz?

A csomagban van egy `agents/` mappa, amiből a Claude Code, a Cursor, a Copilot és a többi asszisztens megtudja, hogyan kell jól használni a kasszát, és mik a buktatók. Mutasd meg neki: `node_modules/kassza/agents/README.md`.

---

Nem hivatalos csomag, nem kapcsolódik a KBOSS.hu Kft.-hez (Számlázz.hu). Hivatalos dokumentáció: [docs.szamlazz.hu](https://docs.szamlazz.hu/hu/agent/). MIT licenc.
