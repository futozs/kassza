<p align="center">
  <img src="https://raw.githubusercontent.com/futozs/kassza/main/assets/logo-wordmark.svg" alt="kassza" width="460">
</p>

<p align="center">
  <b>Számlázz.hu, TypeScriptben, egyszerűbben.</b><br>
  Számla, díjbekérő, nyugta, sztornó, befizetés, PDF, adószám. Mind a 11 Agent művelet, 0 függőség.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/kassza"><img src="https://img.shields.io/npm/v/kassza?color=14532D&label=npm" alt="npm verzió"></a>
  <a href="https://www.npmjs.com/package/kassza"><img src="https://img.shields.io/npm/dm/kassza?color=14532D&label=letöltés" alt="havi letöltés"></a>
  <img src="https://img.shields.io/badge/függőség-0-14532D" alt="0 függőség">
  <img src="https://img.shields.io/badge/TypeScript-szigorú-14532D" alt="TypeScript">
  <img src="https://img.shields.io/npm/l/kassza?color=14532D&label=licenc" alt="MIT licenc">
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

## Miért kassza?

<p align="center">
  <img src="https://raw.githubusercontent.com/futozs/kassza/main/assets/comparison.svg" alt="Számla Agent műveletek: kassza 11, a többi csomag 2–3" width="720">
</p>

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

## Tartalom

