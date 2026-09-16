# kassza

Nyílt forráskódú, nem hivatalos Számlázz.hu Számla Agent kliens (TypeScript, npm csomag). A teljes terv, a fázisok és a döntések a `PLAN.md`-ben vannak: munka előtt olvasd el.

## Források
- Hivatalos docs: https://docs.szamlazz.hu/hu/agent/
- A docs lokális másolata: `.research/docs-agent/*.md` (gitignored, szerzői jog miatt nem commitoljuk)
- Élesben kipróbált előd: `../racehub.hu/src/lib/szamlazz-api.ts`

## Konvenciók
- Angol azonosítók, magyar JSDoc és hibaüzenetek
- Dátum mindig `Europe/Budapest` (`src/core/dates.ts`)
- A kérés XML-t saját, sorrendtartó serializer építi (az XSD elemsorrend kötött)
- Üzleti hibára soha nincs automatikus retry (a docs max. 5 próbálkozást enged, a túllépés kitiltáshoz vezet)
- Runtime függőség csak indokolt esetben (tervezett: `fast-xml-parser`)
- Teszt minden új modulhoz, a coverage küszöb 80%

## Parancsok
- `npm test`, `npm run ci` (lint + typecheck + coverage + build + publint/attw)

## Publikálás
A `package.json`-ban `"private": true` van, amíg a csomagnév nincs eldöntve. npm publish, GitHub repo létrehozás és push csak a tulajdonos kifejezett kérésére történhet.
