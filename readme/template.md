<p align="center">
  <a href="{{web}}">{{picture:hero|kassza: Számlázz.hu, TypeScriptben. Telepítés: npm i kassza|100%}}</a>
</p>

<p align="center">
  <b>Számlázz.hu, TypeScriptben, egyszerűbben.</b><br>
  Nem hivatalos TypeScript wrapper a Számlázz.hu Számla Agenthez. Mind a 11 Agent művelet, 0 függőség, nulla runtime kompromisszum.
</p>

<p align="center">
  {{badges}}
</p>

{{nav}}

```bash
npm i kassza
```

```ts
import { createKassza } from 'kassza'

const kassza = createKassza()

const szamla = await kassza.invoices.create({
  buyer: { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.', email: 'vevo@ceg.hu' },
  items: [{ name: 'Webfejlesztés', quantity: 10, unit: 'óra', netUnitPrice: 15_000, vat: 27 }],
})

console.log(szamla.number, szamla.grossTotal)
```

Ennyi. A kerekítést, a magyar dátumot, az XML-t, a session cookie-t és a hibakezelést a kassza intézi, a vevő pedig e-mailben megkapja a számlát.

{{links:alapok/telepites|szamla}}

## Miért kassza?

<p align="center">
  {{picture:matrix|Számla Agent műveletek: a kassza mind a 11-et tudja, a többi csomag 2 vagy 3 műveletet|100%}}
</p>

- **Mind a 11 Agent művelet.** Számla, díjbekérő, nyugta, sztornó, befizetés, PDF és adószám, nem csak a számla kiállítása.
- **Pontos kerekítés.** A tételek nettó, áfa és bruttó értékét a Számlázz.hu szabályai szerint számolja, mert egy forint eltérés is elég, hogy a számla ne készüljön el.
- **Nincs dupla számla.** Számlát a kassza soha nem küld újra magától, bizonytalan hiba után pedig a rendelésszámmal visszakeresheted.
- **Egy hibatípus.** A Számlázz.hu háromféle hibaformátumából egyetlen `SzamlazzError` lesz, magyar üzenettel és javítási tippel.
- **Serverless és edge.** Node, Bun, Deno, Cloudflare Workers és Vercel Edge alatt is fut, a session cookie közös tárolóban is lehet.

<details>
<summary><b>Részletes összehasonlítás</b> · 6 csomag, 12 szempont</summary>

|  | **kassza** | szamlazz.js | @ribbery009/ szamlazz-ts | @halftome/ szamlazz-client | szamlazz.ts | szamlazzhu-client |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Számla, sztornó | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Számla adatainak lekérése | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Nyugta** (létrehozás, sztornó, lekérdezés, kiküldés) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Befizetés rögzítése** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **PDF lekérése utólag** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Díjbekérő törlése** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Adószám lekérdezés (NAV)** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Runtime függőség | **0** | 6 | 6 | 1 | 7 | 3 |
| TypeScript típusok | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ |
| Edge (Workers, Vercel Edge) | ✅ | ❌ | ❌ | – | ❌ | ❌ |
| Mock kliens teszteléshez | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| IPN webhook, validátorok, PDF tárhely | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

<sub>A műveleteket 2026 szeptemberében a publikált csomagok kódjában ellenőriztük (melyik Agent form mezőt küldik). Az Edge oszlopban ❌ az axios, tough-cookie vagy form-data függőség miatt szerepel, ezek nem futnak Workers alatt. A „–” azt jelenti, hogy nem teszteltük.</sub>

</details>

{{links:alapok/mi-a-kassza||}}

## Tartalom

