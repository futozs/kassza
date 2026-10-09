# Beállítások (a tulajdonosnak)

Egyszer kell megcsinálni. Kulcsot soha ne commitolj, és ne írj be kódba.

## 1. Az e2e kulcsa (GitHub Environment)

Repó → **Settings → Environments → New environment**. A neve pontosan ez legyen: `e2e`.

- **Deployment branches and tags:** *Selected branches* → `main`
- **Environment secrets → Add secret:**

| Név | Érték |
|---|---|
| `SZAMLAZZ_TEST_AGENT_KEY` | A Számlázz.hu **tesztfiók** Agent kulcsa, kisbetűvel |
| `SZAMLAZZ_E2E_EMAIL` | Egy saját e-mail cím. Ide megy a teszt nyugta. Enélkül az e2e piros lesz |

- **Environment variables** (nem kötelező):

| Név | Alapértelmezés |
|---|---|
| `SZAMLAZZ_E2E_RECEIPT_PREFIX` | `NYGTA`: a tesztfiókban létező nyugtatömb előtagja |
| `SZAMLAZZ_E2E_TAXPAYER` | `13421739`: egy létező adószám |

Próba: **Actions → Teljes ellenőrzés → Run workflow**.

## 2. Email, ha valami elbukik

github.com → profilkép → **Settings → Notifications → System → Actions**: legyen bekapcsolva az **Email**, és a **Only notify for failed workflows**.

## 3. Ami magától megy (nincs teendő)

| Mi | Mikor |
|---|---|
| Teljes ellenőrzés: CI, friss XSD-k, változásfigyelő, élő e2e | Minden hétfőn 05:17 UTC-kor és minden kiadás előtt |
| Változásfigyelő hibajegy (issue) | Hétfőnként, ha a Számlázz.hu vagy a NAV változtatott |
| Kiadás az npm-re | `feat:` / `fix:` / `perf:` commit a `main`-en, ha minden zöld |
| Lefedettség-jelvények (`badges` ág) | Minden `main` push után |
| OpenSSF Scorecard | Kedden és minden `main` push után |

## 4. Csak ha gond van

- **Az npm publish elbukik (OIDC hiba):** npmjs.com → `kassza` → **Settings → Trusted Publisher → GitHub Actions**. Repository: `futozs/kassza`, Workflow: `release.yml`.
- **A `badges` ágra nem tud pusholni:** Settings → Rules. Ha egy szabály minden ágon tiltja a force pusht, vedd ki alóla a `badges` ágat.
- **Elavult egy kiadás** (például a Számlázz.hu változása miatt), és a javítás már kint van:
  `npm deprecate kassza@"<0.14.1" "Elavult, frissíts: npm i kassza@latest"`

## 5. Helyben (a saját gépeden)

- `cp .env.example .env`, töltsd ki, majd `npm run e2e`. A `.env` nincs commitolva.
- Az `npm install` bekapcsolja a commit-üzenet ellenőrzőt. Az üzenet formája: `feat: …`, `fix: …`, `docs: …`, `ci: …`.
