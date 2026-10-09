# Cloudflare Worker + SimplePay IPN

Egy Worker, amely a SimplePay IPN-értesítéséből (`POST /simplepay/ipn`) pontosan egy nyugtát vagy számlát állít ki, és a SimplePay által várt aláírt választ adja vissza.

1. `npm install`, majd másold a `.dev.vars.example`-t `.dev.vars`-ba és töltsd ki.
2. `npm run dev`, élesben `npm run deploy` (a titkokat `wrangler secret put` paranccsal add meg).
3. A SimplePay kereskedői felületén az IPN URL legyen `https://<worker>/simplepay/ipn`.

- A munkamenet, a kitiltás elleni napló, a `createOnce` zárja és az ismétlés-szűrő egy Durable Objectben él (`KasszaStore`). A Cloudflare KV erre nem alkalmas, mert nincs benne atomikus írás.
- A SimplePay a fizetés részleteit lekérdezi (`fetchDetails`), így a bizonylaton a tényleges összeg szerepel.
