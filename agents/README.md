# kassza for AI coding agents

`kassza` is a zero-dependency TypeScript client for the Számlázz.hu Számla Agent API, the most widely used Hungarian invoicing service. It covers all 11 Agent operations:

- Invoices: create (invoice, proforma, advance, final, corrective, delivery note), preview, reverse, register payment, PDF, full invoice data, delete proforma.
- Receipts (nyugta): create, reverse, get, send by email.
- Taxpayer lookup from the NAV database.

It runs on Node 22+, Bun, Deno, Cloudflare Workers and Vercel Edge.

## Read in this order

1. [pitfalls.md](./pitfalls.md): hard rules. Follow them or you will create duplicate or invalid tax documents.
2. [api.md](./api.md): every method, input and output.
3. [recipes.md](./recipes.md): webhooks, idempotent invoicing, receipts, IPN, PDF storage, serverless, tests.

A ready-made Claude Code skill is in [skills/kassza/SKILL.md](./skills/kassza/SKILL.md). Copy the `skills/kassza` folder into `.claude/skills/` in the user's project.

## The five things to get right

1. Create the client once, on the server only: `createKassza()`. It reads `SZAMLAZZ_AGENT_KEY`.
2. Always set `orderNumber` on invoices and `callId` on receipts, derived from the order ID.
3. Give prices as `netUnitPrice` or `grossUnitPrice` plus `vat`, and never compute net, VAT or gross yourself.
4. Never retry `create` in a loop. After a `network`, `timeout`, `partial_success` or `duplicate` error, call `invoices.find({ orderNumber })`.
5. In tests, use `createMockKassza()` from `kassza/testing` instead of the real API.

## Minimal example

```ts
import { createKassza } from 'kassza'

const kassza = createKassza()

const invoice = await kassza.invoices.create({
  orderNumber: 'ORDER-1001',
  buyer: { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.', email: 'vevo@example.hu' },
  items: [{ name: 'Termék', quantity: 2, grossUnitPrice: 12_700, vat: 27 }],
})
```

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
