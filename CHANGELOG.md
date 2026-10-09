# Változásnapló

## 0.16.0 (2026-10-09)

### Újdonságok

- **web:** ignoreCommand hozzáadása a vercel.json fájlhoz (ff5c03a)

## 0.15.0 (2026-10-09)

### Újdonságok

- **web:** deploy csak a main ágon engedélyezve a vercel.json fájlban (e272f85)

## 0.14.0 (2026-10-09)

### Mi változott

**Dupla számla ellen, több folyamat között is.** Az azonos rendelésre egyszerre érkező `createOnce` hívásokat a kassza összevonja, a `createOnceLock` közös tárolóval pedig serverless példányok között is csak egy bizonylat készül. Új hibakategóriák: `in_progress` és `store_unavailable`.

**Megbízhatóbb próbálkozás-napló és hangos hibák.** A kitiltás elleni számláló atomikus (Redis `INCR`), tárolóhibánál folyamaton belüli tartalékkal; `attemptLedgerMode: 'fail-closed'` is választható. Az új `onWarning` hook megkapja a korábban csendben elnyelt hibákat, az `onDocumentError: 'throw'` pedig `DocumentHookError`-t ad (benne az elkészült bizonylattal), ha a napló írása elbukik.

**Új alkönyvtárak.** `kassza/stores` (atomikus Redis/Upstash adapterek, Durable Object tároló, `diagnoseStore`), `kassza/journal` (bizonylatnapló a NAV napi összesítőhöz, befejezetlen tételekkel és egyeztetéssel), `kassza/batch` (idempotens, sebességkorlátos tömeges számlázás és számlázási időszakok), `kassza/node` (Express, NestJS, Fastify), `kassza/observe` (napló, tracing, Prometheus metrikák, telemetria nélkül).

**Fizetések.** Részleges visszatérítéskor számlánál visszatérítésenként helyesbítő számla készül, az összeg tételenként pontosan szétosztva (`allocateRefund`); több áfakulcsnál és nyugtánál javaslatot kapsz. A webhookok `dedupe` opcióval a már feldolgozott eseményt a Számla Agent hívása nélkül nyugtázzák. A `registerPaymentOnce` stabil kulccsal pontosan egyszer rögzít befizetést.

**Kisebb fejlesztések.** Adószám-gyorsítótár (`taxpayerCache`), `docsUrl` minden ismert hibakódon (külön oldallal a weboldalon), `checkSzamlazzIp` elutasítási okkal, ±20% szórás és `Retry-After` az újrapróbálásnál, a magányos helyettesítő karakter (félbevágott emoji) kiszűrése az XML-ből, XML mélységkorlát, `kassza doctor --capabilities --report --check-update`.

**Javítás.** A SimplePay visszatérítési események azonosítója mostantól visszatérítésenként egyedi. Ha a `createOnce` utólagos ellenőrzése maga is hibára fut, a kassza ismeretlen kimenetet jelez (`details.outcome: 'unknown'`, `details.lookupError`) a téves „nem készült el” helyett, és ezt a hibát a párhuzamos hívók sem öröklik. A napló a más folyamathoz tartozó foglalást nem törli. A `kassza/node` az Express 4 `express.json()` üres törzsénél a nyers streamet olvassa, a HTTP/2 pszeudo-fejléceket kihagyja. A hiányos `refundItems` tétel érthető validációs hibát ad.

**Megjegyzés.** A `IssuedDocument` két új változatot kapott (`correction`, `refund-proposal`), a `SzamlazzErrorCategory` kettőt (`in_progress`, `store_unavailable`). Ha `switch`-csel kezeled őket, egészítsd ki az ágakat.

### Újdonságok

- **test:** új barrier függvény hozzáadása párhuzamos hívások kezelésére (531c8bc)
- új lefedettségi jelvények generálása és tesztelése feat: új XSD séma hozzáadása a fetch-xsd scripthez refactor: badge generálás refaktorálása és optimalizálása fix: animációs időzítők és átmenetek javítása a landing oldalon docs: beállítások dokumentációjának hozzáadása ci: új workflow a lefedettségi jelvények frissítésére (8baa308)
- **taxpayer:** implement caching for taxpayer queries with tests (1e57896)

## 0.13.0 (2026-10-03)

### Mi változott

A NAV nyugta-adatszolgáltatás kliense (`kassza/nav`: lekérdezés, egyeztetés, beküldés `allowWrite`-tal), a Számlázz.hu pénzügyi adatkapcsolat fogadója (`kassza/data-link`), a hamis Számla Agent (`createFakeAgentFetch` a `kassza/testing`-ben, hibabeillesztéssel), a `kassza` parancssor (`doctor`, `verify`, `xml preview`, `invoice get`, `receipt get`, `nav summary`) és az MCP szerver (`kassza/mcp`, `npx kassza mcp`).

- Karbantartási kiadás

## 0.12.0 (2026-10-02)

### Mi változott

