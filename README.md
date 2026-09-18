<!-- Ezt a fájlt a readme/build.mjs generálja a readme/template.md alapján. Ne szerkeszd kézzel: írd át a sablont, és futtasd az npm run readme parancsot. -->

<p align="center">
  <a href="https://kassza-amber.vercel.app"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/hero-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/hero-light.svg" alt="kassza: Számlázz.hu, TypeScriptben. Telepítés: npm i kassza" width="100%"></picture></a>
</p>

<p align="center">
  <b>Számlázz.hu, TypeScriptben, egyszerűbben.</b><br>
  Nem hivatalos TypeScript wrapper a Számlázz.hu Számla Agenthez. Mind a 11 Agent művelet, 0 függőség, nulla runtime kompromisszum.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/kassza"><img src="https://img.shields.io/npm/v/kassza?label=npm&style=flat-square&labelColor=1c2620&color=167337" alt="npm verzió"></a>
  <a href="https://www.npmjs.com/package/kassza"><img src="https://img.shields.io/npm/dm/kassza?label=let%C3%B6lt%C3%A9s&style=flat-square&labelColor=1c2620&color=167337" alt="havi letöltés"></a>
  <a href="https://github.com/futozs/kassza/blob/main/package.json"><img src="https://img.shields.io/badge/f%C3%BCgg%C5%91s%C3%A9g-0-167337?style=flat-square&labelColor=1c2620" alt="0 futásidejű függőség"></a>
  <a href="https://github.com/futozs/kassza/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/kassza?label=licenc&style=flat-square&labelColor=1c2620&color=167337" alt="MIT licenc"></a>
</p>

<p align="center">
  <a href="https://kassza-amber.vercel.app"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/nav-web-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/nav-web-light.svg" alt="Weboldal: kassza-amber.vercel.app" width="428"></picture></a>
  <a href="https://kassza-amber.vercel.app/docs"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/nav-docs-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/nav-docs-light.svg" alt="Dokumentáció: 92 oldal, magyarul" width="428"></picture></a>
  <br>
  <a href="https://kassza-amber.vercel.app/sandbox"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/nav-sandbox-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/nav-sandbox-light.svg" alt="Sandbox: 27 futtatható példa" width="428"></picture></a>
  <a href="https://kassza-amber.vercel.app/docs/receptek"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/nav-recipes-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/nav-recipes-light.svg" alt="Receptek: 11 kész integráció" width="428"></picture></a>
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

<p>
  <a href="https://kassza-amber.vercel.app/docs/alapok/telepites"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-light.svg" alt="Dokumentáció: Telepítés" height="44"></picture></a>
  <a href="https://kassza-amber.vercel.app/sandbox?pelda=szamla"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-sandbox-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-sandbox-light.svg" alt="Futtasd a sandboxban: Számla kiállítása" height="44"></picture></a>
</p>

## Miért kassza?

<p align="center">
  <picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/matrix-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/matrix-light.svg" alt="Számla Agent műveletek: a kassza mind a 11-et tudja, a többi csomag 2 vagy 3 műveletet" width="100%"></picture>
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

<p>
  <a href="https://kassza-amber.vercel.app/docs/alapok/mi-a-kassza"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-light.svg" alt="Dokumentáció: Mi a kassza?" height="44"></picture></a>
</p>

## Tartalom

