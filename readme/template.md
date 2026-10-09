<p align="center">
  <a href="{{web}}">{{picture:hero|kassza: Számlázz.hu, TypeScriptben. Telepítés: npm i kassza|100%}}</a>
</p>

<p align="center">
  <b>Számlázz.hu, TypeScriptben, egyszerűbben.</b><br>
  Nem hivatalos TypeScript wrapper a Számlázz.hu Számla Agenthez. Mind a 11 Agent művelet, 0 függőség, nulla runtime kompromisszum.<br>
  <sub><a href="{{repo}}/blob/main/README.en.md">English overview</a></sub>
</p>

<p align="center">
  {{badges}}
</p>

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
- **Nincs dupla számla.** Számlát a kassza soha nem küld újra magától. A `createOnce()` kiállítás előtt megkeresi a bizonylatot, bizonytalan hiba után pedig visszakeresi.
- **Fizetésből bizonylat.** Stripe, SimplePay, Barion, Revolut és PayPal webhookból pontosan egyszer nyugta vagy számla, visszatérítéskor sztornó.
- **NAV nyugta-adatszolgáltatás.** Napi összesítő és egyeztetés a 2026. szeptember 1-jétől kötelező adatszolgáltatáshoz.
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

| Kezdés | Műveletek | Integrációk | Kiegészítők |
| --- | --- | --- | --- |
| 🌐 [Weboldal, sandbox és receptek](#weboldal-sandbox-és-receptek) | 📄 [Számlák](#számlák) | 💳 [Fizetésből bizonylat](#fizetésből-bizonylat) | 🗄️ [PDF mentése tárhelyre](#pdf-mentése-tárhelyre) |
| ⚙️ [Beállítás](#beállítás) | 🧾 [Nyugták](#nyugták) | 📊 [NAV nyugta-adatszolgáltatás](#nav-nyugta-adatszolgáltatás) | ⚡ [Serverless és edge](#serverless-és-edge) |
| 🚨 [Hibakezelés](#hibakezelés) | 🏛️ [Adószám lekérdezés](#adószám-lekérdezés) | 🤝 [Megbízotti számlázás](#megbízotti-számlázás) | 🧪 [Tesztelés](#tesztelés) |
| 🎛️ [Haladó beállítások](#haladó-beállítások) | 🔔 [Fizetési értesítés (IPN)](#fizetési-értesítés-ipn) | 🔗 [Pénzügyi adatkapcsolat](#pénzügyi-adatkapcsolat) | 🧮 [Validátorok és pénzszámítás](#validátorok-és-pénzszámítás) |
| 🤖 [AI-val kódolsz?](#ai-val-kódolsz) | 🔁 [Tömeges számlázás](#tömeges-és-ismétlődő-számlázás) | 🟩 [Node.js és Express](#nodejs-és-express) | 💻 [Parancssor és MCP szerver](#parancssor-és-mcp-szerver) |
| | | 📒 [Bizonylatnapló](#bizonylatnapló) | 📈 [Megfigyelhetőség](#megfigyelhetőség) |

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
    taxNumber: '12345676-2-42',
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

Ha ugyanaz a befizetés több helyről is érkezhet (banki értesítés, webhook), a `registerPaymentOnce({ invoiceNumber, key, amount })` egy stabil kulccsal pontosan egyszer rögzíti: a kulcsot jelölőként a befizetés leírásába teszi, és rögzítés előtt megkeresi.

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

Nyugta kiállítása, kiküldése e-mailben, lekérdezése és sztornózása, forintos kerekítéssel és a dupla nyugta elleni hívásazonosítóval. A Számla Agent nyugtája számítógéppel előállított nyugta, online pénztárgépet nem pótol: csak nem pénztárgép-köteles tevékenységhez adható, például webshopban vagy food truckban. Részletek: {{doc:alapok/nyugta-vagy-szamla}}.

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

<details>
<summary><b>Nyugta vagy számla?</b> · <code>chooseDocument()</code>, <code>receipts.convertToInvoice()</code></summary>

```ts
import { chooseDocument } from 'kassza'

const dontes = chooseDocument({ grossTotal: 18_990, invoiceRequested: false })

dontes.type
dontes.reasons
```

Nyugta csak akkor adható, ha a vevő nem adóalany és nem jogi személy, az összeg 900 000 Ft alatti, a teljesítésig kifizetik, és a vevő nem kér számlát. Ha a vevő utólag kér számlát, a `convertToInvoice()` sztornózza a nyugtát, és számlát állít ki helyette, pontosan egyszer:

```ts
const atalakitas = await kassza.receipts.convertToInvoice({
  receiptNumber: nyugta.number,
  buyer: { name: 'Példa Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.', taxNumber: '12345676-2-42' },
})

atalakitas.invoice.number
```

{{more:alapok/nyugta-vagy-szamla|}}

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

A cégadatok a NAV-tól jönnek, a cím formázva, például `1031 Budapest, Záhony utca 7.` Űrlapokhoz a `taxpayerCache: { store }` beállítás közös tárolóban megjegyzi az eredményt, így ugyanaz az adószám csak egyszer megy ki.

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
| `rate_limit` | A tesztfiókban túl sok bizonylat készült rövid idő alatt (167) |
| `attempt_limit` | Ezt a kérést már ötször sikertelenül küldték el, ezért a kassza el sem küldi |
| `in_progress` | Egy másik folyamat éppen ugyanezt a bizonylatot állítja ki (a `createOnce` zárja) |
| `store_unavailable` | Egy kötelezőnek beállított tároló (zár, napló) nem érhető el, a kérés el sem ment |

Minden ismert hibakódnak saját oldala van; a hiba `docsUrl` mezője oda mutat, így a naplóból egy kattintás.

{{more:alapok/hibakezeles|hibakezeles-validacio}}

</details>

<details>
<summary><b>Pontosan egyszer</b> · <code>invoices.createOnce()</code>, <code>receipts.createOnce()</code></summary>

```ts
const { number, created } = await kassza.invoices.createOnce({
  orderNumber: 'REND-1001',
  paid: true,
  buyer,
  items,
})
```

Kiállítás előtt megkeresi a számlát, hálózati hiba, időtúllépés vagy 56-os hiba után pedig visszakeresi. Ha a webhook kétszer fut le, a második hívás `created: false` eredménnyel a meglévő számlát adja. Az egyszerre érkező, azonos rendelésre szóló hívásokat a kassza összevonja; több szerver vagy serverless példány között a `createOnceLock` közös tároló zárja véd a dupla számla ellen:

```ts
import { upstashRedisStore } from 'kassza/stores'

const store = upstashRedisStore(Redis.fromEnv())
const kassza = createKassza({ cookieStore: store, attemptLedger: store, createOnceLock: store })
```

Az `attemptLedger` a folyamatok között is betartja az öt próbálkozásos korlátot, atomikus számlálóval.

{{more:alapok/pontosan-egyszer|penztari-nyugta}}

</details>

> **Számlát a kassza soha nem küld újra.** Újraküldés csak ott történik magától, ahol biztonságos: lekérdezéseknél, hálózati hibánál, legfeljebb 5-ször. A Számlázz.hu kitiltja azt, aki ciklusban próbálkozik. Bizonytalan hiba után a `find({ orderNumber })` megmondja, elkészült-e a számla, a `createOnce()` pedig ezt el is végzi helyetted.

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

isSzamlazzIp(request.headers.get('x-forwarded-for'))
```

Az `x-forwarded-for` fejlécből a **jobb szélső** címet vizsgálja, vagyis azt, amit a hozzád legközelebbi proxy látott, mert a fejléc bal oldalát a kliens is írhatja. Ha több megbízható proxy van előtted, add meg a számukat: `isSzamlazzIp(fejlec, { trustedProxies: 1 })`.

{{more:befizetes-rogzitese/ipn|}}

</details>

{{links:befizetes-rogzitese/ipn|ipn|ipn-webhook}}

## Fizetésből bizonylat

Stripe, SimplePay, Barion, Revolut vagy PayPal fizetésből nyugta vagy számla, a szolgáltató SDK-ja nélkül. A webhookkezelő ellenőrzi az aláírást, az `issueForPayment()` pedig eldönti, hogy nyugta vagy számla jár, és pontosan egyszer kiállítja.

<details>
<summary><b>Stripe webhook</b> · <code>stripeWebhook()</code>, <code>issueForPayment()</code></summary>

```ts
import { stripeWebhook } from 'kassza/payments/stripe'

export const POST = stripeWebhook({
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
  apiKey: process.env.STRIPE_SECRET_KEY,
  onPayment: (payment) => kassza.issueForPayment(payment, { vat: 27 }),
})
```

- Az újraküldött webhook nem állít ki második bizonylatot; a `dedupe: store` opcióval a már feldolgozott eseményt a Számla Agent hívása nélkül nyugtázza.
- Teljes visszatérítéskor a kassza sztornózza a bizonylatot.
- Részleges visszatérítéskor számlánál visszatérítésenként egy helyesbítő számlát állít ki, a visszatérített összeget tételenként pontosan szétosztva; több áfakulcsnál és nyugtánál javaslatot ad.
- Ugyanígy működik a `simplePayWebhook`, a `barionWebhook`, a `revolutWebhook` és a `payPalWebhook`.

{{more:fizetesek|}}

</details>

{{links:fizetesek||stripe-webhook}}

## NAV nyugta-adatszolgáltatás

2026. szeptember 1-jétől a számítógéppel előállított nyugtákról is napi összesítőt kell küldeni a NAV-nak. A Számlázz.hu a nála kiállított nyugtákat a NAV összekötés után maga jelenti, a kassza abban segít, hogy ellenőrizd: minden napod megérkezett.

<details>
<summary><b>Napi összesítő és egyeztetés</b> · <code>navDailyReports()</code>, <code>reconcileNavReports()</code></summary>

```ts
import { createNavReceiptClient, reconcileNavReports } from 'kassza/nav'
import { navDailyReports } from 'kassza/reports'

const nav = createNavReceiptClient({
  environment: 'production',
  login: process.env.NAV_LOGIN!,
  password: process.env.NAV_PASSWORD!,
  signatureKey: process.env.NAV_SIGNATURE_KEY!,
  taxNumber: process.env.NAV_TAX_NUMBER!,
})

const helyi = navDailyReports(nyugtak)
const nalNav = await nav.listAllReports({ from: '2026-09-01', to: '2026-09-30' })
const { missing, mismatched } = reconcileNavReports(helyi, nalNav)
```

A NAV kliens alapból csak olvas: a Számlázz.hu által jelentett nyugtákat ne küldd be te is, mert az kettős adatszolgáltatás. Beküldeni csak a kézi tartalék nyugtatömb összesítőjét kell (`paperReceiptReport()`).

{{more:nav-nyugta|}}

</details>

{{links:nav-nyugta}}

## Bizonylatnapló

A NAV napi összesítő és a napi zárás a saját nyilvántartásodból számol, mert a Számla Agent nem listáz nyugtákat dátum szerint. A `kassza/journal` ezt a nyilvántartást adja.

<details>
<summary><b>Napló a NAV összesítőhöz</b> · <code>createJournal()</code>, <code>kvJournal()</code></summary>

```ts
import { createJournal, kvJournal } from 'kassza/journal'
import { navDailyReports } from 'kassza/reports'

const journal = createJournal(kvJournal(store))
const kassza = createKassza({
  hooks: { onDocument: (event) => journal.record(event), onDocumentError: 'throw' },
})

const jelentesek = navDailyReports(await journal.receipts({ from: '2026-10-01', to: '2026-10-31' }))
```

- A `trackReceipt()` és a `trackInvoice()` a kiállítás előtt befejezetlen tételt rögzít; ha a folyamat közben leáll, a `settle()` később visszakeresi és lezárja.
- A `reconcile()` az adatkapcsolat napi nyugtaarchívumával egyeztet, és pótolja a hiányzó tételeket.

{{more:kiegeszitok/bizonylatnaplo|}}

</details>

{{links:nav-nyugta/hatarido}}

## Megbízotti számlázás

Platformoknak, amelyek sok cég nevében állítanak ki bizonylatot, a cégek saját Számlázz.hu fiókjában.

<details>
<summary><b>Csatlakozás és kliens megbízónként</b> · <code>connectPrincipal()</code>, <code>createKasszaPool()</code></summary>

```ts
import { connectPrincipal, createKasszaPool } from 'kassza/delegation'

const { status } = await connectPrincipal({
  principal: {
    name: 'Példa Kft.',
    taxNumber: '12345676-2-42',
    invoicePrefix: 'PLDA',
    zip: '1111',
    city: 'Budapest',
    address: 'Fő utca 1.',
    email: 'penzugy@pelda.hu',
  },
  user: { email: 'kassza+pelda@platform.hu', password: process.env.DELEGATE_PASSWORD!, firstName: 'Platform' },
})

const pool = createKasszaPool({ resolve: (megbizoId) => megbizoAdatai(megbizoId) })
const kliens = await pool.get('pelda')
await kliens.invoices.createOnce({ orderNumber: 'FOGLALAS-881', buyer, items })
```

A megbízó e-mailt kap, és a fiók birtokba vétele vagy a csatlakozási kérelem elfogadása után lehet a nevében kiállítani.

{{more:megbizott-szamlazas|}}

</details>

{{links:megbizott-szamlazas}}

## Pénzügyi adatkapcsolat

Könyvelő- és ERP-rendszereknek: a Számlázz.hu átküldi a kiállított és befogadott számlákat, a banki tranzakciókat és a nyugtákat.

<details>
<summary><b>Fogadó végpont</b> · <code>dataLinkHandler()</code></summary>

```ts
import { dataLinkHandler } from 'kassza/data-link'

export const POST = dataLinkHandler({
  verifyKey: async (kulcs) => (await ugyfelKulcsai()).includes(kulcs),
  onPush: async (push) => {
    const iktatoszam = await bizonylatMentese(push)
    return { registrationNumber: iktatoszam }
  },
})
```

A kulcs ellenőrzése kötelező, mert az üzeneteknek nincs aláírása. A Számlázz.hu által elvárt válasz XML-t a kezelő készíti el.

{{more:adatkapcsolat|}}

</details>

{{links:adatkapcsolat}}

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
<summary><b>Upstash Redis</b> · <code>upstashRedisStore()</code></summary>

```ts
import { Redis } from '@upstash/redis'
import { upstashRedisStore } from 'kassza/stores'

const kassza = createKassza({ cookieStore: upstashRedisStore(Redis.fromEnv()) })
```

{{more:alapok/munkamenet|munkamenet}}

</details>

<details>
<summary><b>Cloudflare Workers</b> · <code>cloudflareKvStore()</code>, <code>durableObjectStore()</code></summary>

```ts
import { cloudflareKvStore } from 'kassza/stores'

const kassza = createKassza({ agentKey: env.SZAMLAZZ_AGENT_KEY, cookieStore: cloudflareKvStore(env.KASSZA_KV) })
```

A KV munkamenetnek jó, de nincs benne atomikus írás: a `createOnce` zárjához és a naplóhoz Workers alatt a `durableObjectStore()` kell.

{{more:kiegeszitok/serverless-es-edge|}}

</details>

Van még `ioredisStore`, `nodeRedisStore` és `customStore` is (a régi `kassza/cookie-stores` nevek is működnek). A `diagnoseStore(store)` megmondja, mire alkalmas egy tároló. Ha a tároló elérhetetlen, a számlázás attól még működik.

A csomag minden futtatókörnyezetben ugyanazt adja: a CI a buildelt csomagot Node.js, Bun, Deno és Cloudflare workerd alatt is lefuttatja.

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

<details>
<summary><b>Hamis Számla Agent</b> · <code>createFakeAgentFetch()</code></summary>

```ts
import { createFakeAgentFetch } from 'kassza/testing'

const agent = createFakeAgentFetch()
const kassza = createKassza({ agentKey: 'teszt-kulcs', fetch: agent.fetch, retryDelayMs: 0 })

agent.fail('ghostSuccess', { action: 'createInvoice' })
const eredmeny = await kassza.invoices.createOnce({ orderNumber: 'WEB-1', buyer, items })

eredmeny.created
agent.invoices.size
```

A valódi kliens fut, csak a Számlázz.hu helyett egy memóriában futó hamis Agent válaszol. Elveszett választ, karbantartást, részleges sikert és a Számlázz.hu hibakódjait is szimulálja.

{{more:kiegeszitok/hamis-agent|}}

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

<details>
<summary><b>Bizonylat-események és karbantartási szünet</b> · <code>onDocument</code>, <code>maintenanceCooldownMs</code></summary>

```ts
const kassza = createKassza({
  maintenanceCooldownMs: 60_000,
  hooks: {
    onDocument: async (esemeny) => {
      await auditNaplo(esemeny.kind, esemeny.action, esemeny.number)
    },
  },
})
```

- Az `onDocument` minden kiállított és sztornózott bizonylat, valamint rögzített befizetés után lefut. Ha hibát dob, a bizonylat attól még elkészült; az `onDocumentError: 'throw'` beállítással ilyenkor `DocumentHookError` jön, benne a bizonylattal.
- Az `onWarning` megkapja a korábban csendben elnyelt hibákat (tároló, hook, zár).
- A `maintenanceCooldownMs` karbantartási hiba után ennyi ideig nem küld kérést, hanem azonnal `maintenance` hibát ad, így átválthatsz tartalék folyamatra.

{{more:alapok/pontosan-egyszer|}}

</details>

{{links:alapok/halozat-es-biztonsag|hookok}}

## Megfigyelhetőség

A kassza nem küld haza semmit. A saját rendszeredben a `kassza/observe` ad strukturált naplót, OpenTelemetry-kompatibilis tracinget és Prometheus metrikákat, függőség nélkül és titokmentesen.

<details>
<summary><b>Napló, tracing, metrikák</b> · <code>observe()</code>, <code>createMetricsRegistry()</code></summary>

```ts
import { combineHooks, createMetricsRegistry, observe } from 'kassza/observe'

const metrics = createMetricsRegistry()
const kassza = createKassza({ hooks: combineHooks(observe({ logger: console, metrics }), sajatHookok) })

metrics.renderPrometheus()
```

{{more:kiegeszitok/megfigyelhetoseg|}}

</details>

## Tömeges és ismétlődő számlázás

Havidíj, tagdíj, bérleti díj: a `kassza/batch` idempotens kulcsokkal, sebességkorláttal és próbafuttatással állítja ki a bizonylatokat, és a Számlázz.hu korlátjánál megáll.

<details>
<summary><b>Havi számlázás</b> · <code>runBatch()</code>, <code>billingPeriodAt()</code></summary>

```ts
import { billingPeriodAt, runBatch } from 'kassza/batch'

const idoszak = billingPeriodAt({ interval: 'month', anchor: '2026-01-31' }, new Date())
const eredmeny = await runBatch(kassza, {
  items: elofizetesek.map((elofizetes) => ({
    key: `SUB-${elofizetes.id}-${idoszak.start}`,
    document: () => ({ kind: 'invoice', input: szamlaElofizetesbol(elofizetes, idoszak) }),
  })),
  dryRun: false,
})
```

Egy megszakadt futás újraindítva nem állít ki duplát. A hónap végi kezdőnapot csúszás nélkül kezeli.

{{more:kiegeszitok/tomeges-szamlazas|}}

</details>

## Node.js és Express

A webhook-kezelők Web-szabványos `(Request) => Response` függvények. Express, NestJS és Fastify alá a `kassza/node` köti be őket, a nyers törzs (aláírás!) megőrzésével.

<details>
<summary><b>Express</b> · <code>toNodeHandler()</code></summary>

```ts
import { toNodeHandler } from 'kassza/node'
import { stripeWebhook } from 'kassza/payments/stripe'

app.post('/webhooks/stripe', toNodeHandler(stripeWebhook({ secret, onPayment })))
app.use(express.json())
```

A webhook útvonal az `express.json()` elé kerüljön; ha egy middleware már feldolgozta a törzset, a kassza érthető hibát ad.

{{more:kiegeszitok/node-express|}}

</details>

## Parancssor és MCP szerver

<details>
<summary><b>Parancssor</b> · <code>npx kassza</code></summary>

```bash
npx kassza doctor
npx kassza xml preview szamla.json
npx kassza invoice get --order REND-1001
```

A `doctor` ellenőrzi a Node.js-t, az Agent kulcsot, a gép óráját és a munkamenetet; a `--capabilities` az e-számla engedélyt, a `--report` titokmentes Markdown jelentést ad hibajegyhez. Az `xml preview` kiírja a küldendő XML-t az Agent kulcs nélkül, így supportjegyhez is csatolható.

{{more:kiegeszitok/parancssor|}}

</details>

<details>
<summary><b>MCP szerver</b> · <code>npx kassza mcp</code></summary>

```json
{
  "mcpServers": {
    "kassza": {
      "command": "npx",
      "args": ["-y", "kassza", "mcp"],
      "env": { "SZAMLAZZ_AGENT_KEY": "..." }
    }
  }
}
```

Claude, Cursor és más MCP kliensek számára. Alapból csak olvas. Az `--allow-write` kapcsolóval kiállíthat és sztornózhat is, de minden íráshoz kell a megfelelő előnézeti eszköz megerősítő kódja.

{{more:kiegeszitok/mcp-szerver|}}

</details>

{{links:kiegeszitok/parancssor}}

## AI-val kódolsz?

A csomagban van egy `agents/` mappa. Ebből a Claude Code, a Cursor, a Copilot és a többi asszisztens megtudja, hogyan kell jól használni a kasszát, és mik a buktatók. Szólj rá az AI-ra:

> Használd a kassza csomagot, és előbb olvasd el a `node_modules/kassza/agents/README.md`-t.

Claude Code-hoz kész skill is van: másold a `node_modules/kassza/agents/skills/kassza` mappát a projekted `.claude/skills/` mappájába.

A weboldal is AI-barát: az [llms.txt]({{llms}}) a dokumentáció tartalomjegyzéke, az [llms-full.txt]({{llmsFull}}) a teljes dokumentáció egy fájlban, és minden oldal Markdownként is elérhető, ha az URL végére `.md` kerül.

{{links:kiegeszitok/ai-asszisztensek}}

## Ki használja?

A kassza nem küld semmilyen használati adatot, ezért csak az derül ki, ki használja, aki maga jelzi. Ha éles vagy kísérleti projektben használod, [írd meg egy issue-ban]({{repo}}/issues/new?template=used-by.yml), és felkerülsz ide.

| Projekt | Mire használja |
| --- | --- |
| _Légy te az első._ | |

---

<p align="center">
  <a href="{{web}}">Weboldal</a> · <a href="{{docs}}">Dokumentáció</a> · <a href="{{sandbox}}">Sandbox</a> · <a href="{{recipes}}">Receptek</a> · <a href="{{npm}}">npm</a> · <a href="{{changelog}}">Változásnapló</a>
</p>

<sub>Nem hivatalos csomag, nem kapcsolódik a KBOSS.hu Kft.-hez (Számlázz.hu). A hivatalos dokumentáció a <a href="{{officialDocs}}">docs.szamlazz.hu</a> oldalon érhető el. MIT licenc.</sub>
