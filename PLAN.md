# szamlazz-egyszerubben — Terv

> Munkanév. A végleges csomagnév a [10. pontban](#10-név) dől el.
> Felmérés dátuma: 2026-09-15. Források: docs.szamlazz.hu/hu/agent (mind a 72 oldal), npm registry, a versenytársak GitHub repói, racehub.hu `src/lib/szamlazz-api.ts`.

---

## 1. Értékelés röviden

**Megéri?** Igen, de nem azért, mert nincs TypeScriptes Számlázz.hu modul. Van kettő is, és aktívan fejlesztik őket. Azért éri meg, mert **egyik sem teljes**: a Számla Agent 11 műveletéből mindegyik csak 3-at tud (számla készítés, sztornó, XML lekérés).

Nyugta, befizetés rögzítés, PDF lekérés, díjbekérő törlés, nyugta kiküldés és adószám lekérdezés egyik npm csomagban sincs benne. A racehub.hu-ban ezek egy része már élesben fut.

**Mennyire nehéz?** Közepesen.

| Rész | Nehézség | Miért |
|---|---|---|
| HTTP transport (multipart, cookie, fejlécek) | könnyű | egyetlen végpont, a mezőnév dönti el a műveletet |
| Válaszok parse-olása | közepes | 3–4 féle formátum: XML, szöveges `[ERR]`, `xmlagentresponse=DONE;…`, nyers PDF, fejlécek |
| Számla XML teljes lefedése | közepes–nehéz | ~63 mező, **kötött XSD elemsorrend**, sok bizonylattípus (előleg, vég, helyesbítő, díjbekérő, szállítólevél) |
| Kerekítés, pénz | nehéz (és kritikus) | a számla és a nyugta szabályai **eltérnek**, a nyugtán nincs tűrés |
| Tesztelés | közepes | tesztfiók kell, 500 számla / 10 perc limit, fixture-ök anonimizálása |
| Integrációk (storage, Prisma, Drizzle) | könnyű | adapter interfészek, a nehéz logika a core-ban van |

**Becslés** (fókuszált munkanapban):
- MVP: mind a 11 művelet, típusok, hibakezelés, pénzhelperek, tesztek → **5–7 nap**
- \+ integrációk, testing mock, cookie store-ok → **+3–4 nap**
- \+ dokumentáció, példaprojektek, launch → **+2–3 nap**
- **Összesen kb. 2–3 hét**, ha nem egyben megy, akkor hosszabb.

**Előny:** a racehub.hu-ban 7 művelet már élesben ki van próbálva, és a legcsúnyább buktatók (időzóna, sztornó válaszformátumok, díjbekérő törlés mezőneve) ismertek. Ezekről a versenytársak dokumentációja hallgat.

---

## 2. Versenytársak (2026-09-15)

| Csomag | Verzió / utolsó release | Letöltés/hó | TS típusok | Runtime függőségek | Agent műveletek |
|---|---|---|---|---|---|
| `szamlazz.js` | 9.2.0 / 2025-12 | ~3 430 | ❌ nincs `.d.ts` | 6 (axios, xml2js, tough-cookie, form-data, merge, http-cookie-agent) | 3/11 |
| `@ribbery009/szamlazz-ts` | 1.3.5 / 2026-06 | ~870 | ✅ | ugyanaz a 6 (szamlazz.js fork) | kb. 3/11 (nem ellenőriztem soronként) |
| `@halftome/szamlazz-client` | 3.1.0 / 2026-08 | ~770 | ✅ | 1 (xmlbuilder2) | 3/11 (+ helyesbítő) |
| `@lazslov/invoice` | 2.0.2 / 2026-09 | ~650 | ✅ | saját service SDK, nem közvetlen Agent kliens | — |

- A Számlázz.hu-nak **van hivatalos PHP SDK-ja** (docs.szamlazz.hu/hu/php), **Node/TS SDK-ja nincs**. Ha jó lesz a csomag, érdemes megkeresni őket, hogy linkeljék a docsban.
- A `@halftome/szamlazz-client` minősége jó (típusos hibák, idempotens lookup), de szűk a lefedettsége. Tőle érdemes tanulni.

---

## 3. A Számla Agent teljes felülete

Egyetlen végpont: `POST https://www.szamlazz.hu/szamla/`, `multipart/form-data`. **A fájlmező neve választja ki a műveletet.**

| # | Művelet | Form mező | szamlazz.js | halftome | racehub kód | Mi |
|---|---|---|---|---|---|---|
| 1 | Számla létrehozás (+ előleg, vég, helyesbítő, díjbekérő, szállítólevél) | `action-xmlagentxmlfile` (+ `attachfile1..5`) | ✅ | ✅ | ✅ | ✅ |
| 2 | Számla sztornó | `action-szamla_agent_st` | ✅ | ✅ | ✅ | ✅ |
| 3 | Befizetés rögzítése | `action-szamla_agent_kifiz` | ❌ | ❌ | ✅ | ✅ |
| 4 | Bizonylat PDF | `action-szamla_agent_pdf` | ❌ | ❌ | ⚠️ (st-vel kerülőúton) | ✅ |
| 5 | Bizonylat XML | `action-szamla_agent_xml` | ✅ | ✅ | ❌ | ✅ |
| 6 | Díjbekérő törlése | `action-szamla_agent_dijbekero_torlese` | ❌ | ❌ | ✅ | ✅ |
| 7 | Nyugta létrehozás | `action-szamla_agent_nyugta_create` | ❌ | ❌ | ✅ | ✅ |
| 8 | Nyugta sztornó | `action-szamla_agent_nyugta_storno` | ❌ | ❌ | ✅ | ✅ |
| 9 | Nyugta lekérdezés | `action-szamla_agent_nyugta_get` | ❌ | ❌ | ✅ | ✅ |
| 10 | Nyugta kiküldés e-mailben | `action-szamla_agent_nyugta_send` | ❌ | ❌ | ❌ | ✅ |
| 11 | Adószám lekérdezés (NAV adatok) | `action-szamla_agent_taxpayer` | ❌ | ❌ | ❌ | ✅ |

**Hivatalos XSD-k** (ezekből generáljuk a típusokat és ellenőrizzük az elemsorrendet):
`agent/xmlszamla.xsd`, `agentst/xmlszamlast.xsd`, `agentkifiz/xmlszamlakifiz.xsd`, `agentpdf/xmlszamlapdf.xsd`, `agentxml/xmlszamlaxml.xsd`, `szamladbkdel/xmlszamladbkdel.xsd`, `nyugtacreate/xmlnyugtacreate.xsd`, `nyugtavalasz/xmlnyugtavalasz.xsd`, `nyugtast/xmlnyugtast.xsd`, `nyugtaget/xmlnyugtaget.xsd`, `nyugtasend/xmlnyugtasend.xsd`, `agent/xmltaxpayer.xsd`

---

## 4. Miben leszünk jobbak

1. **11/11 művelet.** Ez a fő érv.
2. **Minimális függőség, natív `fetch`/`FormData`/`Blob`.** Fut Node 22+, Bun, Deno, Cloudflare Workers és Vercel Edge alatt. Nincs axios, nincs tough-cookie.
3. **A típusok a hivatalos XSD-kből generálódnak.** Helyes elemsorrend, és minden mező le van fedve, nem csak a gyakoriak.
4. **Fillérre pontos pénzkezelés.** `fromNet` és `fromGross` helperek a hivatalos kerekítési szabályok szerint, külön számlára (B2B nettó alapú, B2C bruttó alapú) és nyugtára (bruttó egész, nettó/áfa max. 2 tizedes, pontos összeg).
5. **Biztonságos újrapróbálás.** A docs szerint egy kérést max. 5-ször lehet elküldeni, és a túlzott próbálkozás kitiltáshoz vezet. Ezért üzleti hibánál soha nincs retry, csak hálózati hibánál és az 1-es kódnál (karbantartás), korláttal. Retry előtt a kliens rendelésszám alapján lekérdezi, hogy létrejött-e már a bizonylat.
6. **Típusos hibák.** `SzamlazzError` a következőkkel: `code`, `category` (auth / validation / account / not_found / service), `retryable`, eredeti magyar üzenet, angol tipp. A hibakód-táblázat enumként is elérhető.
7. **Cserélhető session cookie store** (memória, Redis/Upstash, Cloudflare KV). A docs kifejezetten ajánlja a cookie újrahasználatát, serverless-ben enélkül minden hívás újra hitelesít.
8. **PDF feltöltés storage-ba egy lépésben:** S3-kompatibilis (AWS, Cloudflare R2, MinIO, Backblaze), Vercel Blob, UploadThing, lokális fájlrendszer.
9. **Kész Prisma és Drizzle sémák** + repository a kiállított bizonylatok, állapotok és események tárolásához.
10. **`/testing` modul:** mock kliens és valós válasz-fixture-ök, így a felhasználók API hívás nélkül tudnak unit tesztet írni.
11. **Magyar validátorok:** adószám (CDV ellenőrzőszám), bankszámla (CDV), irányítószám, cím parse-olás.
12. **Magyar dokumentáció elsősorban, angol másodsorban**, valós példaprojektekkel.

---

## 5. Architektúra

### Döntések

| Kérdés | Döntés | Indok |
|---|---|---|
| Monorepo vagy egy csomag? | **Egy csomag, subpath exportokkal** | Egy verzió, egy install, egyszerűbb karbantartás (KISS). Ha kell, később bontható. |
| Throw vagy `{ success }` eredmény? | **Throw típusos `SzamlazzError`** | Ez az idiomatikus megoldás, és `try/catch` + `isSzamlazzError()` guarddal kényelmes. A racehub kód `{ success }` mintája egy vékony wrapperrel megtartható. |
| Az API nyelve | **Angol azonosítók, magyar JSDoc és docs** | Ez az npm norma. A magyar szakszavak glosszáriumba kerülnek (díjbekérő = `proforma`, nyugta = `receipt`, sztornó = `reverse`). |
| XML | **Saját serializer** (determinisztikus XSD sorrend) + **`fast-xml-parser`** a parse-hoz | A kéréseket teljes kontroll mellett építjük. A válaszokhoz (pl. teljes számla XML) kell egy megbízható parser, ez az egyetlen runtime függőség. |
| Dátumok | Mindig `Europe/Budapest` | Lásd a 352-es hibát a 6. pontban. |
| ORM és storage függőségek | **Opcionális peer dep vagy strukturális típus** | A felhasználó a saját `S3Client` / `drizzle` példányát adja át, a core nem húz be semmit. |
| Build | **tsdown** (ESM + CJS + `.d.ts`) | A tsup utódja, gyors. `publint` és `attw` ellenőrzi a helyes exportokat. |
| Node minimum | **>= 22** | A Node 20 2026 áprilisában EOL lett. |

### Subpath exportok

```
<csomag>                → core kliens (számlák, nyugták, adózó)
<csomag>/money          → kerekítés, fromNet/fromGross (számla és nyugta szabályok)
<csomag>/validators     → adószám, bankszámla, irányítószám, cím
<csomag>/storage        → StorageAdapter + s3 / vercel-blob / uploadthing / fs
<csomag>/cookie-stores  → memory / redis / cloudflare-kv
<csomag>/drizzle        → pg / mysql / sqlite táblák + repository
<csomag>/prisma         → schema.prisma snippet + repository
<csomag>/testing        → mock kliens, fixture-ök
```

### Mappastruktúra (cél)

```
src/
├── index.ts
├── client.ts                  # createSzamlazz()
├── core/
│   ├── actions.ts             # a 11 form mező
│   ├── transport.ts           # fetch + multipart + cookie + timeout
│   ├── response.ts            # formátum-felismerés: XML / [ERR] / DONE / PDF / fejlécek
│   ├── errors.ts              # SzamlazzError, hibakód-táblázat, kategóriák
│   ├── dates.ts               # Europe/Budapest dátumok
│   └── xml/
│       ├── serialize.ts       # sorrendtartó builder + escape
│       └── parse.ts
├── invoices/                  # create, reverse, registerPayment, getPdf, getXml, deleteProforma
├── receipts/                  # create, reverse, get, send
├── taxpayer/                  # lookup
├── money/
├── validators/
├── storage/
├── cookie-stores/
├── integrations/{drizzle,prisma}/
├── testing/
└── generated/                 # XSD-ből generált típusok (commitolva)
scripts/
├── fetch-xsd.ts               # letölti a hivatalos XSD-ket
└── gen-types.ts               # XSD → TS
```

### API vázlat

```ts
import { createSzamlazz } from 'szamlazz-egyszerubben'
import { item } from 'szamlazz-egyszerubben/money'
import { s3Storage } from 'szamlazz-egyszerubben/storage'
import { upstashCookieStore } from 'szamlazz-egyszerubben/cookie-stores'

const szamlazz = createSzamlazz({
  agentKey: process.env.SZAMLAZZ_AGENT_KEY!,
  cookieStore: upstashCookieStore(redis),                // opcionális
  storage: s3Storage({ client: s3, bucket: 'szamlak' }), // opcionális
})

// Díjbekérő → befizetés → számla (racehub nevezési flow)
const proforma = await szamlazz.invoices.create({
  type: 'proforma',
  orderNumber: `NEV-${entry.id}`,
  buyer: { name, zip: '1234', city: 'Budapest', address: 'Fő utca 1.', email, sendEmail: true },
  items: [item.fromGross({ name: 'Nevezési díj', unitPrice: 26_000, vat: 27 })],
  paymentMethod: 'átutalás',
})

const invoice = await szamlazz.invoices.create({
  type: 'invoice',
  proformaNumber: proforma.number,
  orderNumber: `NEV-${entry.id}`,
  /* ... */
  pdf: { upload: true },         // → invoice.pdf.key / invoice.pdf.url
})
await szamlazz.invoices.registerPayment(invoice.number, { amount: invoice.totals.gross, method: 'átutalás' })

// Nyugta
const receipt = await szamlazz.receipts.create({ prefix: 'NYGT', paymentMethod: 'készpénz', items: [/* ... */] })
await szamlazz.receipts.send(receipt.number, { email: 'vevo@example.hu' })

// Adószám
const company = await szamlazz.taxpayer.lookup('13421739')
```

---

## 6. Ismert buktatók (racehub tapasztalat + docs)

Ezek kerüljenek kódba, tesztbe **és** a README-be. A versenytársak dokumentációjából ezek hiányoznak.

| # | Buktató | Megoldás |
|---|---|---|
| 1 | UTC dátummal éjfél után az előző napra csúszik a kelt, erre **352-es hiba** jön ("A számla kelte csak a mai nap lehet") | `Europe/Budapest` `Intl.DateTimeFormat`, teszt éjfél körüli időpontra |
| 2 | A sztornó válasza 3+ alakú lehet: nyers PDF (`%PDF`), `xmlagentresponse=DONE;szám`, XML `<pdf>`-fel, plusz fejlécek | Egységes `response.ts` formátum-felismerő, mindegyikre fixture |
| 3 | A díjbekérő törlő séma **kisbetűs `rendelesszam`** mezőt vár, a létrehozó viszont `rendelesSzam`-ot | Az XSD-ből generált típusok kiszűrik |
| 4 | Az XML **elemsorrendje kötött** (XSD sequence), a rossz sorrend 57-es hibát ad, vagy csendben nem érvényesül a beállítás | Sorrendtartó serializer + XSD validáció a CI-ban (`xmllint`) |
| 5 | Forintos számlán a tétel nettó/áfa/bruttó **egész szám**, csak a nettó egységár lehet tört | `money` modul, 259–264-es hibák megelőzése |
| 6 | Forintos nyugtán a bruttó egész, a nettó/áfa **max. 2 tizedes**, és a nettó + áfa **pontosan** a bruttó, tűrés nincs (261, 363–365) | Külön `receiptItem` kalkulátor |
| 7 | Bruttóból visszaszámolt nettónál 1 Ft eltérés lehet | Explicit `vatAmount` = bruttó − nettó (ahogy a racehub `calculateItemAmountsFromGross` csinálja) |
| 8 | Az Agent kulcs **kis- és nagybetű érzékeny**, csak kisbetűs kulcsot fogad el | Figyelmeztetés, ha nagybetűt tartalmaz |
| 9 | A session cookie 90 perc inaktivitás után lejár, és fiókadat-változás után újat kell kérni | Store TTL + `resetSession()` |
| 10 | `valaszVerzio=1` esetén a hiba szöveges `[ERR] … ----------` stack trace | Mindig `valaszVerzio=2`, ahol lehet; fallback parser |
| 11 | Duplikált rendelésszám (71/152): bekapcsolt tiltásnál azonos adatokkal 2 napon belül a korábbi számlát adja vissza | Idempotencia-kulcsként dokumentálni + lookup-before-retry |
| 12 | Max. 5 próbálkozás kérésenként, a ciklusban retry kitiltást érhet | A retry policy ezt kikényszeríti |
| 13 | Az XML lekérés csak Számlázz.hu-ban kiállított kimenő számlákra működik | Típus és docs |
| 14 | Előlegszámlához csak 1 végszámla állítható ki | Docs + validáció, ha van rá adat |
| 15 | 164-es hiba: felhasználónév/jelszóval, több fiókhoz hozzáféréssel | Csak Agent kulcsot támogatunk elsődlegesen |
| 16 | **A NAV nyugta-adatszolgáltatás 2026-09-01-től kötelező, a türelmi idő 2026-12-31-ig tart**, és a Számlázz.hu még dolgozik az automatizáláson | Figyelni a docs változásait (lásd 11. pont), gyorsan lekövetni |

---

## 7. Ütemterv

Minden fázis végén: zöld teszt, ≥ 80% coverage az új kódra, frissített README.

### Fázis 0 — Setup ✅ (ebben a körben kész)
- [x] Mappa, `package.json`, TypeScript, tsdown, Vitest, Biome
- [x] CI workflow (lint, typecheck, test, build, publint, attw)
- [x] Docs kutatás, `.research/` (lokális, gitignored)
- [x] Első modul: `core/actions.ts`, `core/dates.ts` tesztekkel

### Fázis 1 — Core (1,5–2 nap)
- [ ] `scripts/fetch-xsd.ts` + `gen-types.ts` → `src/generated/`
- [ ] `core/xml/serialize.ts` (sorrend, escape, boolean/szám formázás)
- [ ] `core/transport.ts` (fetch, multipart, timeout, AbortSignal, cookie store, injektálható `fetch`)
- [ ] `core/response.ts` (minden formátum), `core/errors.ts` (teljes hibakód-tábla)
- [ ] `money/` (számla nettó és bruttó alapú, nyugta, deviza), property-based tesztek (fast-check)
- **Kész, ha:** a hivatalos minta XML-eket bájtra (normalizálva) reprodukáljuk, és az XSD validáció átmegy.

### Fázis 2 — Számlák (2 nap)
- [ ] `invoices.create` minden típusra (számla, előleg, vég, helyesbítő, díjbekérő, szállítólevél), mellékletek (`attachfile1..5`)
- [ ] `invoices.reverse`, `registerPayment`, `getPdf`, `getXml` (parse-olt, típusos), `deleteProforma`
- [ ] Idempotencia: `findByOrderNumber` + retry policy
- **Kész, ha:** mind a 6 művelet lefut tesztfiókon, és a fixture-ök commitolva vannak.

### Fázis 3 — Nyugták + adózó (1 nap)
- [ ] `receipts.create / reverse / get / send`, `taxpayer.lookup`
- **Kész, ha:** 11/11 művelet megvan. Ekkor jöhet a **0.1.0 release**.

### Fázis 4 — Integrációk (3–4 nap)
- [ ] `storage`: interfész + S3-kompatibilis, Vercel Blob, UploadThing, fs
- [ ] `cookie-stores`: memory, Redis/Upstash, Cloudflare KV
- [ ] `drizzle`: `szamlazz_documents`, `szamlazz_events` táblák (pg/mysql/sqlite) + repository
- [ ] `prisma`: `.prisma` snippet (prismaSchemaFolder) + repository
- [ ] `testing`: mock kliens, fixture-ök, MSW handlerek
- [ ] `validators`: adószám CDV, bankszámla CDV, irányítószám, cím

### Fázis 5 — Docs + példák (2–3 nap)
- [ ] README (HU + EN), glosszárium, hibakód-referencia, "buktatók" oldal
- [ ] Docs oldal (Starlight vagy VitePress, GitHub Pages)
- [ ] `examples/`:
  - `nextjs-stripe-webhook` — sikeres fizetés → számla → PDF az R2-be → e-mail
  - `nextjs-barion` / `simplepay` — magyar fizetési szolgáltatók
  - `event-registration` — díjbekérő → befizetés → számla (a racehub flow)
  - `webshop-receipt` — nyugta készpénzes / kártyás vásárlásra
  - `saas-monthly` — havi előfizetési számla cronnal (Inngest / Trigger.dev / pg-boss)
  - `cloudflare-worker` — edge-en, KV cookie store-ral
- [ ] **Dogfooding:** a racehub.hu átállítása az új csomagra

### Fázis 6 — Release + launch
- [ ] Publikus GitHub repo, MIT, `CONTRIBUTING.md`, `SECURITY.md`, issue template-ek
- [ ] Changesets + GitHub Actions release, **npm trusted publishing (OIDC) + provenance**
- [ ] 1.0.0, ha a racehub élesben stabil rajta
- [ ] Launch: magyar dev Facebook csoportok, prog.hu, LinkedIn, dev.to, r/programmingHungary, futozs.hu blogposzt
- [ ] Megkeresni a Számlázz.hu-t, hogy linkeljék a docsban (a PHP SDK mellé)

> **npm, yarn, pnpm, bun:** egy `npm publish` után a csomag mindegyikkel telepíthető, külön setup nem kell. JSR-re (Deno) opcionálisan publikálhatunk.

---

## 8. Tesztelési stratégia

| Szint | Mit | Eszköz |
|---|---|---|
| Unit | money, dates, validators, XML serializer, response parserek | Vitest + fast-check |
| Contract | a generált XML megfelel a hivatalos XSD-nek | `xmllint --schema` a CI-ban |
| Fixture | minden válaszformátum (siker, hiba, PDF, DONE, [ERR]) anonimizált valós mintával | Vitest snapshot |
| E2E | opcionális suite a Számlázz.hu **tesztfiók** ellen (`SZAMLAZZ_TEST_AGENT_KEY`), forkból érkező PR-on nem fut | Vitest, `describe.skipIf` |

Limitek: tesztfiókban max. 500 számla / 10 perc. Az e2e szekvenciálisan fut, hívásszámlálóval.

---

## 9. Tooling

- **TypeScript** strict + `exactOptionalPropertyTypes`
- **tsdown**: ESM + CJS + d.ts; **publint** + **@arethetypeswrong/cli** a CI-ban
- **Biome**: lint + format egy eszközzel
- **Vitest** + v8 coverage (küszöb: 80%)
- **Changesets**: verziózás + CHANGELOG
- **GitHub Actions**: CI a Node 22 / 24 / 26 mátrixon; release OIDC-vel
- **Renovate** a dev függőségekhez
- Heti **docs-figyelő** workflow: letölti a docs.szamlazz.hu/hu/agent oldalakat és az XSD-ket, és ha változás van, issue-t nyit

---

## 10. Név

Elérhetőség az npm-en ellenőrizve 2026-09-15-én (404 = szabad).

| Név | Szabad? | Hangulat | Megjegyzés |
|---|---|---|---|
| **`kassza`** | ✅ | profi, rövid, magyar | Márkának jó, később a Billingo is beférhet alá (`kassza/billingo`). A "szamlazz" szó a keywordsbe és a leírásba kerül. |
| **`nyugi`** | ✅ | frappáns, vicces | "nyugta" + "nyugi". Szlogen: *"Számlázz nyugodtan."* Kicsit nyugta-centrikusnak hangzik. |
| `szamlakit` | ✅ | leíró | Jó SEO, kevésbé emlékezetes |
| `szamlazz-kit` / `szamlazz-sdk` | ✅ | leíró | A **védjegy** miatt kockázatos: hivatalosnak tűnhet |
| `pengo` | ✅ | játékos | Nem utal számlázásra |
| `fizetve` | ✅ | kedves | Inkább a fizetésről szól |
| `szamlazz-egyszerubben` | ✅ | munkanév | Hosszú, de pontosan leírja, mit csinál |
| ~~`blokk`~~, ~~`szamlazzhu`~~ | ❌ foglalt | | |

**Javaslat:** `kassza` csomagnév, *"Számlázz.hu, TypeScriptben, egyszerűbben."* taglinnal, a README-ben pedig egyértelmű **"Nem hivatalos, a KBOSS.hu Kft.-hez nem kapcsolódik"** jelzéssel.

> A név, amíg senki nem foglalja el, csak egy publikált csomaggal foglalható le. Ezt csak kifejezett jóváhagyással publikálom.

---

## 11. Kockázatok

| Kockázat | Hatás | Kezelés |
|---|---|---|
| Rossz kerekítés miatt hibás számla | magas (pénzügyi/jogi) | property-based tesztek, a hivatalos példák mint tesztesetek, MIT "AS IS" |
| Változik a Számlázz.hu API vagy XSD (pl. NAV nyugta-adatszolgáltatás) | közepes | heti docs/XSD diff workflow, gyors patch release |
| Védjegy ("Számlázz.hu" a névben) | közepes | márkafüggetlen csomagnév, "nem hivatalos" disclaimer |
| Karbantartási teher, egyetlen fejlesztőre épül | közepes | jó tesztek, CONTRIBUTING, co-maintainer keresése a launch után |
| Személyes adat a fixture-ökben | magas | anonimizáló script, pre-commit ellenőrzés |
| Túl sok retry miatti kitiltás | magas | beépített, felhasználó által ki nem kapcsolható felső korlát |

---

## 12. Nyitott kérdések

1. **Név:** `kassza`, `nyugi` vagy más?
2. **GitHub:** személyes fiók (`futozs/…`) vagy külön org (pl. `kassza-dev`)? Az orghoz passzoló npm scope is kellhet.
3. **Username/jelszó auth:** a docs szerint az Agent kulcs az ajánlott. Támogassuk a régit is (`legacyAuth`), vagy csak a kulcsot?
4. **Billingo:** később belefér a márkába, vagy maradjon tisztán Számlázz.hu?
