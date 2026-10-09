# kassza (English overview)

kassza is an unofficial, zero-dependency TypeScript client for the [Számlázz.hu](https://www.szamlazz.hu) Számla Agent API, the most widely used Hungarian invoicing service. The full documentation is in Hungarian at [kasszajs.hu](https://kasszajs.hu), because the domain (Hungarian VAT, NAV reporting, receipt rules) is Hungarian. This page is a short entry point for developers who do not read Hungarian.

```bash
npm install kassza
```

```ts
import { createKassza } from 'kassza'

const kassza = createKassza() // reads SZAMLAZZ_AGENT_KEY

const { number, created } = await kassza.invoices.createOnce({
  orderNumber: 'WEB-1042',
  paid: true,
  buyer: { name: 'Buyer Ltd.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' },
  items: [{ name: 'Subscription', grossUnitPrice: 12_700, vat: 27 }],
})
```

## What it does

- Invoices, proformas, advance, final and corrective invoices, delivery notes, reversals, payments, PDFs, invoice data, taxpayer lookup.
- Receipts (nyugta): create, reverse, query, email, and convert to an invoice later.
- Exactly-once issuing: `createOnce` looks the document up before creating it and after uncertain failures; concurrent calls are merged, and a shared lock (`createOnceLock`) prevents duplicates across serverless instances.
- Payment providers: Stripe, SimplePay, Barion, Revolut and PayPal webhooks that issue a receipt or invoice exactly once, reverse it on a full refund, and issue corrective invoices on partial refunds.
- NAV (Hungarian tax authority) daily receipt reports, reconciliation, and a document journal to build them from.
- Bulk and recurring invoicing with rate limiting, a fake Számla Agent for tests, Express/NestJS adapter, observability (logs, tracing, Prometheus metrics), a CLI (`npx kassza doctor`) and an MCP server.
- Runs on Node.js, Bun, Deno, Cloudflare Workers and edge runtimes; CI tests all four on the built package.
- Sends no telemetry.

## Rules that matter

1. Never retry creating an invoice in a loop: Számlázz.hu bans accounts that do. kassza retries only safe lookups.
2. Always set an `orderNumber`, and prefer `createOnce`.
3. Give prices as `netUnitPrice` or `grossUnitPrice` with a VAT rate; kassza applies the official rounding rules.
4. Errors are `SzamlazzError` with a `category` (`validation`, `duplicate`, `network`, …) and a `docsUrl` to a page about the error code.

## For AI coding agents

English docs for agents ship inside the package: [agents/README.md](agents/README.md), [pitfalls](agents/pitfalls.md), [API reference](agents/api.md), [recipes](agents/recipes.md), and [llms.txt](llms.txt).

## Status

kassza is in beta (0.x). The API may still change between minor versions; see the [changelog](CHANGELOG.md) (in Hungarian). It is not affiliated with Számlázz.hu.

License: MIT.
