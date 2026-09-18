# Változásnapló

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

- asd (7b88b06)
- n (8eb15bf)
- add vercel configuration for Next.js deployment (3978405)
- asd (810ab5c)
- asd (cefe99a)
- asd (9ab4859)
- aasd (f1c62a0)
- asd (74a8442)
- asd (9551457)
- Create nextjs.yml (abbd379)
- Initial plan (820d084)

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