| Kezdés | Műveletek | Kiegészítők |
| --- | --- | --- |
| 🌐 [Weboldal, sandbox és receptek](#weboldal-sandbox-és-receptek) | 📄 [Számlák](#számlák) | 🗄️ [PDF mentése tárhelyre](#pdf-mentése-tárhelyre) |
| ⚙️ [Beállítás](#beállítás) | 🧾 [Nyugták](#nyugták) | ⚡ [Serverless és edge](#serverless-és-edge) |
| 🚨 [Hibakezelés](#hibakezelés) | 🏛️ [Adószám lekérdezés](#adószám-lekérdezés) | 🧪 [Tesztelés](#tesztelés) |
| 🎛️ [Haladó beállítások](#haladó-beállítások) | 🔔 [Fizetési értesítés (IPN)](#fizetési-értesítés-ipn) | 🧮 [Validátorok és pénzszámítás](#validátorok-és-pénzszámítás) |
| 🤖 [AI-val kódolsz?](#ai-val-kódolsz) | | |

## Weboldal, sandbox és receptek

A teljes magyar dokumentáció, a sandbox és a receptek a **[{{host}}]({{web}})** oldalon vannak.

<p align="center">
  <a href="{{sandbox:szamla}}">{{picture:showcase|A kassza sandbox: futtatható példák, TypeScript kód és a ténylegesen elküldött XML|100%}}</a>
</p>

- 📖 **[Dokumentáció]({{docs}})**: {{pages}} oldal magyarul. Minden Agent művelethez kérés, válasz és futtatható minta, a beállítások, a szabályok és az összes ismert hibakód.
- ▶️ **[Sandbox]({{sandbox}})**: {{examples}} példa, amit a böngészőben futtathatsz Agent kulcs nélkül, szimulált Számlázz.hu ellen, a ténylegesen elküldött XML-lel. A saját kódodat linkként meg is oszthatod.
- 🍳 **[Receptek]({{recipes}})**: {{recipeCount}} teljes, bemásolható integráció webshophoz, Stripe és IPN webhookhoz, díjbekérőhöz, pénztári nyugtához, PDF tárhelyhez, Cloudflare Workershez és tesztekhez.
- 🤖 **[llms.txt]({{llms}})**: a dokumentáció tartalomjegyzéke AI asszisztenseknek, a teljes szöveg egy fájlban: [llms-full.txt]({{llmsFull}}).
- 📦 **[npm csomag]({{npm}})** · 🏛️ **[Hivatalos Számlázz.hu Agent dokumentáció]({{officialDocs}})**

<details>
<summary>🍳 <b>Mind a {{recipeCount}} recept</b></summary>

{{recipe-list}}

</details>

<details>
<summary>▶️ <b>Mind a {{examples}} sandbox példa</b></summary>

{{example-list}}

</details>

## Beállítás

Az Agent kulcsot a Számlázz.hu felületén, a vezérlőpult alján generálhatod.

```bash
SZAMLAZZ_AGENT_KEY=a-te-agent-kulcsod
```

```ts
import { createKassza } from 'kassza'

export const kassza = createKassza()
```

<details>
<summary><b>Alapbeállítások és a kulcs ellenőrzése</b> · <code>defaults</code>, <code>verifyCredentials()</code></summary>

Az ismétlődő adatokat elég egyszer megadni:

```ts
export const kassza = createKassza({
  agentKey: process.env.SZAMLAZZ_AGENT_KEY,
  defaults: {
    invoice: {
      prefix: 'WEB',
      paymentDueInDays: 8,
      seller: { emailReplyTo: 'penzugy@ceg.hu', emailSubject: 'Elkészült a számlád' },
    },
    receipt: { prefix: 'NYGT', paymentMethod: 'bankkártya' },
  },
})

await kassza.verifyCredentials()
```

A `verifyCredentials()` visszatérési értéke `true`, ha a kulcs jó.

{{more:alapok/hitelesites|kulcs-ellenorzes}}

</details>

{{links:alapok/kliens-beallitasa|kulcs-ellenorzes|kozos-kliens}}

## Számlák

Egyetlen metódus, az `invoices.create()` állít ki számlát, díjbekérőt, előleg-, vég- és helyesbítő számlát vagy szállítólevelet. Mellette ott a sztornó, a befizetés, a PDF és a lekérdezés.

<details>
<summary><b>Számla</b> · <code>invoices.create()</code></summary>

```ts
const szamla = await kassza.invoices.create({
  orderNumber: 'REND-1001',
  paymentMethod: 'bankkártya',
  paid: true,
  buyer: {
    name: 'Vevő Kft.',
    zip: '1111',
    city: 'Budapest',
    address: 'Fő utca 1.',
    email: 'vevo@ceg.hu',
    taxNumber: '12345678-2-42',
  },
  items: [
    { name: 'Póló', quantity: 2, grossUnitPrice: 5_990, vat: 27 },
    { name: 'Szállítás', grossUnitPrice: 1_490, vat: 27 },
  ],
})

szamla.number
szamla.netTotal
szamla.grossTotal
szamla.pdf
```

- Az `orderNumber` a saját azonosítód, ezzel később vissza is keresheted a számlát.
- A `szamla.pdf` egy `Uint8Array`.

{{more:szamla-letrehozas/keres|szamla}}

</details>

<details>
<summary><b>Nettó vagy bruttó ár, áfakulcsok</b> · <code>netUnitPrice</code>, <code>grossUnitPrice</code>, <code>vat</code></summary>

Az ár megadható nettóban vagy bruttóban, a kerekítés a hivatalos szabályok szerint történik:

```ts
{ name: 'Tanácsadás', netUnitPrice: 20_000, vat: 27 }
{ name: 'Belépő', grossUnitPrice: 4_990, vat: 27 }
{ name: 'Könyv', grossUnitPrice: 3_500, vat: 5 }
{ name: 'Oktatás', netUnitPrice: 50_000, vat: 'AAM' }
```

A nettó ár a B2B számlákhoz, a bruttó ár a B2C számlákhoz való. Az `'AAM'` alanyi adómentes tételt jelöl, a többi áfakódot a {{doc:szamla-letrehozas/beallitasok-es-szabalyok/afakulcsok}} oldal sorolja fel.

{{more:szamla-letrehozas/beallitasok-es-szabalyok/kerekites|szamla-brutto}}

</details>

<details>
<summary><b>Díjbekérő, majd számla</b> · <code>type: 'proforma'</code></summary>

```ts
const dijbekero = await kassza.invoices.create({
  type: 'proforma',
  orderNumber: 'NEV-42',
  buyer,
  items,
})

const szamla = await kassza.invoices.create({
  proformaNumber: dijbekero.number,
  orderNumber: 'NEV-42',
  paid: true,
  buyer,
  items,
})
```

{{more:szamla-letrehozas/beallitasok-es-szabalyok/bizonylattipusok|dijbekero-szamla}}

</details>

<details>
<summary><b>Díjbekérő törlése</b> · <code>invoices.deleteProforma()</code></summary>

```ts
await kassza.invoices.deleteProforma({ orderNumber: 'NEV-42' })
```

{{more:dijbekero-torlese|dijbekero-torlese}}

</details>

<details>
<summary><b>Előleg- és végszámla</b> · <code>type: 'advance'</code>, <code>'final'</code></summary>

```ts
const eloleg = await kassza.invoices.create({
  type: 'advance',
  orderNumber: 'PROJ-7',
  buyer,
  items: [{ name: 'Előleg', netUnitPrice: 300_000, vat: 27 }],
})

await kassza.invoices.create({
  type: 'final',
  advanceInvoiceNumber: eloleg.number,
  orderNumber: 'PROJ-7',
  buyer,
  items: [
    { name: 'Weboldal', netUnitPrice: 1_000_000, vat: 27 },
    { name: 'Előleg levonása', quantity: -1, netUnitPrice: 300_000, vat: 27 },
  ],
})
```

{{more:szamla-letrehozas/beallitasok-es-szabalyok/bizonylattipusok|eloleg-vegszamla}}

</details>

<details>
<summary><b>Helyesbítő számla</b> · <code>type: 'corrective'</code></summary>

```ts
await kassza.invoices.create({
  type: 'corrective',
  correctedInvoiceNumber: 'E-WEB-2026-12',
  buyer,
  items: [{ name: 'Póló visszáru', quantity: -1, grossUnitPrice: 5_990, vat: 27 }],
})
```

{{more:szamla-letrehozas/beallitasok-es-szabalyok/bizonylattipusok|helyesbito-szamla}}

</details>

<details>
<summary><b>Szállítólevél</b> · <code>type: 'deliveryNote'</code></summary>

```ts
await kassza.invoices.create({ type: 'deliveryNote', buyer, items })
```

{{more:szamla-letrehozas/beallitasok-es-szabalyok/bizonylattipusok|}}

</details>

<details>
<summary><b>Devizás számla, külföldi vevő</b> · <code>currency</code>, <code>language</code></summary>

```ts
await kassza.invoices.create({
  currency: 'EUR',
  language: 'en',
  buyer: {
    name: 'Acme GmbH',
    country: 'Germany',
    zip: '10115',
    city: 'Berlin',
    address: 'Hauptstr. 1',
    euTaxNumber: 'DE123456789',
    taxpayerType: 'euBusiness',
  },
  items: [{ name: 'Consulting', quantity: 8, unit: 'hour', netUnitPrice: 95, vat: 'EUFAD37' }],
})
```

Az árfolyam, ha nem adod meg, automatikusan az MNB aktuális árfolyama. Kész minta: {{recipe:devizas-eu-szamla}}.

{{more:szamla-letrehozas/beallitasok-es-szabalyok/penznemek|devizas-szamla}}

</details>

<details>
<summary><b>Előnézet, számla kiállítása nélkül</b> · <code>invoices.preview()</code></summary>

```ts
const { pdf, grossTotal } = await kassza.invoices.preview({ buyer, items })
```

{{more:szamla-letrehozas/beallitasok-es-szabalyok/elonezet|elonezet}}

</details>

<details>
<summary><b>Melléklet az e-mailhez</b> · <code>attachments</code></summary>

```ts
await kassza.invoices.create({
  buyer,
  items,
  attachments: [{ filename: 'aszf.pdf', content: aszfPdfBytes, contentType: 'application/pdf' }],
})
```

Legfeljebb 5 melléklet adható meg, darabonként 2 MB.

{{more:szamla-letrehozas/beallitasok-es-szabalyok/ertesito-email|}}

</details>

<details>
<summary><b>Sztornó</b> · <code>invoices.reverse()</code></summary>

```ts
const sztorno = await kassza.invoices.reverse('E-WEB-2026-12')
```

{{more:szamla-sztorno|sztorno}}

</details>

<details>
<summary><b>Befizetés rögzítése</b> · <code>invoices.registerPayment()</code></summary>

```ts
await kassza.invoices.registerPayment({ invoiceNumber: 'E-WEB-2026-12', amount: 12_700 })

await kassza.invoices.registerPayment({
  invoiceNumber: 'E-WEB-2026-13',
  payments: [
    { method: 'készpénz', amount: 5_000, date: '2026-09-01' },
    { method: 'átutalás', amount: 7_700 },
  ],
})

await kassza.invoices.clearPayments('E-WEB-2026-12')
```

A `registerPayment` egyetlen befizetést és több részletet is fogad. A `clearPayments` az összes befizetést törli a számláról.

{{more:befizetes-rogzitese|befizetes}}

</details>

<details>
<summary><b>PDF letöltése utólag</b> · <code>invoices.getPdf()</code></summary>

```ts
import { writeFile } from 'node:fs/promises'

const { pdf } = await kassza.invoices.getPdf('E-WEB-2026-12')
await writeFile('szamla.pdf', pdf)
```

Rendelésszám vagy külső azonosító alapján is működik: `getPdf({ orderNumber: 'REND-1001' })`, `getPdf({ externalId: 'a1b2' })`.

{{more:bizonylat-pdf|pdf-lekeres}}

</details>

<details>
<summary><b>Számla adatainak lekérése</b> · <code>invoices.get()</code>, <code>invoices.find()</code></summary>

```ts
const adatok = await kassza.invoices.get({ orderNumber: 'REND-1001' })
adatok.header.issueDate
adatok.buyer.name
adatok.items
adatok.payments

const talan = await kassza.invoices.find({ orderNumber: 'REND-9999' })
```

A `find` `null`-t ad, ha nincs ilyen számla, a `get` ilyenkor hibát dob.

{{more:szamla-adatai|szamla-adatai}}

</details>

{{links:szamla-letrehozas|szamla|fizetett-rendeles-szamla}}

## Nyugták

Nyugta kiállítása, kiküldése e-mailben, lekérdezése és sztornózása, forintos kerekítéssel és a dupla nyugta elleni hívásazonosítóval.

<details>
<summary><b>Nyugta</b> · <code>receipts.create()</code></summary>

```ts
const nyugta = await kassza.receipts.create({
  prefix: 'NYGT',
  paymentMethod: 'készpénz',
  callId: 'KASSZA-2026-0001',
  items: [
    { name: 'Kávé', quantity: 2, grossUnitPrice: 890, vat: 27 },
    { name: 'Kifli', grossUnitPrice: 250, vat: 5 },
  ],
})

nyugta.number
nyugta.totals.grossAmount
nyugta.pdf
```

A `callId` véd a dupla nyugta ellen.

{{more:nyugta-letrehozas|nyugta}}

</details>

<details>
<summary><b>Kiküldés e-mailben</b> · <code>receipts.send()</code></summary>

```ts
await kassza.receipts.send({ receiptNumber: nyugta.number, emails: 'vevo@ceg.hu' })
```

{{more:nyugta-kikuldes|nyugta-kikuldes}}

</details>

<details>
<summary><b>Lekérdezés</b> · <code>receipts.get()</code>, <code>receipts.find()</code></summary>

```ts
const ugyanaz = await kassza.receipts.get(nyugta.number)
const rendelesbol = await kassza.receipts.find({ orderNumber: 'REND-1001' })
```

{{more:nyugta-lekerdezes|nyugta-lekerdezes}}

</details>

<details>
<summary><b>Sztornó</b> · <code>receipts.reverse()</code></summary>

```ts
await kassza.receipts.reverse(nyugta.number)
```

{{more:nyugta-sztorno|nyugta-sztorno}}

</details>

{{links:nyugta-letrehozas|nyugta|penztari-nyugta}}

## Adószám lekérdezés

Egy adószámból megkapod a cég nevét és székhelyét, így a vevő adatait nem kell kézzel begépelni.

<details>
<summary><b>Cégadatok adószám alapján</b> · <code>taxpayer.query()</code></summary>

```ts
const ceg = await kassza.taxpayer.query('13421739')

if (ceg.valid) {
  ceg.name
  ceg.taxNumber?.formatted
  ceg.address?.formatted
}
```

A cégadatok a NAV-tól jönnek, a cím formázva, például `1031 Budapest, Záhony utca 7.`

{{more:adoszam-lekerdezes|adoszam}}

</details>

{{links:adoszam-lekerdezes|adoszam|adoszam-urlap}}

## Hibakezelés

Minden hiba `SzamlazzError`, magyar üzenettel és javítási tippel.

<details>
<summary><b>Duplikált rendelésszám és validációs hiba</b> · <code>isSzamlazzError()</code></summary>

```ts
import { isSzamlazzError } from 'kassza'

try {
  await kassza.invoices.create(input)
} catch (error) {
  if (!isSzamlazzError(error)) throw error

  if (error.isDuplicate) return kassza.invoices.find({ orderNumber: input.orderNumber! })
  if (error.category === 'validation') console.error(error.message, error.hint)
  throw error
}
```

- `error.code`: a Számlázz.hu hibakódja, például `57`.
- `error.hint`: magyar javítási tipp.

{{more:alapok/hibakezeles|hibakezeles-idempotens}}

</details>

<details>
<summary><b>Hibakategóriák</b> · <code>error.category</code></summary>

| `error.category` | Jelentés |
|---|---|
| `validation` | Hibás adat, a kérés el sem ment, vagy a Számlázz.hu elutasította |
| `duplicate` | Ez a rendelésszám vagy `callId` már létezik |
| `partial_success` | A számla elkészült, csak az e-mail nem ment ki. **Ne állítsd ki újra!** |
| `not_found` | Nincs ilyen bizonylat |
| `auth` / `account` | Rossz kulcs, lejárt előfizetés |
| `network` / `timeout` / `maintenance` | Átmeneti hiba |

{{more:alapok/hibakezeles|hibakezeles-validacio}}

</details>

> **Számlát a kassza soha nem küld újra.** Újraküldés csak ott történik magától, ahol biztonságos: lekérdezéseknél, hálózati hibánál, legfeljebb 5-ször. A Számlázz.hu kitiltja azt, aki ciklusban próbálkozik. Bizonytalan hiba után a `find({ orderNumber })` megmondja, elkészült-e a számla.

{{links:alapok/hibakezeles|hibakezeles-idempotens|fizetett-rendeles-szamla}}

## Fizetési értesítés (IPN)

A Számlázz.hu értesít, ha egy számlát kifizettek.

<details>
<summary><b>Next.js route handler</b> · <code>readIpnNotification()</code></summary>

```ts
import { ipnOkResponse, readIpnNotification } from 'kassza/ipn'

export async function POST(request: Request) {
  const ipn = await readIpnNotification(request)

  if (ipn.isFullyPaid) await rendelesFizetve(ipn.orderNumber, ipn.paidAmount)

  return ipnOkResponse()
}
```

{{more:befizetes-rogzitese/ipn|ipn}}

</details>

<details>
<summary><b>Csak a Számlázz.hu IP-címeiről</b> · <code>isSzamlazzIp()</code></summary>

Csak a Számlázz.hu IP-címeiről jövő kérést érdemes elfogadni:

```ts
import { isSzamlazzIp } from 'kassza/ipn'

isSzamlazzIp(request.headers.get('x-forwarded-for') ?? '')
```

{{more:befizetes-rogzitese/ipn|}}

</details>

{{links:befizetes-rogzitese/ipn|ipn|ipn-webhook}}

## PDF mentése tárhelyre

S3, Cloudflare R2, MinIO vagy Backblaze esetén nem kell az AWS SDK.

<details>
<summary><b>S3 és Cloudflare R2</b> · <code>s3FetchStorage()</code>, <code>storePdf()</code></summary>

```ts
import { invoicePdfKey, s3FetchStorage, storePdf } from 'kassza/storage'

const tarhely = s3FetchStorage({
  bucket: 'szamlak',
  region: 'auto',
  endpoint: 'https://<account-id>.r2.cloudflarestorage.com',
  accessKeyId: process.env.R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
})

const szamla = await kassza.invoices.create(input)
const fajl = await storePdf(tarhely, invoicePdfKey({ number: szamla.number }), szamla.pdf!)

fajl.key
```

A kulcs például `szamlak/2026/09/E-WEB-2026-12.pdf` lesz.

{{more:kiegeszitok/pdf-tarhely|pdf-tarhely}}

</details>

<details>
<summary><b>Fájlrendszer (Node)</b> · <code>fsStorage()</code></summary>

```ts
import { fsStorage } from 'kassza/storage/fs'

const tarhely = fsStorage({ directory: './szamlak' })
```

{{more:kiegeszitok/pdf-tarhely|}}

</details>

További adapterek: `s3Storage` (AWS SDK), `r2BindingStorage`, `vercelBlobStorage`, `uploadthingStorage`, `supabaseStorage`, `memoryStorage`.

{{links:kiegeszitok/pdf-tarhely|pdf-tarhely|pdf-mentes-s3-r2}}

## Serverless és edge

A session cookie újrahasznosítása gyorsítja a hívásokat. Serverless környezetben tedd közös tárolóba.

<details>
<summary><b>Upstash Redis</b> · <code>upstashRedisCookieStore()</code></summary>

```ts
import { Redis } from '@upstash/redis'
import { upstashRedisCookieStore } from 'kassza/cookie-stores'

const kassza = createKassza({ cookieStore: upstashRedisCookieStore(Redis.fromEnv()) })
```

{{more:alapok/munkamenet|munkamenet}}

</details>

<details>
<summary><b>Cloudflare Workers</b> · <code>cloudflareKvCookieStore()</code></summary>

```ts
import { cloudflareKvCookieStore } from 'kassza/cookie-stores'

const kassza = createKassza({ agentKey: env.SZAMLAZZ_AGENT_KEY, cookieStore: cloudflareKvCookieStore(env.KASSZA_KV) })
```

{{more:kiegeszitok/serverless-es-edge|}}

</details>

Van még `ioredisCookieStore`, `nodeRedisCookieStore` és `customCookieStore` is. Ha a tároló elérhetetlen, a számlázás attól még működik.

{{links:kiegeszitok/serverless-es-edge|munkamenet|cloudflare-workers}}

## Tesztelés

A mock kliens valódi API-hívás nélkül működik, de ugyanazt a validációt és kerekítést futtatja, mint az éles kliens.

<details>
<summary><b>Vitest példa</b> · <code>createMockKassza()</code></summary>

```ts
import { createMockKassza } from 'kassza/testing'

test('fizetés után számlát állít ki', async () => {
  const kassza = createMockKassza()

  await fizetesKezelo(rendeles, kassza)

  expect(kassza.calls.map((call) => call.method)).toEqual(['invoices.create'])
  expect([...kassza.invoiceRecords.values()][0]?.details.totals.grossAmount).toBe(12_700)
})

test('hálózati hibánál nem számláz kétszer', async () => {
  const kassza = createMockKassza()
  kassza.failNext('invoices.create')

  await expect(fizetesKezelo(rendeles, kassza)).rejects.toThrow()
})
```

{{more:kiegeszitok/teszteles|mock-kliens}}

</details>

{{links:kiegeszitok/teszteles|mock-kliens|egysegtesztek}}

## Validátorok és pénzszámítás

Magyar adószám, bankszámla, IBAN, EU adószám és cím ellenőrzése űrlapokhoz, és ugyanaz a kerekítés, amit a számlák is használnak.

<details>
<summary><b>Validátorok</b> · <code>kassza/validators</code></summary>

```ts
import {
  isValidHungarianBankAccount,
  isValidHungarianTaxNumber,
  parseHungarianAddress,
} from 'kassza/validators'

isValidHungarianTaxNumber('13421739-2-41')
isValidHungarianBankAccount('11773016-11111018')
parseHungarianAddress('1031 Budapest, Záhony utca 7.')
```

A `parseHungarianAddress` eredménye `{ zip: '1031', city: 'Budapest', address: 'Záhony utca 7.' }`. Ezen kívül van `isValidHungarianIban`, `isValidHungarianZipCode`, `isValidEuVatNumber` és `isValidEmail` is.

{{more:kiegeszitok/validatorok|validatorok}}

</details>

<details>
<summary><b>Pénzszámítás</b> · <code>kassza/money</code></summary>

```ts
import { calculateInvoiceItem, calculateReceiptItem } from 'kassza/money'

calculateInvoiceItem({ quantity: 3, grossUnitPrice: 500, vat: 27 })
calculateReceiptItem({ grossUnitPrice: 1_000, vat: 27 })
```

Az első eredménye `{ netAmount: 1181, vatAmount: 319, grossAmount: 1500, ... }`, a másodiké `{ netAmount: 787.4, vatAmount: 212.6, grossAmount: 1000, ... }`.

{{more:kiegeszitok/penzszamitas|kerekites}}

</details>

{{links:kiegeszitok|validatorok}}

## Haladó beállítások

Időkorlát, újrapróbálás a lekérdezéseknél, naplózás hookokkal és megszakítás `AbortSignal`-lal.

<details>
<summary><b>Időkorlát, újrapróbálás és hookok</b> · <code>timeoutMs</code>, <code>maxAttempts</code>, <code>hooks</code></summary>

```ts
const kassza = createKassza({
  timeoutMs: 30_000,
  maxAttempts: 3,
  hooks: {
    onResponse: ({ action, status, durationMs }) => logger.info({ action, status, durationMs }),
    onError: ({ action, error, willRetry }) => logger.warn({ action, code: error.code, willRetry }),
  },
})

await kassza.invoices.getPdf('E-WEB-2026-12', { signal: AbortSignal.timeout(5_000) })
```

- A `maxAttempts` csak a lekérdezésekre vonatkozik, és legfeljebb 5 lehet.
- A hookok soha nem kapják meg az Agent kulcsot.
- Minden metódus fogad `AbortSignal`-t.

{{more:alapok/halozat-es-biztonsag|hookok}}

</details>

<details>
<summary><b>Új session kérése</b> · <code>resetSession()</code></summary>

A `resetSession()` új sessiont kér. Hívd meg, ha a Számlázz.hu fiókban megváltoztak a cégadatok:

```ts
await kassza.resetSession()
```

{{more:alapok/munkamenet|munkamenet}}

</details>

{{links:alapok/halozat-es-biztonsag|hookok}}

## AI-val kódolsz?

A csomagban van egy `agents/` mappa. Ebből a Claude Code, a Cursor, a Copilot és a többi asszisztens megtudja, hogyan kell jól használni a kasszát, és mik a buktatók. Szólj rá az AI-ra:

> Használd a kassza csomagot, és előbb olvasd el a `node_modules/kassza/agents/README.md`-t.

Claude Code-hoz kész skill is van: másold a `node_modules/kassza/agents/skills/kassza` mappát a projekted `.claude/skills/` mappájába.

A weboldal is AI-barát: az [llms.txt]({{llms}}) a dokumentáció tartalomjegyzéke, az [llms-full.txt]({{llmsFull}}) a teljes dokumentáció egy fájlban, és minden oldal Markdownként is elérhető, ha az URL végére `.md` kerül.

{{links:kiegeszitok/ai-asszisztensek}}

---

<p align="center">
  <a href="{{web}}">Weboldal</a> · <a href="{{docs}}">Dokumentáció</a> · <a href="{{sandbox}}">Sandbox</a> · <a href="{{recipes}}">Receptek</a> · <a href="{{npm}}">npm</a> · <a href="{{changelog}}">Változásnapló</a>
</p>

<sub>Nem hivatalos csomag, nem kapcsolódik a KBOSS.hu Kft.-hez (Számlázz.hu). A hivatalos dokumentáció a <a href="{{officialDocs}}">docs.szamlazz.hu</a> oldalon érhető el. MIT licenc.</sub>
