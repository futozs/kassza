# Közreműködés

Örülünk minden hibajelentésnek és javításnak. A kassza nem hivatalos Számlázz.hu Számla Agent kliens, ezért a hivatalos [docs](https://docs.szamlazz.hu/hu/agent/) az irányadó.

## Előkészület

```bash
npm ci
npm run xsd:fetch
```

Az `xsd:fetch` letölti a hivatalos XSD-ket a `.xsd-cache/` mappába. A szerződéstesztekhez ez és az `xmllint` (`libxml2-utils`) kell.

## Ellenőrzések

```bash
npm test
npm run ci
```

Az `npm run ci` lefuttatja a lintet, a típusellenőrzést, a README-szinkront, a lefedettséget (legalább 80%), a buildet, a `publint`-et és az `attw`-t. Pull request csak zöld `npm run ci` mellett kerül be.

## Szabályok

- Kód közé nem kerül komment (se `//`, se JSDoc).
- Az azonosítók angolul, a hibaüzenetek és a tesztnevek magyarul vannak.
- Nulla futásidejű függőség. A `src/` futtatókörnyezet-független marad: nincs `Buffer`, és `node:` import csak az `src/storage/fs.ts`-ben lehet.
- Minden új modulhoz tartozik teszt. A tesztek soha nem hívják a valódi Számlázz.hu API-t.
- Üzleti hibára soha nincs automatikus újrapróbálás.
- Nyilvános API-változásnál frissítsd a `readme/template.md`-t (utána `npm run readme`), az `agents/api.md`-t és az `agents/recipes.md`-t. A `README.md` generált fájl, kézzel ne szerkeszd.

A részletes útmutató a [AGENTS.md](AGENTS.md)-ben van.

## Commit üzenetek

[Conventional Commits](https://www.conventionalcommits.org/) formátumot használunk:

| Típus | Hatás |
| --- | --- |
| `feat:` | Új funkció, minor verzió |
| `fix:` | Hibajavítás, patch verzió |
| `perf:` | Gyorsítás, patch verzió |
| `feat!:` vagy `BREAKING CHANGE:` | Törő változás |
| `docs:`, `test:`, `refactor:`, `chore:`, `ci:` | Nem ad ki új verziót |

A `main` ágra érkező `feat`, `fix`, `perf` vagy törő commit automatikusan új verziót ad ki az npm-en. A `web/` mappán kívüli változás nélküli commit nem indít kiadást.

## Biztonsági hiba

Ne nyiss nyilvános issue-t, kövesd a [SECURITY.md](SECURITY.md)-t.
