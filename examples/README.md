# kassza indítósablonok

Három kis, működő kiindulópont. Mindegyik logikáját a kassza CI-ja a hamis Számla Agent ellen futtatja (`tests/examples.test.ts`), így a sablonok nem romlanak el csendben.

| Sablon | Mit mutat |
| --- | --- |
| [nextjs-stripe](./nextjs-stripe) | Next.js App Router, Stripe webhook → nyugta vagy számla pontosan egyszer, Upstash zár és ismétlés-szűrő |
| [cloudflare-simplepay](./cloudflare-simplepay) | Cloudflare Worker, SimplePay IPN → bizonylat, Durable Object tároló a zárhoz |
| [express-billing](./express-billing) | Express szerver Stripe webhookkal és havi előfizetés-számlázással (`runBatch`) |

Másold ki a mappát, futtasd az `npm install`-t, és töltsd ki a `.env` fájlt a `.env.example` alapján. Fejlesztéshez Számlázz.hu **tesztfiók** Agent kulcsát használd. A sablonok a kassza 0.14-es vagy újabb verzióját igénylik.
