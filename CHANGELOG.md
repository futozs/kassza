# Változásnapló

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
