# AGENTS.md

This file guides AI agents that work **on this repository**. If you only *use* the `kassza` package, read [agents/README.md](./agents/README.md) instead.

## What this is

`kassza` is an unofficial, zero-dependency TypeScript client for the Számlázz.hu Számla Agent API. The official docs are at https://docs.szamlazz.hu/hu/agent/. A local copy lives in `.research/docs-agent/`; it is gitignored and never committed, for copyright reasons.

## Commands

```bash
npm test
npm run xsd:fetch
npm run readme
npm run e2e
npm run ci
```

- `npm test` runs Vitest.
- `npm run xsd:fetch` downloads the official XSDs into `.xsd-cache/`. The contract tests need these and `xmllint`.
- `npm run readme` regenerates the README images in `readme/assets/` and then `README.md` (see [README](#readme)).
- `npm run e2e` runs every Számla Agent operation (all but `connectPrincipal`) against the real Számlázz.hu **test account**. It needs `SZAMLAZZ_TEST_AGENT_KEY` (see `.env.example`), and it is not part of `npm run ci`. See [E2E](#e2e).
- `npm run ci` runs lint, typecheck, the README sync check, coverage (at least 80%), build, publint and attw.

## Layout

| Path | Contents |
|---|---|
| `src/core/` | Transport (`context.ts`), response parsing, errors and the error-code table, XML writer and parser, Budapest dates, session cookies |
| `src/money/` | Official rounding rules for invoices and receipts |
| `src/invoices/` | create (resolve → xml → response), reverse, payment, pdf, get, proforma |
| `src/receipts/` | create, reverse, get, send |
| `src/taxpayer/` | NAV taxpayer lookup |
| `src/client.ts` | `createKassza()`, which wires every operation to one context |
| `src/payments/` | Payment webhooks (Stripe, SimplePay, Barion, Revolut, PayPal) and `issueForPayment` |
| `src/delegation/` | Delegated invoicing: `connectPrincipal`, `probeDelegation`, `createKasszaPool` |
| `src/nav/` | NAV receipt data reporting (`receipt-if`): client, request XML, response parsing, reconciliation |
| `src/data-link/` | Számlázz.hu data link (adatkapcsolat) PUSH handler and responses |
| `src/reports/` | Daily close and the NAV daily receipt summary |
| `src/testing/` | `createMockKassza` (API-level mock) and `createFakeAgentFetch` (a fake Számla Agent `fetch` that processes the real request XML, numbers documents and injects faults) |
| `src/mcp/` | Runtime-neutral MCP server (2026-07-28 stateless and legacy `initialize`), tools with preview confirmation |
| `src/cli/` | The `kassza` command (`doctor`, `verify`, `xml preview`, `invoice get`, `receipt get`, `nav summary`, `mcp`); `bin.ts` is the Node entry |
| `src/validators/`, `src/ipn/`, `src/storage/`, `src/cookie-stores/` | Subpath modules (see `package.json#exports` and `tsdown.config.ts`) |
| `tests/helpers.ts` | `createTestContext` and `mockAgent`, a fake `fetch` that captures multipart requests |
| `tests/fake-agent.ts`, `tests/mcp.ts` | Helpers for tests that run the real client against `createFakeAgentFetch`, and for MCP tests |
| `tests/xsd.ts` | `validateAgainstXsd` via `xmllint` |
| `tests/e2e/` | The live end-to-end scenario: `suite.ts` (the scenario), `guard.ts` (test-account guard and shared inputs), `live.test.ts` (real API, only via `npm run e2e`), `fake.test.ts` (the same scenario against `createFakeAgentFetch`, runs in `npm test`) |
| `agents/` | Docs shipped in the npm package for AI agents of package users |
| `readme/` | README source: `template.md`, `config.json`, the `build.mjs` renderer, the `art/` SVG generator and the generated `assets/` |

## Conventions

- **No comments in code**: no `//`, no `/* */`, no JSDoc.
- English identifiers, Hungarian error messages, Hungarian test names.
- TypeScript is strict, with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and `isolatedDeclarations`, so exported functions need explicit return types.
- Biome: single quotes, no semicolons, 100-column lines.
- Zero runtime dependencies. Keep `src/` runtime-neutral: no `Buffer`, and no `node:` imports except in `src/storage/fs.ts` and `src/cli/bin.ts`. Keep CLI logic in `src/cli/run.ts` and its commands behind the `CliIo` interface, so tests run it in memory.
- The MCP write tools (`create_*`, `reverse_*`) only run with `allowWrite` (`KASSZA_MCP_ALLOW_WRITE=1`) and a confirmation code from the matching preview tool. Never weaken either guard.
- XML request elements must follow XSD order. Build requests with `buildXmlDocument`, `el` and `optionalEl`, and add an XSD contract test for every request.
- Dates are always `Europe/Budapest` (`toAgentDate`, `todayInBudapest`).
- Never add automatic retries for business errors, and never mark a create operation `safeToRetry` unless it has an idempotency key.
- Every module has colocated `*.test.ts` files. Tests never call the real Számlázz.hu API, with one exception: `tests/e2e/live.test.ts`, which `vitest.config.ts` excludes and only `npm run e2e` runs.
- When a public API changes, update `readme/template.md` (then run `npm run readme`), `agents/api.md` and `agents/recipes.md` in the same change.

## E2E

`npm run e2e` is the only thing that proves the client still matches what Számlázz.hu really answers. The fake agent cannot show that, because it is built from the same docs as the client.

- It needs the **test account** Agent key in `SZAMLAZZ_TEST_AGENT_KEY` (lowercase). Also: `SZAMLAZZ_E2E_EMAIL` (recipient of the receipt e-mail test, needed for full coverage), `SZAMLAZZ_E2E_RECEIPT_PREFIX` (a receipt block that exists in the account, default `NYGTA`), `SZAMLAZZ_E2E_TAXPAYER` (default `13421739`) and `SZAMLAZZ_E2E_DELAY_MS` (default 1500). `scripts/e2e.mjs` loads `.env` and fails loudly when the key is missing, so a skipped run never looks green.
- The scenario in `tests/e2e/suite.ts` creates and fetches an invoice (by number, order number and external ID), downloads its PDF, adds, replaces and clears payments, runs `createOnce` twice, reverses the invoice, creates and deletes a proforma, creates, fetches, e-mails and reverses a receipt, and queries a taxpayer. A last test fails when any of the 11 operations never ran.
- The first step creates a proforma and checks that the account reports it as a test document (`header.test`). If it does not, it deletes the proforma and stops everything. Never weaken this guard (`tests/e2e/guard.ts`).
- Each group of steps stops at its first failure. An `auth`, `attempt_limit`, `rate_limit` or `maintenance` error stops the whole run. Never add retries or loops here: the docs allow at most 5 attempts for a failing request, and going over leads to a ban.
- It is gentle on purpose: one run is about 30 requests, spaced at least 1.5 seconds apart (`tests/e2e/throttle.ts`, `SZAMLAZZ_E2E_DELAY_MS`), over one reused session. The one request that is meant to fail uses an ID that is unique per run, so the same failing request never repeats. Keep it that way when you extend the scenario, and prefer reusing a result over another request.
- `tests/e2e/fake.test.ts` runs the same scenario against `createFakeAgentFetch` in `npm test`, so the scenario itself does not rot. When you change the scenario, run `npm test` too.
- `.github/workflows/e2e.yml` is a reusable workflow. `release.yml` runs it as the `e2e` job before every release (`release` has `needs: e2e`), so nothing is published without a green e2e. It also runs weekly and by hand. A Számlázz.hu outage blocks a release until the workflow is re-run.
- The key lives only in the GitHub **environment** `e2e` (Settings → Environments), restricted to the `main` branch: secret `SZAMLAZZ_TEST_AGENT_KEY`, secret `SZAMLAZZ_E2E_EMAIL`, optional variables `SZAMLAZZ_E2E_RECEIPT_PREFIX` and `SZAMLAZZ_E2E_TAXPAYER`. Pull requests and forks never get it, and `ci.yml` does not use it. Never print the key or request XML in test output, because Actions logs of a public repository are public.

## README

`README.md` is generated. Never edit it by hand: edit `readme/template.md` and run `npm run readme`. CI fails when `README.md` is out of sync (`npm run readme:check`).

- `readme/config.json` holds the variables: the website URL (`web`, also synced into `package.json#homepage`), the GitHub repo and branch for image URLs, the official docs URL and the badge color.
- Placeholders: `{{web}}`, `{{docs}}`, `{{sandbox}}`, `{{recipes}}`, `{{npm}}`, `{{host}}`, `{{pages}}`, `{{examples}}`, `{{recipeCount}}` and others in `readme/build.mjs`.
- Helpers: `{{docs:path}}` and `{{doc:path}}` (URL or titled link to a docs page), `{{sandbox:slug}}` and `{{example:slug}}` (sandbox deep link), `{{recipe:slug}}`, `{{picture:name|alt|width}}` (light and dark image), `{{links:docsPath|sandboxSlug|recipeSlug}}` (section buttons), `{{more:docsPath|sandboxSlug}}` (links under an example), `{{badges}}`, `{{nav}}`, `{{recipe-list}}`, `{{example-list}}`.
- Every docs path is checked against `web/content/docs`, every sandbox slug against `web/sandbox/examples/catalog.ts`, so a broken link fails the build.
- The images are generated by `readme/art/` with the website's fonts turned into paths, so they look identical everywhere. The fonts are downloaded from Google Fonts once and cached in `node_modules/.cache`. The sandbox showcase uses the XML that the built package really sends, so run `npm run build` first on a fresh clone.

## Releasing

```bash
bun run ci
bun run release:dry
bun run release
bun run release minor
```

- `bun run ci` runs every check and builds.
- `bun run release:dry` shows the next version and the changelog entry, without changing anything.
- `bun run release` releases the version picked from the commits. Add `patch`, `minor` or `major` to force a bump.

`scripts/release.mjs` performs a release in this order:

1. Checks that the working tree is clean and on `main`, and that you are logged in to npm.
2. Picks the next version from the releasable Conventional Commits since the last `v*` tag: `feat`, `fix`, `perf` and breaking ones, ignoring commits that only touch `web/`. `feat` bumps minor, `fix` and `perf` bump patch, and `!` or `BREAKING CHANGE` bumps major (minor while on 0.x). Other types (`docs`, `test`, `refactor`, `chore`, `ci` and non-conventional messages) never release and never reach the changelog.
3. Runs `npm run ci`.
4. Writes `package.json` and prepends the entry to `CHANGELOG.md`.
5. Runs `npm publish`, which asks for the 2FA code. If publishing fails, it rolls back both files.
6. Waits until `npm view` shows the new version (up to 10 minutes, then continues anyway), so the Vercel build that the push triggers finds the package. Then writes the released version to `web/kassza-version.json`, commits `release: vX.Y.Z` with it, tags `vX.Y.Z` and pushes. If the push fails, the script exits non-zero after publishing, so the workflow turns red.

The website never lists `kassza` in its own `package.json` or lockfiles. `web/scripts/install-kassza.mjs` reads `web/kassza-version.json` and unpacks exactly that version from npm into `web/node_modules/kassza` before `dev`, `build`, `typecheck` and `test` (the `pre*` scripts). While the registry catches up it retries every 15 seconds for up to 20 minutes (`KASSZA_INSTALL_DELAY_MS` and `KASSZA_INSTALL_MAX_WAIT_MS` override this) and then fails with the real npm error. It unpacks inside `node_modules`, so the final rename never crosses a filesystem boundary. `web/lib/site.ts` shows the same version. `tests/web-version.test.ts` checks that the file matches the root `package.json`.

On GitHub, `.github/workflows/release.yml` runs `release:ci` for every push to `main` and exits early when there is no releasable commit. A maintainer can also start it by hand from the Actions tab (`workflow_dispatch`) with `patch`, `minor` or `major` to force a release.

Write commit messages as Conventional Commits (`feat: ...`, `fix: ...`) so the changelog groups them.

Locally, releases and pushes happen only when the owner explicitly asks for them.
