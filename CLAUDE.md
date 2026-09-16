# kassza

Nyílt forráskódú, nem hivatalos Számlázz.hu Számla Agent kliens (TypeScript, npm csomag). A teljes terv, a fázisok és a döntések a `PLAN.md`-ben vannak: munka előtt olvasd el.

## Források
- Hivatalos docs: https://docs.szamlazz.hu/hu/agent/
- A docs lokális másolata: `.research/docs-agent/*.md` (gitignored, szerzői jog miatt nem commitoljuk)
- Élesben kipróbált előd: `../src/lib/szamlazz-api.ts`

A részletes útmutató AI agenteknek: `AGENTS.md`.

## Konvenciók
- Kommentek nincsenek a kódban (se `//`, se JSDoc)
- Angol azonosítók, magyar hibaüzenetek és tesztnevek
- Dátum mindig `Europe/Budapest` (`src/core/dates.ts`)
- A kérés XML-t saját, sorrendtartó serializer építi (az XSD elemsorrend kötött)
- Üzleti hibára soha nincs automatikus retry (a docs max. 5 próbálkozást enged, a túllépés kitiltáshoz vezet)
- Nulla runtime függőség (saját XML író és olvasó)
- Teszt minden új modulhoz, a coverage küszöb 80%

## Parancsok
- `npm test`, `npm run ci` (lint + typecheck + coverage + build + publint/attw)

## Publikálás
A `package.json`-ban `"private": true` van, amíg a csomagnév nincs eldöntve. npm publish, GitHub repo létrehozás és push csak a tulajdonos kifejezett kérésére történhet.
