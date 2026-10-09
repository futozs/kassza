# Next.js + Stripe → nyugta vagy számla

Egy Stripe webhook (`/api/webhooks/stripe`), amely minden sikeres fizetésből pontosan egy nyugtát vagy számlát állít ki a Számlázz.hu-n, teljes visszatérítéskor sztornóz, részleges visszatérítéskor helyesbítő számlát állít ki.

1. `npm install`, majd másold a `.env.example`-t `.env.local`-ba és töltsd ki.
2. Stripe CLI-vel: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
3. `npm run dev`.

- Upstash nélkül a tároló memóriában van: fejlesztéshez jó, élesben (több serverless példány) add meg az Upstash változókat, különben a dupla kiállítás elleni zár csak egy példányon belül véd.
- A nem javítható hibákat (hiányzó cím, áfa) és a kézi döntést igénylő részleges visszatérítéseket az `onManualReview` kapja; ott köss be riasztást.
