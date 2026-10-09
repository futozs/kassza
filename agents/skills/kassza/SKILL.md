---
name: kassza
description: Issue Hungarian invoices, proformas and receipts through Számlázz.hu with the kassza npm package. Use when code creates, reverses, queries or emails számla, díjbekérő or nyugta documents, turns Stripe, SimplePay, Barion, Revolut or PayPal payments into documents, handles Számlázz.hu IPN or data link webhooks, builds NAV daily receipt reports, invoices on behalf of other companies (megbízott számlázás), looks up Hungarian tax numbers, or mentions szamlazz.hu, Számla Agent or SZAMLAZZ_AGENT_KEY.
---

# kassza: Számlázz.hu integration

Before writing code, read the package docs from `node_modules/kassza/agents/`:

- `pitfalls.md`: hard rules, always read it.
- `api.md`: exact method signatures.
- `recipes.md`: patterns for webhooks, payment providers, receipts, IPN, NAV reports, delegated invoicing, PDF storage, serverless and tests.

## Non-negotiable rules

1. Create one server-side client with `createKassza()`. The key comes from `SZAMLAZZ_AGENT_KEY`. Never import kassza in client-side code.
2. Set `orderNumber` on every invoice and receipt (and `callId` on receipts), derived from the order ID.
3. Give prices as `netUnitPrice` (B2B) or `grossUnitPrice` (B2C) together with `vat`. Do not compute item amounts, and do not pass UTC date strings.
4. Never retry `invoices.create` or `receipts.create` yourself. Prefer `invoices.createOnce()` and `receipts.createOnce()`. With plain `create`, on an error with category `network`, `timeout`, `partial_success` or `duplicate`, call `kassza.invoices.find({ orderNumber })` before doing anything else.
5. Branch on `SzamlazzError.category` and `code`, not on message text.
6. Tests must use `createMockKassza()` or `createFakeAgentFetch()` from `kassza/testing`, never a real Agent key.
7. Issue Agent receipts only for activities without the online cash register obligation, and only when all four receipt conditions hold (`chooseDocument()` checks them). A fixed shop, café or restaurant needs an online cash register instead.
8. Never submit NAV receipt reports for receipts issued in Számlázz.hu; it reports them itself. Use `kassza/nav` read-only unless the user explicitly reports a paper receipt pad.
9. In serverless or multi-instance deployments, pass a shared `createOnceLock` store from `kassza/stores` (Redis, Upstash or Durable Object; not Cloudflare KV), so two instances cannot issue the same order twice.
10. When `onDocument` writes a journal used for NAV reports (`kassza/journal`), set `onDocumentError: 'throw'` so a missed write is never silent.
11. Under Express or NestJS, wrap webhook handlers with `toNodeHandler` from `kassza/node` and mount them before `express.json()`.

## Checklist before finishing

- [ ] The webhook or job that issues documents is idempotent: it uses `createOnce`, runs `find` first, or catches `duplicate`.
- [ ] Payment provider webhooks use the `kassza/payments` handlers with `issueForPayment`, and non-retryable errors are handed to a human instead of being rethrown forever.
- [ ] The PDF is stored (`kassza/storage`) or re-fetched with `invoices.getPdf`, not stored as base64 in the database.
- [ ] The IPN route returns HTTP 200 (`ipnOkResponse()`) and processes notifications idempotently.
- [ ] In serverless or edge environments, a shared `cookieStore` (and, with several processes, an `attemptLedger`) from `kassza/cookie-stores` is configured.
- [ ] There is a unit test with `createMockKassza()`, or an integration test with `createFakeAgentFetch()`.
