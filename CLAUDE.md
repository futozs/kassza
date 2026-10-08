# kassza

Nyílt forráskódú, nem hivatalos Számlázz.hu Számla Agent kliens (TypeScript, npm csomag). Az architektúra, a konvenciók és a release folyamat az `AGENTS.md`-ben van: munka előtt olvasd el.

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
- A tesztek nem hívják az éles API-t, kivéve a `tests/e2e/live.test.ts`-t (csak `npm run e2e`)

## Parancsok
- `npm test`, `npm run ci` (lint + typecheck + README check + coverage + build + publint/attw)
- `npm run e2e`: az összes Számla Agent művelet élőben a Számlázz.hu tesztfiókon (`SZAMLAZZ_TEST_AGENT_KEY` kell, nem része a `ci`-nek). Kulcsot soha ne kérj el és ne commitolj. Részletek: `AGENTS.md`, E2E rész.
- `npm run readme`: a `README.md` generált fájl, kézzel ne szerkeszd. A forrás a `readme/template.md`, a változók (például a weboldal URL-je) a `readme/config.json`-ban vannak. Részletek: `AGENTS.md`.

## Publikálás
A csomag publikus az npm-en (`kassza`), a kiadást a GitHub Actions végzi a `main`-re érkező `feat`, `fix`, `perf` és törő commitokból (`.github/workflows/release.yml`, `scripts/release.mjs`). Helyi npm publish, commit és push csak a tulajdonos kifejezett kérésére történhet.