| Kezdés | Műveletek | Kiegészítők |
| --- | --- | --- |
| 🌐 [Weboldal, sandbox és receptek](#weboldal-sandbox-és-receptek) | 📄 [Számlák](#számlák) | 🗄️ [PDF mentése tárhelyre](#pdf-mentése-tárhelyre) |
| ⚙️ [Beállítás](#beállítás) | 🧾 [Nyugták](#nyugták) | ⚡ [Serverless és edge](#serverless-és-edge) |
| 🚨 [Hibakezelés](#hibakezelés) | 🏛️ [Adószám lekérdezés](#adószám-lekérdezés) | 🧪 [Tesztelés](#tesztelés) |
| 🎛️ [Haladó beállítások](#haladó-beállítások) | 🔔 [Fizetési értesítés (IPN)](#fizetési-értesítés-ipn) | 🧮 [Validátorok és pénzszámítás](#validátorok-és-pénzszámítás) |
| 🤖 [AI-val kódolsz?](#ai-val-kódolsz) | | |

## Weboldal, sandbox és receptek

A teljes magyar dokumentáció, a sandbox és a receptek a **[kassza-amber.vercel.app](https://kassza-amber.vercel.app)** oldalon vannak.

<p align="center">
  <a href="https://kassza-amber.vercel.app/sandbox?pelda=szamla"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/showcase-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/showcase-light.svg" alt="A kassza sandbox: futtatható példák, TypeScript kód és a ténylegesen elküldött XML" width="100%"></picture></a>
</p>

- 📖 **[Dokumentáció](https://kassza-amber.vercel.app/docs)**: 92 oldal magyarul. Minden Agent művelethez kérés, válasz és futtatható minta, a beállítások, a szabályok és az összes ismert hibakód.
- ▶️ **[Sandbox](https://kassza-amber.vercel.app/sandbox)**: 27 példa, amit a böngészőben futtathatsz Agent kulcs nélkül, szimulált Számlázz.hu ellen, a ténylegesen elküldött XML-lel. A saját kódodat linkként meg is oszthatod.
- 🍳 **[Receptek](https://kassza-amber.vercel.app/docs/receptek)**: 11 teljes, bemásolható integráció webshophoz, Stripe és IPN webhookhoz, díjbekérőhöz, pénztári nyugtához, PDF tárhelyhez, Cloudflare Workershez és tesztekhez.
- 🤖 **[llms.txt](https://kassza-amber.vercel.app/llms.txt)**: a dokumentáció tartalomjegyzéke AI asszisztenseknek, a teljes szöveg egy fájlban: [llms-full.txt](https://kassza-amber.vercel.app/llms-full.txt).
- 📦 **[npm csomag](https://www.npmjs.com/package/kassza)** · 🏛️ **[Hivatalos Számlázz.hu Agent dokumentáció](https://docs.szamlazz.hu/hu/agent/)**

<details>
<summary>🍳 <b>Mind a 11 recept</b></summary>

- **[Közös kliens](https://kassza-amber.vercel.app/docs/receptek/kozos-kliens)**: Egyetlen szerveroldali kassza kliens alapbeállításokkal, hibanaplózással és közös munkamenettel, amelyet a többi recept importál.
- **[Fizetett rendelés számlája](https://kassza-amber.vercel.app/docs/receptek/fizetett-rendeles-szamla)**: Idempotens számlázás rendelésszámmal.
- **[Stripe webhook](https://kassza-amber.vercel.app/docs/receptek/stripe-webhook)**: Számla a Stripe Checkout checkout.session.completed eseményéből.
- **[Nevezés díjbekérővel](https://kassza-amber.vercel.app/docs/receptek/nevezes-dijbekerovel)**: Versenynevezés vagy rendezvényjelentkezés átutalásos fizetéssel.
- **[IPN webhook](https://kassza-amber.vercel.app/docs/receptek/ipn-webhook)**: A Számlázz.hu fizetési értesítésének (IPN) fogadása Next.js route handlerben, IP-ellenőrzéssel, a számla állapotának visszaellenőrzésével és idempotens mentéssel.
- **[Pénztári nyugta](https://kassza-amber.vercel.app/docs/receptek/penztari-nyugta)**: Nyugta egy pénztári eladásról hívásazonosítóval, a dupla nyugta kezelésével és e-mail kiküldéssel, Next.js route handlerben.
- **[PDF mentése S3-ba vagy R2-be](https://kassza-amber.vercel.app/docs/receptek/pdf-mentes-s3-r2)**: A számla PDF-jének mentése saját Amazon S3 vagy Cloudflare R2 tárhelyre AWS SDK nélkül, stabil kulccsal és rövid ideig érvényes letöltési linkkel.
- **[Adószám alapú kitöltés](https://kassza-amber.vercel.app/docs/receptek/adoszam-urlap)**: Számlázási űrlap, amely a beírt adószám alapján a NAV adataiból tölti ki a cégnevet és a székhely címét.
- **[Devizás számla EU-s cégnek](https://kassza-amber.vercel.app/docs/receptek/devizas-eu-szamla)**: Euróban kiállított, angol nyelvű számla másik tagállambeli cégnek, közösségi adószámmal, MNB árfolyammal és angol értesítő e-maillel.
- **[Cloudflare Workers](https://kassza-amber.vercel.app/docs/receptek/cloudflare-workers)**: Cloudflare Worker, amely a kasszával lekérdezi a számlákat, a munkamenetet KV-ben tartja, a számla PDF-eket pedig R2-ben gyorsítótárazza.
- **[Egységtesztek](https://kassza-amber.vercel.app/docs/receptek/egysegtesztek)**: Vitest tesztek a receptek kódjához mock klienssel.

</details>

<details>
<summary>▶️ <b>Mind a 27 sandbox példa</b></summary>

**Számlák:** [Számla kiállítása](https://kassza-amber.vercel.app/sandbox?pelda=szamla) · [Webshop számla bruttó árakkal](https://kassza-amber.vercel.app/sandbox?pelda=szamla-brutto) · [Díjbekérő, majd számla](https://kassza-amber.vercel.app/sandbox?pelda=dijbekero-szamla) · [Előleg- és végszámla](https://kassza-amber.vercel.app/sandbox?pelda=eloleg-vegszamla) · [Helyesbítő számla](https://kassza-amber.vercel.app/sandbox?pelda=helyesbito-szamla) · [Devizás számla EU-s vevőnek](https://kassza-amber.vercel.app/sandbox?pelda=devizas-szamla) · [Számlaelőnézet](https://kassza-amber.vercel.app/sandbox?pelda=elonezet) · [Számla sztornózása](https://kassza-amber.vercel.app/sandbox?pelda=sztorno) · [Befizetések rögzítése](https://kassza-amber.vercel.app/sandbox?pelda=befizetes) · [PDF lekérése utólag](https://kassza-amber.vercel.app/sandbox?pelda=pdf-lekeres) · [Számla adatainak lekérése](https://kassza-amber.vercel.app/sandbox?pelda=szamla-adatai) · [Díjbekérő törlése](https://kassza-amber.vercel.app/sandbox?pelda=dijbekero-torlese)

**Nyugták:** [Nyugta kiállítása](https://kassza-amber.vercel.app/sandbox?pelda=nyugta) · [Nyugta sztornózása](https://kassza-amber.vercel.app/sandbox?pelda=nyugta-sztorno) · [Nyugta lekérdezése](https://kassza-amber.vercel.app/sandbox?pelda=nyugta-lekerdezes) · [Nyugta kiküldése e-mailben](https://kassza-amber.vercel.app/sandbox?pelda=nyugta-kikuldes)

**NAV:** [Adószám lekérdezése](https://kassza-amber.vercel.app/sandbox?pelda=adoszam)

**Hibakezelés:** [Idempotens számlázás hiba után](https://kassza-amber.vercel.app/sandbox?pelda=hibakezeles-idempotens) · [Validációs hibák](https://kassza-amber.vercel.app/sandbox?pelda=hibakezeles-validacio) · [Agent kulcs ellenőrzése](https://kassza-amber.vercel.app/sandbox?pelda=kulcs-ellenorzes) · [Hookok és újrapróbálás](https://kassza-amber.vercel.app/sandbox?pelda=hookok)

**Eszközök:** [Közös session több kliens között](https://kassza-amber.vercel.app/sandbox?pelda=munkamenet) · [Mock kliens tesztekhez](https://kassza-amber.vercel.app/sandbox?pelda=mock-kliens) · [Kerekítés és összegzés](https://kassza-amber.vercel.app/sandbox?pelda=kerekites) · [Validátorok](https://kassza-amber.vercel.app/sandbox?pelda=validatorok) · [IPN fizetési értesítés](https://kassza-amber.vercel.app/sandbox?pelda=ipn) · [PDF mentése tárhelyre](https://kassza-amber.vercel.app/sandbox?pelda=pdf-tarhely)

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

📖 **Dokumentáció:** [Hitelesítés (Agent kulcs)](https://kassza-amber.vercel.app/docs/alapok/hitelesites) &nbsp;·&nbsp; ▶️ **Sandbox:** [Agent kulcs ellenőrzése](https://kassza-amber.vercel.app/sandbox?pelda=kulcs-ellenorzes)

</details>

<p>
  <a href="https://kassza-amber.vercel.app/docs/alapok/kliens-beallitasa"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-light.svg" alt="Dokumentáció: Kliens beállítása" height="44"></picture></a>
  <a href="https://kassza-amber.vercel.app/sandbox?pelda=kulcs-ellenorzes"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-sandbox-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-sandbox-light.svg" alt="Futtasd a sandboxban: Agent kulcs ellenőrzése" height="44"></picture></a>
  <a href="https://kassza-amber.vercel.app/docs/receptek/kozos-kliens"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-recipe-kozos-kliens-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-recipe-kozos-kliens-light.svg" alt="Recept: Közös kliens" height="44"></picture></a>
</p>

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

📖 **Dokumentáció:** [Számla létrehozás › Kérés](https://kassza-amber.vercel.app/docs/szamla-letrehozas/keres) &nbsp;·&nbsp; ▶️ **Sandbox:** [Számla kiállítása](https://kassza-amber.vercel.app/sandbox?pelda=szamla)

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

A nettó ár a B2B számlákhoz, a bruttó ár a B2C számlákhoz való. Az `'AAM'` alanyi adómentes tételt jelöl, a többi áfakódot a [Áfakulcsok](https://kassza-amber.vercel.app/docs/szamla-letrehozas/beallitasok-es-szabalyok/afakulcsok) oldal sorolja fel.

📖 **Dokumentáció:** [Kerekítés](https://kassza-amber.vercel.app/docs/szamla-letrehozas/beallitasok-es-szabalyok/kerekites) &nbsp;·&nbsp; ▶️ **Sandbox:** [Webshop számla bruttó árakkal](https://kassza-amber.vercel.app/sandbox?pelda=szamla-brutto)

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

📖 **Dokumentáció:** [Bizonylattípusok](https://kassza-amber.vercel.app/docs/szamla-letrehozas/beallitasok-es-szabalyok/bizonylattipusok) &nbsp;·&nbsp; ▶️ **Sandbox:** [Díjbekérő, majd számla](https://kassza-amber.vercel.app/sandbox?pelda=dijbekero-szamla)

</details>

<details>
<summary><b>Díjbekérő törlése</b> · <code>invoices.deleteProforma()</code></summary>

```ts
await kassza.invoices.deleteProforma({ orderNumber: 'NEV-42' })
```

📖 **Dokumentáció:** [Díjbekérő törlése](https://kassza-amber.vercel.app/docs/dijbekero-torlese) &nbsp;·&nbsp; ▶️ **Sandbox:** [Díjbekérő törlése](https://kassza-amber.vercel.app/sandbox?pelda=dijbekero-torlese)

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

📖 **Dokumentáció:** [Bizonylattípusok](https://kassza-amber.vercel.app/docs/szamla-letrehozas/beallitasok-es-szabalyok/bizonylattipusok) &nbsp;·&nbsp; ▶️ **Sandbox:** [Előleg- és végszámla](https://kassza-amber.vercel.app/sandbox?pelda=eloleg-vegszamla)

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

📖 **Dokumentáció:** [Bizonylattípusok](https://kassza-amber.vercel.app/docs/szamla-letrehozas/beallitasok-es-szabalyok/bizonylattipusok) &nbsp;·&nbsp; ▶️ **Sandbox:** [Helyesbítő számla](https://kassza-amber.vercel.app/sandbox?pelda=helyesbito-szamla)

</details>

<details>
<summary><b>Szállítólevél</b> · <code>type: 'deliveryNote'</code></summary>

```ts
await kassza.invoices.create({ type: 'deliveryNote', buyer, items })
```

📖 **Dokumentáció:** [Bizonylattípusok](https://kassza-amber.vercel.app/docs/szamla-letrehozas/beallitasok-es-szabalyok/bizonylattipusok)

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

Az árfolyam, ha nem adod meg, automatikusan az MNB aktuális árfolyama. Kész minta: [Devizás számla EU-s cégnek](https://kassza-amber.vercel.app/docs/receptek/devizas-eu-szamla).

📖 **Dokumentáció:** [Támogatott devizanemek](https://kassza-amber.vercel.app/docs/szamla-letrehozas/beallitasok-es-szabalyok/penznemek) &nbsp;·&nbsp; ▶️ **Sandbox:** [Devizás számla EU-s vevőnek](https://kassza-amber.vercel.app/sandbox?pelda=devizas-szamla)

</details>

<details>
<summary><b>Előnézet, számla kiállítása nélkül</b> · <code>invoices.preview()</code></summary>

```ts
const { pdf, grossTotal } = await kassza.invoices.preview({ buyer, items })
```

📖 **Dokumentáció:** [Előnézet](https://kassza-amber.vercel.app/docs/szamla-letrehozas/beallitasok-es-szabalyok/elonezet) &nbsp;·&nbsp; ▶️ **Sandbox:** [Számlaelőnézet](https://kassza-amber.vercel.app/sandbox?pelda=elonezet)

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

📖 **Dokumentáció:** [Számlaértesítő küldés](https://kassza-amber.vercel.app/docs/szamla-letrehozas/beallitasok-es-szabalyok/ertesito-email)

</details>

<details>
<summary><b>Sztornó</b> · <code>invoices.reverse()</code></summary>

```ts
const sztorno = await kassza.invoices.reverse('E-WEB-2026-12')
```

📖 **Dokumentáció:** [Számla sztornó](https://kassza-amber.vercel.app/docs/szamla-sztorno) &nbsp;·&nbsp; ▶️ **Sandbox:** [Számla sztornózása](https://kassza-amber.vercel.app/sandbox?pelda=sztorno)

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

📖 **Dokumentáció:** [Befizetés rögzítése](https://kassza-amber.vercel.app/docs/befizetes-rogzitese) &nbsp;·&nbsp; ▶️ **Sandbox:** [Befizetések rögzítése](https://kassza-amber.vercel.app/sandbox?pelda=befizetes)

</details>

<details>
<summary><b>PDF letöltése utólag</b> · <code>invoices.getPdf()</code></summary>

```ts
import { writeFile } from 'node:fs/promises'

const { pdf } = await kassza.invoices.getPdf('E-WEB-2026-12')
await writeFile('szamla.pdf', pdf)
```

Rendelésszám vagy külső azonosító alapján is működik: `getPdf({ orderNumber: 'REND-1001' })`, `getPdf({ externalId: 'a1b2' })`.

📖 **Dokumentáció:** [Bizonylat lekérése PDF-ben](https://kassza-amber.vercel.app/docs/bizonylat-pdf) &nbsp;·&nbsp; ▶️ **Sandbox:** [PDF lekérése utólag](https://kassza-amber.vercel.app/sandbox?pelda=pdf-lekeres)

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

📖 **Dokumentáció:** [Számla adatainak lekérése](https://kassza-amber.vercel.app/docs/szamla-adatai) &nbsp;·&nbsp; ▶️ **Sandbox:** [Számla adatainak lekérése](https://kassza-amber.vercel.app/sandbox?pelda=szamla-adatai)

</details>

<p>
  <a href="https://kassza-amber.vercel.app/docs/szamla-letrehozas"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-light.svg" alt="Dokumentáció: Számla létrehozás" height="44"></picture></a>
  <a href="https://kassza-amber.vercel.app/sandbox?pelda=szamla"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-sandbox-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-sandbox-light.svg" alt="Futtasd a sandboxban: Számla kiállítása" height="44"></picture></a>
  <a href="https://kassza-amber.vercel.app/docs/receptek/fizetett-rendeles-szamla"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-recipe-fizetett-rendeles-szamla-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-recipe-fizetett-rendeles-szamla-light.svg" alt="Recept: Fizetett rendelés számlája" height="44"></picture></a>
</p>

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

📖 **Dokumentáció:** [Nyugta létrehozás](https://kassza-amber.vercel.app/docs/nyugta-letrehozas) &nbsp;·&nbsp; ▶️ **Sandbox:** [Nyugta kiállítása](https://kassza-amber.vercel.app/sandbox?pelda=nyugta)

</details>

<details>
<summary><b>Kiküldés e-mailben</b> · <code>receipts.send()</code></summary>

```ts
await kassza.receipts.send({ receiptNumber: nyugta.number, emails: 'vevo@ceg.hu' })
```

📖 **Dokumentáció:** [Nyugta kiküldés](https://kassza-amber.vercel.app/docs/nyugta-kikuldes) &nbsp;·&nbsp; ▶️ **Sandbox:** [Nyugta kiküldése e-mailben](https://kassza-amber.vercel.app/sandbox?pelda=nyugta-kikuldes)

</details>

<details>
<summary><b>Lekérdezés</b> · <code>receipts.get()</code>, <code>receipts.find()</code></summary>

```ts
const ugyanaz = await kassza.receipts.get(nyugta.number)
const rendelesbol = await kassza.receipts.find({ orderNumber: 'REND-1001' })
```

📖 **Dokumentáció:** [Nyugta lekérdezés](https://kassza-amber.vercel.app/docs/nyugta-lekerdezes) &nbsp;·&nbsp; ▶️ **Sandbox:** [Nyugta lekérdezése](https://kassza-amber.vercel.app/sandbox?pelda=nyugta-lekerdezes)

</details>

<details>
<summary><b>Sztornó</b> · <code>receipts.reverse()</code></summary>

```ts
await kassza.receipts.reverse(nyugta.number)
```

📖 **Dokumentáció:** [Nyugta sztornó](https://kassza-amber.vercel.app/docs/nyugta-sztorno) &nbsp;·&nbsp; ▶️ **Sandbox:** [Nyugta sztornózása](https://kassza-amber.vercel.app/sandbox?pelda=nyugta-sztorno)

</details>

<p>
  <a href="https://kassza-amber.vercel.app/docs/nyugta-letrehozas"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-light.svg" alt="Dokumentáció: Nyugta létrehozás" height="44"></picture></a>
  <a href="https://kassza-amber.vercel.app/sandbox?pelda=nyugta"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-sandbox-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-sandbox-light.svg" alt="Futtasd a sandboxban: Nyugta kiállítása" height="44"></picture></a>
  <a href="https://kassza-amber.vercel.app/docs/receptek/penztari-nyugta"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-recipe-penztari-nyugta-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-recipe-penztari-nyugta-light.svg" alt="Recept: Pénztári nyugta" height="44"></picture></a>
</p>

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

📖 **Dokumentáció:** [Adószám lekérdezés](https://kassza-amber.vercel.app/docs/adoszam-lekerdezes) &nbsp;·&nbsp; ▶️ **Sandbox:** [Adószám lekérdezése](https://kassza-amber.vercel.app/sandbox?pelda=adoszam)

</details>

<p>
  <a href="https://kassza-amber.vercel.app/docs/adoszam-lekerdezes"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-light.svg" alt="Dokumentáció: Adószám lekérdezés" height="44"></picture></a>
  <a href="https://kassza-amber.vercel.app/sandbox?pelda=adoszam"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-sandbox-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-sandbox-light.svg" alt="Futtasd a sandboxban: Adószám lekérdezése" height="44"></picture></a>
  <a href="https://kassza-amber.vercel.app/docs/receptek/adoszam-urlap"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-recipe-adoszam-urlap-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-recipe-adoszam-urlap-light.svg" alt="Recept: Adószám alapú kitöltés" height="44"></picture></a>
</p>

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

📖 **Dokumentáció:** [Hibakezelés, hibakódok](https://kassza-amber.vercel.app/docs/alapok/hibakezeles) &nbsp;·&nbsp; ▶️ **Sandbox:** [Idempotens számlázás hiba után](https://kassza-amber.vercel.app/sandbox?pelda=hibakezeles-idempotens)

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

📖 **Dokumentáció:** [Hibakezelés, hibakódok](https://kassza-amber.vercel.app/docs/alapok/hibakezeles) &nbsp;·&nbsp; ▶️ **Sandbox:** [Validációs hibák](https://kassza-amber.vercel.app/sandbox?pelda=hibakezeles-validacio)

</details>

> **Számlát a kassza soha nem küld újra.** Újraküldés csak ott történik magától, ahol biztonságos: lekérdezéseknél, hálózati hibánál, legfeljebb 5-ször. A Számlázz.hu kitiltja azt, aki ciklusban próbálkozik. Bizonytalan hiba után a `find({ orderNumber })` megmondja, elkészült-e a számla.

<p>
  <a href="https://kassza-amber.vercel.app/docs/alapok/hibakezeles"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-light.svg" alt="Dokumentáció: Hibakezelés, hibakódok" height="44"></picture></a>
  <a href="https://kassza-amber.vercel.app/sandbox?pelda=hibakezeles-idempotens"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-sandbox-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-sandbox-light.svg" alt="Futtasd a sandboxban: Idempotens számlázás hiba után" height="44"></picture></a>
  <a href="https://kassza-amber.vercel.app/docs/receptek/fizetett-rendeles-szamla"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-recipe-fizetett-rendeles-szamla-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-recipe-fizetett-rendeles-szamla-light.svg" alt="Recept: Fizetett rendelés számlája" height="44"></picture></a>
</p>

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

📖 **Dokumentáció:** [IPN fizetési értesítés](https://kassza-amber.vercel.app/docs/befizetes-rogzitese/ipn) &nbsp;·&nbsp; ▶️ **Sandbox:** [IPN fizetési értesítés](https://kassza-amber.vercel.app/sandbox?pelda=ipn)

</details>

<details>
<summary><b>Csak a Számlázz.hu IP-címeiről</b> · <code>isSzamlazzIp()</code></summary>

Csak a Számlázz.hu IP-címeiről jövő kérést érdemes elfogadni:

```ts
import { isSzamlazzIp } from 'kassza/ipn'

isSzamlazzIp(request.headers.get('x-forwarded-for') ?? '')
```

📖 **Dokumentáció:** [IPN fizetési értesítés](https://kassza-amber.vercel.app/docs/befizetes-rogzitese/ipn)

</details>

<p>
  <a href="https://kassza-amber.vercel.app/docs/befizetes-rogzitese/ipn"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-light.svg" alt="Dokumentáció: IPN fizetési értesítés" height="44"></picture></a>
  <a href="https://kassza-amber.vercel.app/sandbox?pelda=ipn"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-sandbox-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-sandbox-light.svg" alt="Futtasd a sandboxban: IPN fizetési értesítés" height="44"></picture></a>
  <a href="https://kassza-amber.vercel.app/docs/receptek/ipn-webhook"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-recipe-ipn-webhook-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-recipe-ipn-webhook-light.svg" alt="Recept: IPN webhook" height="44"></picture></a>
</p>

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

📖 **Dokumentáció:** [PDF tárhely](https://kassza-amber.vercel.app/docs/kiegeszitok/pdf-tarhely) &nbsp;·&nbsp; ▶️ **Sandbox:** [PDF mentése tárhelyre](https://kassza-amber.vercel.app/sandbox?pelda=pdf-tarhely)

</details>

<details>
<summary><b>Fájlrendszer (Node)</b> · <code>fsStorage()</code></summary>

```ts
import { fsStorage } from 'kassza/storage/fs'

const tarhely = fsStorage({ directory: './szamlak' })
```

📖 **Dokumentáció:** [PDF tárhely](https://kassza-amber.vercel.app/docs/kiegeszitok/pdf-tarhely)

</details>

További adapterek: `s3Storage` (AWS SDK), `r2BindingStorage`, `vercelBlobStorage`, `uploadthingStorage`, `supabaseStorage`, `memoryStorage`.

<p>
  <a href="https://kassza-amber.vercel.app/docs/kiegeszitok/pdf-tarhely"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-light.svg" alt="Dokumentáció: PDF tárhely" height="44"></picture></a>
  <a href="https://kassza-amber.vercel.app/sandbox?pelda=pdf-tarhely"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-sandbox-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-sandbox-light.svg" alt="Futtasd a sandboxban: PDF mentése tárhelyre" height="44"></picture></a>
  <a href="https://kassza-amber.vercel.app/docs/receptek/pdf-mentes-s3-r2"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-recipe-pdf-mentes-s3-r2-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-recipe-pdf-mentes-s3-r2-light.svg" alt="Recept: PDF mentése S3-ba vagy R2-be" height="44"></picture></a>
</p>

## Serverless és edge

A session cookie újrahasznosítása gyorsítja a hívásokat. Serverless környezetben tedd közös tárolóba.

<details>
<summary><b>Upstash Redis</b> · <code>upstashRedisCookieStore()</code></summary>

```ts
import { Redis } from '@upstash/redis'
import { upstashRedisCookieStore } from 'kassza/cookie-stores'

const kassza = createKassza({ cookieStore: upstashRedisCookieStore(Redis.fromEnv()) })
```

📖 **Dokumentáció:** [Munkamenet (session cookie)](https://kassza-amber.vercel.app/docs/alapok/munkamenet) &nbsp;·&nbsp; ▶️ **Sandbox:** [Közös session több kliens között](https://kassza-amber.vercel.app/sandbox?pelda=munkamenet)

</details>

<details>
<summary><b>Cloudflare Workers</b> · <code>cloudflareKvCookieStore()</code></summary>

```ts
import { cloudflareKvCookieStore } from 'kassza/cookie-stores'

const kassza = createKassza({ agentKey: env.SZAMLAZZ_AGENT_KEY, cookieStore: cloudflareKvCookieStore(env.KASSZA_KV) })
```

📖 **Dokumentáció:** [Serverless és edge](https://kassza-amber.vercel.app/docs/kiegeszitok/serverless-es-edge)

</details>

Van még `ioredisCookieStore`, `nodeRedisCookieStore` és `customCookieStore` is. Ha a tároló elérhetetlen, a számlázás attól még működik.

<p>
  <a href="https://kassza-amber.vercel.app/docs/kiegeszitok/serverless-es-edge"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-light.svg" alt="Dokumentáció: Serverless és edge" height="44"></picture></a>
  <a href="https://kassza-amber.vercel.app/sandbox?pelda=munkamenet"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-sandbox-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-sandbox-light.svg" alt="Futtasd a sandboxban: Közös session több kliens között" height="44"></picture></a>
  <a href="https://kassza-amber.vercel.app/docs/receptek/cloudflare-workers"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-recipe-cloudflare-workers-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-recipe-cloudflare-workers-light.svg" alt="Recept: Cloudflare Workers" height="44"></picture></a>
</p>

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

📖 **Dokumentáció:** [Tesztelés](https://kassza-amber.vercel.app/docs/kiegeszitok/teszteles) &nbsp;·&nbsp; ▶️ **Sandbox:** [Mock kliens tesztekhez](https://kassza-amber.vercel.app/sandbox?pelda=mock-kliens)

</details>

<p>
  <a href="https://kassza-amber.vercel.app/docs/kiegeszitok/teszteles"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-light.svg" alt="Dokumentáció: Tesztelés" height="44"></picture></a>
  <a href="https://kassza-amber.vercel.app/sandbox?pelda=mock-kliens"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-sandbox-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-sandbox-light.svg" alt="Futtasd a sandboxban: Mock kliens tesztekhez" height="44"></picture></a>
  <a href="https://kassza-amber.vercel.app/docs/receptek/egysegtesztek"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-recipe-egysegtesztek-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-recipe-egysegtesztek-light.svg" alt="Recept: Egységtesztek" height="44"></picture></a>
</p>

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

📖 **Dokumentáció:** [Validátorok](https://kassza-amber.vercel.app/docs/kiegeszitok/validatorok) &nbsp;·&nbsp; ▶️ **Sandbox:** [Validátorok](https://kassza-amber.vercel.app/sandbox?pelda=validatorok)

</details>

<details>
<summary><b>Pénzszámítás</b> · <code>kassza/money</code></summary>

```ts
import { calculateInvoiceItem, calculateReceiptItem } from 'kassza/money'

calculateInvoiceItem({ quantity: 3, grossUnitPrice: 500, vat: 27 })
calculateReceiptItem({ grossUnitPrice: 1_000, vat: 27 })
```

Az első eredménye `{ netAmount: 1181, vatAmount: 319, grossAmount: 1500, ... }`, a másodiké `{ netAmount: 787.4, vatAmount: 212.6, grossAmount: 1000, ... }`.

📖 **Dokumentáció:** [Pénzszámítás](https://kassza-amber.vercel.app/docs/kiegeszitok/penzszamitas) &nbsp;·&nbsp; ▶️ **Sandbox:** [Kerekítés és összegzés](https://kassza-amber.vercel.app/sandbox?pelda=kerekites)

</details>

<p>
  <a href="https://kassza-amber.vercel.app/docs/kiegeszitok"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-light.svg" alt="Dokumentáció: Kiegészítők" height="44"></picture></a>
  <a href="https://kassza-amber.vercel.app/sandbox?pelda=validatorok"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-sandbox-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-sandbox-light.svg" alt="Futtasd a sandboxban: Validátorok" height="44"></picture></a>
</p>

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

📖 **Dokumentáció:** [Hálózat és biztonság](https://kassza-amber.vercel.app/docs/alapok/halozat-es-biztonsag) &nbsp;·&nbsp; ▶️ **Sandbox:** [Hookok és újrapróbálás](https://kassza-amber.vercel.app/sandbox?pelda=hookok)

</details>

<details>
<summary><b>Új session kérése</b> · <code>resetSession()</code></summary>

A `resetSession()` új sessiont kér. Hívd meg, ha a Számlázz.hu fiókban megváltoztak a cégadatok:

```ts
await kassza.resetSession()
```

📖 **Dokumentáció:** [Munkamenet (session cookie)](https://kassza-amber.vercel.app/docs/alapok/munkamenet) &nbsp;·&nbsp; ▶️ **Sandbox:** [Közös session több kliens között](https://kassza-amber.vercel.app/sandbox?pelda=munkamenet)

</details>

<p>
  <a href="https://kassza-amber.vercel.app/docs/alapok/halozat-es-biztonsag"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-light.svg" alt="Dokumentáció: Hálózat és biztonság" height="44"></picture></a>
  <a href="https://kassza-amber.vercel.app/sandbox?pelda=hookok"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-sandbox-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-sandbox-light.svg" alt="Futtasd a sandboxban: Hookok és újrapróbálás" height="44"></picture></a>
</p>

## AI-val kódolsz?

A csomagban van egy `agents/` mappa. Ebből a Claude Code, a Cursor, a Copilot és a többi asszisztens megtudja, hogyan kell jól használni a kasszát, és mik a buktatók. Szólj rá az AI-ra:

> Használd a kassza csomagot, és előbb olvasd el a `node_modules/kassza/agents/README.md`-t.

Claude Code-hoz kész skill is van: másold a `node_modules/kassza/agents/skills/kassza` mappát a projekted `.claude/skills/` mappájába.

A weboldal is AI-barát: az [llms.txt](https://kassza-amber.vercel.app/llms.txt) a dokumentáció tartalomjegyzéke, az [llms-full.txt](https://kassza-amber.vercel.app/llms-full.txt) a teljes dokumentáció egy fájlban, és minden oldal Markdownként is elérhető, ha az URL végére `.md` kerül.

<p>
  <a href="https://kassza-amber.vercel.app/docs/kiegeszitok/ai-asszisztensek"><picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-dark.svg"><img src="https://raw.githubusercontent.com/futozs/kassza/main/readme/assets/button-docs-light.svg" alt="Dokumentáció: AI asszisztensek" height="44"></picture></a>
</p>

---

<p align="center">
  <a href="https://kassza-amber.vercel.app">Weboldal</a> · <a href="https://kassza-amber.vercel.app/docs">Dokumentáció</a> · <a href="https://kassza-amber.vercel.app/sandbox">Sandbox</a> · <a href="https://kassza-amber.vercel.app/docs/receptek">Receptek</a> · <a href="https://www.npmjs.com/package/kassza">npm</a> · <a href="https://github.com/futozs/kassza/blob/main/CHANGELOG.md">Változásnapló</a>
</p>

<sub>Nem hivatalos csomag, nem kapcsolódik a KBOSS.hu Kft.-hez (Számlázz.hu). A hivatalos dokumentáció a <a href="https://docs.szamlazz.hu/hu/agent/">docs.szamlazz.hu</a> oldalon érhető el. MIT licenc.</sub>