- [Beállítás](#beállítás)
- [Számlák](#számlák)
- [Nyugták](#nyugták)
- [Adószám lekérdezés](#adószám-lekérdezés)
- [Hibakezelés](#hibakezelés)
- [Fizetési értesítés (IPN)](#fizetési-értesítés-ipn)
- [PDF mentése tárhelyre](#pdf-mentése-tárhelyre)
- [Serverless és edge](#serverless-és-edge)
- [Tesztelés](#tesztelés)
- [Validátorok és pénzszámítás](#validátorok-és-pénzszámítás)
- [Haladó beállítások](#haladó-beállítások)
- [AI-val kódolsz?](#ai-val-kódolsz)

## Beállítás

Az Agent kulcsot a Számlázz.hu felületén, a vezérlőpult alján generálhatod.

```bash
SZAMLAZZ_AGENT_KEY=a-te-agent-kulcsod
```

```ts
import { createKassza } from 'kassza'

export const kassza = createKassza()
```

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

## Számlák

### Számla

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

Az ár megadható nettóban vagy bruttóban, a kerekítés a hivatalos szabályok szerint történik:

```ts
{ name: 'Tanácsadás', netUnitPrice: 20_000, vat: 27 }
{ name: 'Belépő', grossUnitPrice: 4_990, vat: 27 }
{ name: 'Könyv', grossUnitPrice: 3_500, vat: 5 }
{ name: 'Oktatás', netUnitPrice: 50_000, vat: 'AAM' }
```

A nettó ár a B2B számlákhoz, a bruttó ár a B2C számlákhoz való. Az `'AAM'` alanyi adómentes tételt jelöl.

### Díjbekérő, majd számla

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

### Díjbekérő törlése

```ts
await kassza.invoices.deleteProforma({ orderNumber: 'NEV-42' })
```

### Előleg- és végszámla

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

### Helyesbítő számla

```ts
await kassza.invoices.create({
  type: 'corrective',
  correctedInvoiceNumber: 'E-WEB-2026-12',
  buyer,
  items: [{ name: 'Póló visszáru', quantity: -1, grossUnitPrice: 5_990, vat: 27 }],
})
```

### Szállítólevél

```ts
await kassza.invoices.create({ type: 'deliveryNote', buyer, items })
```

### Devizás számla, külföldi vevő

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

Az árfolyam, ha nem adod meg, automatikusan az MNB aktuális árfolyama.

### Előnézet, számla kiállítása nélkül

```ts
const { pdf, grossTotal } = await kassza.invoices.preview({ buyer, items })
```

### Melléklet az e-mailhez

```ts
await kassza.invoices.create({
  buyer,
  items,
  attachments: [{ filename: 'aszf.pdf', content: aszfPdfBytes, contentType: 'application/pdf' }],
})
```

Legfeljebb 5 melléklet adható meg, darabonként 2 MB.

### Sztornó

```ts
const sztorno = await kassza.invoices.reverse('E-WEB-2026-12')
```

### Befizetés rögzítése

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

### PDF letöltése utólag

```ts
import { writeFile } from 'node:fs/promises'

const { pdf } = await kassza.invoices.getPdf('E-WEB-2026-12')
await writeFile('szamla.pdf', pdf)
```

Rendelésszám vagy külső azonosító alapján is működik: `getPdf({ orderNumber: 'REND-1001' })`, `getPdf({ externalId: 'a1b2' })`.

### Számla adatainak lekérése

```ts
const adatok = await kassza.invoices.get({ orderNumber: 'REND-1001' })
adatok.header.issueDate
adatok.buyer.name
adatok.items
adatok.payments

const talan = await kassza.invoices.find({ orderNumber: 'REND-9999' })
```

A `find` `null`-t ad, ha nincs ilyen számla, a `get` ilyenkor hibát dob.

## Nyugták

### Nyugta

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

### Kiküldés e-mailben

```ts
await kassza.receipts.send({ receiptNumber: nyugta.number, emails: 'vevo@ceg.hu' })
```

### Lekérdezés

```ts
const ugyanaz = await kassza.receipts.get(nyugta.number)
const rendelesbol = await kassza.receipts.find({ orderNumber: 'REND-1001' })
```

### Sztornó

```ts
await kassza.receipts.reverse(nyugta.number)
```

## Adószám lekérdezés

```ts
const ceg = await kassza.taxpayer.query('13421739')

if (ceg.valid) {
  ceg.name
  ceg.taxNumber?.formatted
  ceg.address?.formatted
}
```

A cégadatok a NAV-tól jönnek, a cím formázva, például `1031 Budapest, Záhony utca 7.`

## Hibakezelés

Minden hiba `SzamlazzError`, magyar üzenettel és javítási tippel.

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

| `error.category` | Jelentés |
|---|---|
| `validation` | Hibás adat, a kérés el sem ment, vagy a Számlázz.hu elutasította |
| `duplicate` | Ez a rendelésszám vagy `callId` már létezik |
| `partial_success` | A számla elkészült, csak az e-mail nem ment ki. **Ne állítsd ki újra!** |
| `not_found` | Nincs ilyen bizonylat |
| `auth` / `account` | Rossz kulcs, lejárt előfizetés |
| `network` / `timeout` / `maintenance` | Átmeneti hiba |

Újraküldés csak ott történik magától, ahol biztonságos: lekérdezéseknél, hálózati hibánál, legfeljebb 5-ször. **Számlát a kassza soha nem küld újra.** A Számlázz.hu kitiltja azt, aki ciklusban próbálkozik. Bizonytalan hiba után a `find({ orderNumber })` megmondja, elkészült-e a számla.

## Fizetési értesítés (IPN)

A Számlázz.hu értesít, ha egy számlát kifizettek. Például egy Next.js route handlerben:

```ts
import { ipnOkResponse, readIpnNotification } from 'kassza/ipn'

export async function POST(request: Request) {
  const ipn = await readIpnNotification(request)

  if (ipn.isFullyPaid) await rendelesFizetve(ipn.orderNumber, ipn.paidAmount)

  return ipnOkResponse()
}
```

Csak a Számlázz.hu IP-címeiről jövő kérést érdemes elfogadni:

```ts
import { isSzamlazzIp } from 'kassza/ipn'

isSzamlazzIp(request.headers.get('x-forwarded-for') ?? '')
```

## PDF mentése tárhelyre

S3, Cloudflare R2, MinIO vagy Backblaze esetén nem kell az AWS SDK:

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

Fájlrendszerbe (Node):

```ts
import { fsStorage } from 'kassza/storage/fs'

const tarhely = fsStorage({ directory: './szamlak' })
```

További adapterek: `s3Storage` (AWS SDK), `r2BindingStorage`, `vercelBlobStorage`, `uploadthingStorage`, `supabaseStorage`, `memoryStorage`.

## Serverless és edge

A session cookie újrahasznosítása gyorsítja a hívásokat. Serverless környezetben tedd közös tárolóba:

```ts
import { Redis } from '@upstash/redis'
import { upstashRedisCookieStore } from 'kassza/cookie-stores'

const kassza = createKassza({ cookieStore: upstashRedisCookieStore(Redis.fromEnv()) })
```

Cloudflare Workers alatt:

```ts
import { cloudflareKvCookieStore } from 'kassza/cookie-stores'

const kassza = createKassza({ agentKey: env.SZAMLAZZ_AGENT_KEY, cookieStore: cloudflareKvCookieStore(env.KASSZA_KV) })
```

Van még `ioredisCookieStore`, `nodeRedisCookieStore` és `customCookieStore` is. Ha a tároló elérhetetlen, a számlázás attól még működik.

## Tesztelés

A mock kliens valódi API-hívás nélkül működik, de ugyanazt a validációt és kerekítést futtatja, mint az éles kliens.

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

## Validátorok és pénzszámítás

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

```ts
import { calculateInvoiceItem, calculateReceiptItem } from 'kassza/money'

calculateInvoiceItem({ quantity: 3, grossUnitPrice: 500, vat: 27 })
calculateReceiptItem({ grossUnitPrice: 1_000, vat: 27 })
```

Az első eredménye `{ netAmount: 1181, vatAmount: 319, grossAmount: 1500, ... }`, a másodiké `{ netAmount: 787.4, vatAmount: 212.6, grossAmount: 1000, ... }`.

## Haladó beállítások

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

A `resetSession()` új sessiont kér. Hívd meg, ha a Számlázz.hu fiókban megváltoztak a cégadatok:

```ts
await kassza.resetSession()
```

## AI-val kódolsz?

A csomagban van egy `agents/` mappa. Ebből a Claude Code, a Cursor, a Copilot és a többi asszisztens megtudja, hogyan kell jól használni a kasszát, és mik a buktatók. Szólj rá az AI-ra:

> Használd a kassza csomagot, és előbb olvasd el a `node_modules/kassza/agents/README.md`-t.

Claude Code-hoz kész skill is van: másold a `node_modules/kassza/agents/skills/kassza` mappát a projekted `.claude/skills/` mappájába.

---

<sub>Nem hivatalos csomag, nem kapcsolódik a KBOSS.hu Kft.-hez (Számlázz.hu). A hivatalos dokumentáció a <a href="https://docs.szamlazz.hu/hu/agent/">docs.szamlazz.hu</a> oldalon érhető el. MIT licenc.</sub>
