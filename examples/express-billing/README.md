# Express + Stripe webhook + havi számlázás

Egy Express szerver két végponttal:

- `POST /webhooks/stripe`: Stripe fizetésből pontosan egy bizonylat. A `toNodeHandler` miatt a webhook megkapja a nyers törzset; ezért van az útvonal az `express.json()` előtt.
- `POST /billing/monthly`: az előfizetések havi számlája a `runBatch`-csel. Ütemezőből (cron) hívd; `?dryRun=1` esetén csak előnézet készül. Újrafuttatva nem állít ki duplát.

1. `npm install`, majd másold a `.env.example`-t `.env`-be és töltsd ki.
2. `npm start` (Node.js 22.6+).

A számlázási időszak az előfizetés kezdőnapjától számít, és a hónap végét csúszás nélkül kezeli. A teljesítés dátuma itt az időszak utolsó napja; hogy a te esetedben mi a helyes, azt egyeztesd a könyvelőddel.
