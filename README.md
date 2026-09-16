# szamlazz-egyszerubben

> **Munkanév.** A csomag még fejlesztés alatt áll és nincs publikálva. Az ütemterv a [PLAN.md](./PLAN.md)-ben van.

Teljes, típusbiztos **Számlázz.hu Számla Agent** kliens TypeScripthez és JavaScripthez.

- **Mind a 11 Agent művelet:** számla (előleg-, vég-, helyesbítő számla, díjbekérő, szállítólevél), sztornó, befizetés rögzítése, PDF és XML lekérés, díjbekérő törlés, nyugta (létrehozás, sztornó, lekérdezés, kiküldés), adószám lekérdezés
- **Natív `fetch`:** Node 22+, Bun, Deno, Cloudflare Workers, Vercel Edge
- **Fillérre pontos kerekítés** a hivatalos számla- és nyugtaszabályok szerint
- **Típusos hibák**, biztonságos retry, idempotencia rendelésszámmal
- **Integrációk:** PDF feltöltés (S3 / R2 / Vercel Blob / UploadThing), Prisma és Drizzle sémák, session cookie store-ok, mock kliens tesztekhez

```bash
npm install szamlazz-egyszerubben
# yarn add / pnpm add / bun add is ugyanígy működik
```

> ⚠️ **Nem hivatalos csomag.** Nem kapcsolódik a KBOSS.hu Kft.-hez (Számlázz.hu). A hivatalos dokumentáció: [docs.szamlazz.hu](https://docs.szamlazz.hu/hu/agent/).

## Fejlesztés

```bash
npm install
npm test            # Vitest
npm run ci          # lint + typecheck + coverage + build + publint/attw
```

## Licenc

MIT