Fizetésből bizonylat: Stripe, SimplePay, Barion, Revolut és PayPal webhook-kezelők és az `issueForPayment()` (`kassza/payments`). Pontosan egyszer nyugtára is (`receipts.createOnce`), kitiltás elleni próbálkozás-napló folyamatok között (`attemptLedger`), `onDocument` hook, `maintenanceCooldownMs`. Nyugta vagy számla döntés (`chooseDocument`), nyugta utólagos számlává alakítása (`receipts.convertToInvoice`), NAV napi összesítő és napi zárás (`kassza/reports`), megbízotti számlázás (`kassza/delegation`).

### Újdonságok

- implement createOnce functionality for receipts with comprehensive tests (2f97dc1)

## 0.11.0 (2026-10-01)

### Mi változott

Karbantartás: a README és a TypeScript beállítások rendbetétele, funkcionális változás nélkül.

### Újdonságok

- update badge colors and styles in README (c88ae63)

## 0.10.0 (2026-09-28)

### Újdonságok

- add console output support to examples and update documentation (477a9cd)

## 0.9.0 (2026-09-19)

### Újdonságok

- enhance release process with registry visibility checks and improved installation logic (c33a599)

## 0.8.0 (2026-09-19)

### Újdonságok

- implement version management for kassza and update installation process (95459f5)

## 0.7.0 (2026-09-19)

### Újdonságok

- add support for trusted proxies in isSzamlazzIp function (5d0ac8e)

## 0.6.0 (2026-09-18)

### Újdonságok

- enhance landing page with coverage bars and hero tape (05844fa)

## 0.5.1 (2026-09-18)

### Egyéb

- Add initial configuration and documentation for kassza package (8c70254)

## 0.5.0 (2026-09-18)

### Újdonságok

- enable GitHub Pages in workflow and update README for automatic setup (4e7b910)

### Javítások

- pontosítás a README bevezető mondatában (7de106f)
- release workflow commits as futozs instead of github-actions[bot] (1b9215c)
- resolve biome lint/format errors breaking CI (6f36d25)
- correct the title text in Hero component (46103ff)
- update deployment workflows for Vercel integration and improve README documentation (bf972fa)
- update GitHub Pages setup instructions in README for clarity and accuracy (d3cd24e)
- update GitHub Pages setup instructions in README and remove redundant configuration step in workflow (ae35418)
- configure GitHub Pages before deploy (3333ad3)

### Egyéb

- add vercel configuration for Next.js deployment (3978405)

## 0.4.0 (2026-09-18)

### Újdonságok

- GitHub Pages engedélyezése a workflow-ban és a README automatikus beállítási lépéseinek frissítése (4e7b910)

## 0.3.0 (2026-09-18)

### Újdonságok

- update GitHub Actions workflow for deployment and add environment variables fix: adjust biome configuration to include web directory and update formatter settings docs: revise deployment instructions in README for GitHub Pages refactor: remove unused Markdown route and update absolute URL function chore: enhance Next.js configuration for static export and base path (e5b29d0)
- add initial configuration and styles for code blocks and prose (1fa34fa)

## 0.2.0 (2026-09-17)

### Újdonságok

- add CI release workflow and enhance release script with CI mode (66b15fe)

## 0.1.2 (2026-09-16)

### Javítások

- npm linkek a futozs/kassza repóra mutatnak (8d95c98)
- publint npm pack visszaállítása, biztonságosabb release visszaállítás (ed14454)

## 0.1.1 (2026-09-16)

### Javítások

- publint mindig npm-mel csomagol, release megszakítás kezelése (7411da4)

### Egyéb

- új README, összehasonlító ábra, példák minden funkcióhoz (14b6959)

## 0.1.0 (2026-09-16)

Az első kiadás.

### Újdonságok

- Mind a 11 Számla Agent művelet: számla (díjbekérő, előleg-, vég-, helyesbítő számla, szállítólevél), előnézet, sztornó, befizetés rögzítése és törlése, PDF és XML lekérés, díjbekérő törlése, nyugta (létrehozás, sztornó, lekérdezés, kiküldés), adószám lekérdezés
- `createKassza()` kliens `find()`-dal és `verifyCredentials()`-szel
- Hivatalos kerekítési szabályok számlára és nyugtára (nettó és bruttó alap, deviza)
- Típusos `SzamlazzError` az összes ismert hibakóddal, magyar tippekkel
- Biztonságos újrapróbálás: csak lekérdezésnél és idempotencia-kulccsal, legfeljebb 5-ször
- `kassza/testing`: mock kliens valódi validációval
- `kassza/ipn`: fizetési értesítés (IPN) webhook feldolgozó
- `kassza/validators`: adószám, bankszámla, IBAN, irányítószám, cím, EU adószám
- `kassza/storage`: PDF mentése S3/R2 (SDK nélkül), R2 binding, Vercel Blob, UploadThing, Supabase, fájlrendszer
- `kassza/cookie-stores`: session megosztás Upstash, ioredis, node-redis, Cloudflare KV store-ral
- `agents/` dokumentáció AI kódoló asszisztenseknek
