# Változásnapló

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
