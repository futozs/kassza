---
name: migrate-from-szamlazz-js
description: Migrate a codebase from the szamlazz.js npm package to kassza. Use when the user asks to replace, upgrade or migrate away from szamlazz.js, or when code imports Client, Invoice, Buyer, Seller or Item from 'szamlazz.js' and the user wants kassza instead.
---

# Migrate from szamlazz.js to kassza

Read `node_modules/kassza/agents/pitfalls.md` and `api.md` first.

## Find the usage

Search for `from 'szamlazz.js'`, `require('szamlazz.js')`, `new Client(`, `issueInvoice(`, `getInvoiceData(` and `reverseInvoice(`. List every call site to the user before editing.

## Mapping

| szamlazz.js | kassza |
|---|---|
| `new Client({ authToken })` | one shared `createKassza({ agentKey })` (or `SZAMLAZZ_AGENT_KEY`) |
| `requestInvoiceDownload`, `eInvoice`, `timeout` | `downloadPdf`, `eInvoice` (per invoice or in `defaults.invoice`), `timeoutMs` |
| `new Seller({ bank: { name, accountNumber }, email: { replyToAddress, subject, message } })` | `seller: { bank, bankAccount, emailReplyTo, emailSubject, emailText }` |
| `new Buyer({ ..., postAddress })` | plain object `buyer: { name, zip, city, address, taxNumber?, postal? }` |
| `new Item({ label, ... })` | `{ name, quantity, unit, vat, netUnitPrice | grossUnitPrice }` |
| `client.issueInvoice(new Invoice({...}))` | `kassza.invoices.createOnce({ orderNumber, ... })` |
| `prepaymentInvoice: true` | `type: 'advance'` |
| `adjustmentInvoiceNumber` | `type: 'corrective', correctedInvoiceNumber` |
| `PaymentMethods.*`, `Currencies.*`, `Languages.*` | plain strings: `'átutalás'`, `'HUF'`, `'hu'` |
| `getInvoiceData({ invoiceId | orderNumber, pdf })` | `invoices.get(number | { orderNumber }, { includePdf })` or `find(...)` |
| `reverseInvoice({ invoiceId, eInvoice, requestInvoiceDownload })` | `invoices.reverse({ invoiceNumber, eInvoice, downloadPdf })` |
| result `invoiceId`, string totals, `customerAccountUrl`, Buffer `pdf` | `number`, numeric totals, `buyerAccountUrl`, `Uint8Array` `pdf` |

## Rules while migrating

1. Every invoice gets an `orderNumber` from the user's order ID, and is issued with `createOnce`. Ask if no stable order ID exists.
2. Delete any custom retry loop around invoice creation. kassza never resends a create.
3. Keep `netUnitPrice` or `grossUnitPrice` as the user had it; never convert prices by hand.
4. Replace string totals parsing (`Number(result.grossTotal)`) with the numeric fields.
5. Replace error handling on message text with `isSzamlazzError(error)` and `error.category`.
6. Update tests to `createMockKassza()` or `createFakeAgentFetch()` from `kassza/testing`.
7. Remove `szamlazz.js` from `package.json` only after the user confirms every call site was migrated.
