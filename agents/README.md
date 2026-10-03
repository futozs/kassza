# kassza for AI coding agents

`kassza` is a zero-dependency TypeScript client for the Számlázz.hu Számla Agent API, the most widely used Hungarian invoicing service. It covers all 11 Agent operations:

- Invoices: create (invoice, proforma, advance, final, corrective, delivery note), preview, reverse, register payment, PDF, full invoice data, delete proforma.
- Receipts (nyugta): create, reverse, get, send by email.
- Taxpayer lookup from the NAV database.

It also links delegated (principal) accounts through the Agent (`connectPrincipal` in `kassza/delegation`), and ships these modules:

- `kassza/payments`: Stripe, SimplePay, Barion, Revolut and PayPal webhooks that issue a receipt or invoice exactly once, and reverse it on refund.
- `kassza/reports` and `kassza/nav`: the NAV daily receipt report (mandatory since 2026-09-01), reconciliation with NAV, and a NAV receipt interface client.
- `kassza/delegation`: invoicing on behalf of many companies, each in its own Számlázz.hu account.
- `kassza/data-link`: a receiver for the Számlázz.hu financial data link (pushed invoices, bank transactions and receipts).
- `kassza/testing`: a mock client and a fake Számla Agent `fetch` for integration tests.
- `kassza/mcp` and the `kassza` CLI (`npx kassza doctor`, `npx kassza mcp`).

It runs on Node 22+, Bun, Deno, Cloudflare Workers and Vercel Edge.

## Read in this order

1. [pitfalls.md](./pitfalls.md): hard rules. Follow them or you will create duplicate or invalid tax documents.
2. [api.md](./api.md): every method, input and output.
3. [recipes.md](./recipes.md): webhooks, exactly-once invoicing, receipts, IPN, PDF storage, serverless, tests, payment providers, NAV reports, delegated invoicing, data link.

A ready-made Claude Code skill is in [skills/kassza/SKILL.md](./skills/kassza/SKILL.md). Copy the `skills/kassza` folder into `.claude/skills/` in the user's project.

## The five things to get right

1. Create the client once, on the server only: `createKassza()`. It reads `SZAMLAZZ_AGENT_KEY`.
2. Always set `orderNumber` on invoices and receipts (and `callId` on receipts), derived from the order ID.
3. Give prices as `netUnitPrice` or `grossUnitPrice` plus `vat`, and never compute net, VAT or gross yourself.
4. Never retry `create` in a loop. Prefer `invoices.createOnce()` and `receipts.createOnce()`: they look the document up, create it, and look it up again after an uncertain failure. With plain `create`, after a `network`, `timeout`, `partial_success` or `duplicate` error, call `invoices.find({ orderNumber })`.
5. In tests, use `createMockKassza()` or `createFakeAgentFetch()` from `kassza/testing` instead of the real API.

## Minimal example

```ts
import { createKassza } from 'kassza'

const kassza = createKassza()

const { number, created } = await kassza.invoices.createOnce({
  orderNumber: 'ORDER-1001',
  buyer: { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.', email: 'vevo@example.hu' },
  items: [{ name: 'Termék', quantity: 2, grossUnitPrice: 12_700, vat: 27 }],
})
```

`created` is `false` when an earlier call (a redelivered webhook, a retried job) already issued the invoice.

## Vocabulary

| Hungarian | kassza |
|---|---|
| számla | invoice |
| díjbekérő | proforma |
| előlegszámla / végszámla | advance / final |
| helyesbítő számla | corrective |
| szállítólevél | deliveryNote |
| sztornó | reverse / reversal |
| nyugta | receipt |
| befizetés, jóváírás | payment |
| rendelésszám | orderNumber |
| hívásazonosító | callId |
| számlaszám előtag | prefix |
| adószám / közösségi adószám | taxNumber / euTaxNumber |
| áfakulcs | vat |
| nettó / bruttó egységár | netUnitPrice / grossUnitPrice |
| Agent kulcs | agentKey |
| megbízó / megbízott | principal / delegate |
| pénztárgép-köteles | cashRegisterRequired |
| napi összesítő (NAV) | navDailyReports |
| pénzügyi adatkapcsolat | data link |
