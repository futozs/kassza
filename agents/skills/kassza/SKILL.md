---
name: kassza
description: Issue Hungarian invoices, proformas and receipts through Számlázz.hu with the kassza npm package. Use when code creates, reverses, queries or emails számla, díjbekérő or nyugta documents, handles Számlázz.hu IPN webhooks, looks up Hungarian tax numbers, or mentions szamlazz.hu, Számla Agent or SZAMLAZZ_AGENT_KEY.
---

# kassza: Számlázz.hu integration

Before writing code, read the package docs from `node_modules/kassza/agents/`:

- `pitfalls.md`: hard rules, always read it.
- `api.md`: exact method signatures.
- `recipes.md`: patterns for webhooks, receipts, IPN, PDF storage, serverless and tests.

## Non-negotiable rules

1. Create one server-side client with `createKassza()`. The key comes from `SZAMLAZZ_AGENT_KEY`. Never import kassza in client-side code.
2. Set `orderNumber` on every invoice and `callId` on every receipt, derived from the order ID.
3. Give prices as `netUnitPrice` (B2B) or `grossUnitPrice` (B2C) together with `vat`. Do not compute item amounts, and do not pass UTC date strings.
4. Never retry `invoices.create` or `receipts.create` yourself. On an error with category `network`, `timeout`, `partial_success` or `duplicate`, call `kassza.invoices.find({ orderNumber })` before doing anything else.
5. Branch on `SzamlazzError.category` and `code`, not on message text.
6. Tests must use `createMockKassza()` from `kassza/testing`, never a real Agent key.

## Checklist before finishing

- [ ] The webhook or job that issues documents is idempotent: it runs `find` first, or catches `duplicate`.
- [ ] The PDF is stored (`kassza/storage`) or re-fetched with `invoices.getPdf`, not stored as base64 in the database.
- [ ] The IPN route returns HTTP 200 (`ipnOkResponse()`) and processes notifications idempotently.
- [ ] In serverless or edge environments, a shared `cookieStore` from `kassza/cookie-stores` is configured.
- [ ] There is a unit test with `createMockKassza()`.
