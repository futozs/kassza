# kassza weboldal

A [kassza](https://www.npmjs.com/package/kassza) npm csomag weboldala: főoldal, magyar nyelvű dokumentáció és egy böngészőben futó sandbox, ahol a példák Agent kulcs nélkül, egy szimulált Számlázz.hu ellen futnak.

Next.js 16 (App Router), React 19, Tailwind CSS 4 és fumadocs (MDX) alapokon készül. A csomagot a `package.json`-ban rögzített npm verzióból használja, nem a repó forrásából.

## Követelmények

- Node.js 22 vagy újabb
- npm (a `package-lock.json` a mérvadó)

```bash
cd web
npm install
npm run dev
```

## Parancsok

| Parancs | Mit csinál |
| --- | --- |
| `npm run dev` | Legenerálja a sandbox fájljait, majd elindítja a fejlesztői szervert (`http://localhost:3000`) |
| `npm run dev:next` | Csak a Next.js fejlesztői szerver, sandbox build nélkül (ha a `generated/` és a `public/sandbox-runtime/` már megvan) |
| `npm run build` | Sandbox build, majd éles Next.js build |
| `npm run start` | Az éles build kiszolgálása |
| `npm run sandbox:build` | A sandbox worker, a futásidejű fájlok, a Monaco szerkesztő és a példák kimenetének generálása |
| `npm run typecheck` | Sandbox build, `next typegen`, majd `tsc --noEmit` |
| `npm run lint` | Biome ellenőrzés (`npm run lint:fix` javít is) |
| `npm test` | Vitest egységtesztek (`sandbox/**` és `lib/**`) |
| `npm run ci` | Lint, típusellenőrzés, tesztek és build egymás után |

## Felépítés

```text
web/
├── app/                      útvonalak (App Router)
│   ├── (site)/               főoldal
│   ├── docs/[[...slug]]/     dokumentációs oldalak
│   ├── sandbox/              a sandbox oldal
│   ├── api/search/           statikus keresőindex
│   ├── docs-md/[[...slug]]/  az oldalak Markdown változata (a /docs/*.md ide van átírva)
│   ├── og/docs/[...slug]/    az oldalak Open Graph képe
│   ├── llms.txt/             oldallista AI eszközöknek
│   ├── llms-full.txt/        a teljes dokumentáció egy fájlban
│   ├── sitemap.ts, robots.ts
│   ├── not-found.tsx, icon.svg
│   └── layout.tsx
├── content/docs/             a dokumentáció MDX fájljai és a meta.json navigáció
├── components/
│   ├── docs/                 oldalsáv, tartalomjegyzék, morzsamenü, lapozó
│   ├── mdx/                  MDX komponensek (Callout, Cards, Tabs, Example, kalkulátorok)
│   ├── sandbox/              a sandbox felülete (szerkesztő, kimeneti panelek)
│   ├── landing/              a főoldal elemei
│   └── site/                 navigáció, lábléc, kereső, logó, témaváltó
├── sandbox/
│   ├── simulator/            a Számlázz.hu Agent szimulátora (számlák, nyugták, PDF, adószám)
│   ├── runtime/              a felhasználói kód fordítása és futtatása, konzol és eredmény szerializálás
│   ├── examples/             a futtatható példák és a katalógusuk (catalog.ts)
│   └── worker.ts             a böngészőben futó Web Worker belépési pontja
├── scripts/                  a sandbox build és a példák előfuttatása
├── lib/                      közös segédek (site adatok, fumadocs source, linkek, llms, OG kép)
├── styles/                   design tokenek (tokens.css), próza és kód stílusok
├── generated/                a sandbox build kimenete (gitignored)
├── public/                   statikus fájlok; a monaco/ és a sandbox-runtime/ generált
├── proxy.ts                  a /docs/*.md kérések átírása
└── source.config.ts          fumadocs-mdx beállítások (Shiki téma, Twoslash, lastModified)
```

### A sandbox működése

A `/sandbox` oldalon a felhasználó kódja egy Web Workerben fut (`sandbox/worker.ts`). A `runtime` lefordítja a TypeScriptet, a `kassza` importot a valódi csomagra köti, a hálózati hívásokat pedig a `simulator` kapja meg, amely a Számlázz.hu Agent válaszait állítja elő. A futtatókörnyezet fájljait a `/sandbox-runtime/` útvonal szolgálja ki, szigorú CSP-vel (nincs hálózati hozzáférés).

A `npm run sandbox:build` minden példát lefuttat a szimulátor ellen, és a kimenetet (konzol, elküldött XML, válasz) a `generated/examples.json`-ba írja. Ha egy példa hibával fut le, a build megáll.

## Új dokumentációs oldal

1. Hozd létre az MDX fájlt a megfelelő mappában, például `content/docs/alapok/uj-oldal.mdx`:

   ```mdx
   ---
   title: Új oldal
   description: Egy-két mondat arról, mit tud meg az olvasó. Ez kerül a keresőbe, az OG képre és az llms.txt-be is.
   official: https://docs.szamlazz.hu/hu/agent/...
   ---

   A tartalom Markdownban, a `components/mdx` komponenseivel.
   ```

   Az `official` opcionális: a hivatalos Számlázz.hu leírásra mutat.
2. Vedd fel a fájl nevét (kiterjesztés nélkül) a mappa `meta.json` fájljának `pages` listájába, a kívánt helyre. Új mappánál a mappába is kell egy `meta.json` (`title`, `pages`), és a mappa nevét a szülő `meta.json`-jába is fel kell venni.
3. Minden más automatikus: a navigáció, a keresőindex, a sitemap, az llms.txt, a Markdown változat (`/docs/alapok/uj-oldal.md`) és az OG kép (`/og/docs/alapok/uj-oldal/image.png`) a build során elkészül.

Egy sandbox példa a `<Example slug="szamla" />` komponenssel ágyazható be; ez a kódot, a konzolkimenetet és a ténylegesen elküldött XML-t mutatja.

## Új sandbox példa

1. Írd meg a példát a `sandbox/examples/<slug>.ts` fájlba. A kód a `kassza` csomagot importálja, az Agent kulcsot a sandbox adja, a hívásokat a szimulátor szolgálja ki.
2. Vedd fel az `EXAMPLES` listába a `sandbox/examples/catalog.ts`-ben: `slug` (egyezzen a fájlnévvel), `title`, `group` (`Számlák`, `Nyugták`, `NAV`, `Hibakezelés` vagy `Eszközök`), `description` és opcionálisan `docs` (a kapcsolódó dokumentációs oldal útvonala).
3. Futtasd a `npm run sandbox:build` parancsot. Ha a példa hibát dob, a build megmondja, melyik példa és miért.
4. Ha a példa olyan Agent viselkedést használ, amit a szimulátor még nem ismer, a `sandbox/simulator` alatt bővítsd, és írj hozzá tesztet (`simulator.test.ts`).

## SEO és AI végpontok

| Útvonal | Tartalom |
| --- | --- |
| `/sitemap.xml` | A főoldal, a sandbox és minden dokumentációs oldal, utolsó módosítási dátummal |
| `/robots.txt` | Minden engedélyezett, kivéve az `/api/` és a belső `/docs-md/` útvonalat |
| `/llms.txt` | A dokumentáció oldallistája leírásokkal, a Markdown változatokra mutató linkekkel ([llmstxt.org](https://llmstxt.org)) |
| `/llms-full.txt` | Az összes oldal feldolgozott Markdownja, a navigáció sorrendjében |
| `/docs/<oldal>.md` | Egy oldal Markdownja (`text/markdown`), a kezdőlapé `/docs/index.md` |
| `/og/docs/<oldal>/image.png` | Az oldal Open Graph képe (1200 × 630) |

Mindegyik statikusan, a build során készül. Az abszolút URL-ek alapja a `lib/site.ts`-ben dől el: `NEXT_PUBLIC_SITE_URL`, ennek hiányában Vercelen a `VERCEL_PROJECT_PRODUCTION_URL`, helyben `http://localhost:3000`. Az OG képek betűtípusait (Bricolage Grotesque, Geist, Geist Mono) a build a Google Fontsból tölti le.

## Deploy (GitHub Pages)

A `main` ágra pusholt minden commit után a `.github/workflows/web.yml` lefuttatja a web lintet, típusellenőrzést, teszteket és statikus exportot, majd siker esetén automatikusan közzéteszi a `web/out` tartalmát a GitHub Pages-en.

Az oldal címe: `https://futozs.github.io/kassza/`. Első alkalommal a repository `Settings > Pages` részén engedélyezd a GitHub Pages-t, majd a `Build and deployment > Source` értékét állítsd `GitHub Actions`-re. Ezt a repository `GITHUB_TOKEN`-je nem tudja automatikusan létrehozni. Ezután a workflow automatikusan telepít minden sikeres `main` buildet.

A GitHub Pages statikus hosting miatt a web Next.js export módban készül, `/kassza` base path-tal. A Markdown runtime route-ok nem részei ennek az exportnak. Az „Utoljára frissítve” dátumokat és a sitemap `lastModified` értékeit a build a git előzményből olvassa, ezért a CI teljes előzménnyel (`fetch-depth: 0`) klónoz.

A csomag saját CI-ja (`ci.yml`) és kiadási folyamata (`release.yml`) a `web/` változásait figyelmen kívül hagyja.
