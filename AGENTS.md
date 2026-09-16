# AGENTS.md

This file guides AI agents that work **on this repository**. If you only *use* the `kassza` package, read [agents/README.md](./agents/README.md) instead.

## What this is

`kassza` is an unofficial, zero-dependency TypeScript client for the Számlázz.hu Számla Agent API. The official docs are at https://docs.szamlazz.hu/hu/agent/. A local copy lives in `.research/docs-agent/`; it is gitignored and never committed, for copyright reasons.

## Commands

```bash
npm test
npm run xsd:fetch
npm run ci
```

- `npm test` runs Vitest.
- `npm run xsd:fetch` downloads the official XSDs into `.xsd-cache/`. The contract tests need these and `xmllint`.
- `npm run ci` runs lint, typecheck, coverage (at least 80%), build, publint and attw.

## Layout

| Path | Contents |
|---|---|
| `src/core/` | Transport (`context.ts`), response parsing, errors and the error-code table, XML writer and parser, Budapest dates, session cookies |
| `src/money/` | Official rounding rules for invoices and receipts |
| `src/invoices/` | create (resolve → xml → response), reverse, payment, pdf, get, proforma |
| `src/receipts/` | create, reverse, get, send |
| `src/taxpayer/` | NAV taxpayer lookup |
| `src/client.ts` | `createKassza()`, which wires every operation to one context |
| `src/validators/`, `src/ipn/`, `src/storage/`, `src/cookie-stores/`, `src/testing/` | Subpath modules (see `package.json#exports` and `tsdown.config.ts`) |
| `tests/helpers.ts` | `createTestContext` and `mockAgent`, a fake `fetch` that captures multipart requests |
| `tests/xsd.ts` | `validateAgainstXsd` via `xmllint` |
| `agents/` | Docs shipped in the npm package for AI agents of package users |

## Conventions

- **No comments in code**: no `//`, no `/* */`, no JSDoc.
- English identifiers, Hungarian error messages, Hungarian test names.
- TypeScript is strict, with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and `isolatedDeclarations`, so exported functions need explicit return types.
- Biome: single quotes, no semicolons, 100-column lines.
- Zero runtime dependencies. Keep `src/` runtime-neutral: no `Buffer`, and no `node:` imports except in `src/storage/fs.ts`.
- XML request elements must follow XSD order. Build requests with `buildXmlDocument`, `el` and `optionalEl`, and add an XSD contract test for every request.
- Dates are always `Europe/Budapest` (`toAgentDate`, `todayInBudapest`).
- Never add automatic retries for business errors, and never mark a create operation `safeToRetry` unless it has an idempotency key.
- Every module has colocated `*.test.ts` files. Never call the real Számlázz.hu API in tests.
- When a public API changes, update `README.md`, `agents/api.md` and `agents/recipes.md` in the same change.

## Publishing

Publishing to npm, creating the GitHub repo and pushing happen only when the owner explicitly asks for them.
