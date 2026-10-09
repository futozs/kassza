# kassza: rules and pitfalls

Read this before writing any code that issues invoices or receipts. These rules come from the official Számlázz.hu docs and from production incidents. Breaking them produces invalid tax documents, duplicate invoices, or a banned API key.

## Hard rules

1. **Never retry creating an invoice or receipt in a loop.** Számlázz.hu bans accounts that resend requests. kassza already retries only when it is safe to do so. Do not wrap `invoices.create` in your own retry loop.
2. **After an uncertain failure, look the document up before creating it again.** A timeout, a network error, or error `56` (`partial_success`) can mean the invoice was created anyway. Always set an `orderNumber`, and on those errors call `kassza.invoices.find({ orderNumber })` first. `invoices.createOnce()` and `receipts.createOnce()` do this for you.
3. **Do not compute item amounts yourself.** Pass `netUnitPrice` (B2B) or `grossUnitPrice` (B2C) plus `vat`, and kassza applies the official rounding rules. Hand-computed floats cause errors 259–264, and on receipts 261 and 363–365.
4. **Never use `new Date().toISOString().slice(0, 10)` for invoice dates.** Between midnight and 02:00 Budapest time it returns yesterday, which gives error 352. Leave dates out (kassza defaults to today in `Europe/Budapest`) or pass a `Date`.
5. **The Agent key is a secret and must be lowercase.** Read it from `SZAMLAZZ_AGENT_KEY` on the server only, and never ship it to a browser bundle. kassza rejects keys containing uppercase letters before sending anything.
6. **Use the test account while developing.** It allows at most 500 invoices per 10 minutes (error `167`, `rate_limit`). Never run tests against a production Agent key.
7. **An Agent receipt is a computer-generated receipt (számítógéppel előállított nyugta).** It is not an online cash register receipt and not an e-receipt (e-nyugta). Issue it only for activities without the online cash register (OPG) obligation. Fixed-location retail (TEÁOR 47.1–47.7), restaurants and bars (56.1, 56.3, except mobile catering), accommodation (55.1–55.3), rental (77.1–77.2, 77.33), repair (95.1–95.2) and pharmacies need an online cash register or e-cash register instead. Typical valid uses: webshops, online tickets, downloadable products, food trucks and other mobile sales, services without a cash register obligation.
8. **A receipt may replace an invoice only if all four conditions hold:** the buyer is not a taxable person or legal entity, the total is below 900 000 HUF, it is paid in full by fulfilment, and the buyer did not ask for an invoice. `chooseDocument()` applies these rules, and `issueForPayment()` uses it. If the buyer asks for an invoice later, use `receipts.convertToInvoice()`.
9. **In serverless or multi-process setups, give `createOnce` a shared lock.** Two concurrent deliveries of the same webhook on two instances can both see "no invoice yet". Pass `createOnceLock: store` (Redis, Upstash or Durable Object from `kassza/stores`; Cloudflare KV cannot lock). Calls inside one process are merged automatically.
10. **If your `onDocument` hook writes a legally relevant journal, set `onDocumentError: 'throw'`.** Otherwise a failed write is only a warning and the NAV daily summary silently misses a receipt. Use `kassza/journal` for this.
11. **Never submit NAV receipt reports for receipts issued in Számlázz.hu.** Számlázz.hu reports them itself after the NAV connection, so a second submission is double reporting. The `kassza/nav` client is read-only unless you pass `allowWrite: true`; submit only reports of paper receipt pads.

## Behaviour worth knowing

| Situation | What happens | What to do |
|---|---|---|
| Buyer has an `email` | `sendEmail` defaults to `true`, so Számlázz.hu emails the invoice | Set `buyer.sendEmail: false` to suppress it |
| Error `71` / `152` (`duplicate`) | The account forbids repeating an order number; the document probably exists already | `find({ orderNumber })` and reuse it |
| Error `56` (`partial_success`) | The invoice was created, but the notification email failed | Do **not** create it again |
| Error `7` | Lookup found nothing (or a required field is missing) | `find()` returns `null` for this |
| Error `202` | The invoice prefix is not registered in the account | Add it under Beállítások / Előtagok, or remove `prefix` |
| Error `136` | The subscription has expired or is unpaid | A human has to log in to szamlazz.hu |
| Error `54` | E-invoicing is not enabled in the account | Use `eInvoice: false` (the default) |
| Receipt prefix | Uppercase letters and digits only, and it must not be a prefix already used on invoices (336, 337) | Use a dedicated prefix such as `NYGT` |
| Receipt `callId` | Idempotency key; resending the same `callId` returns error 338 instead of a duplicate | Always set it from your order ID |
| Final invoice (`type: 'final'`) | Needs `advanceInvoiceNumber` or the same `orderNumber` as the advance invoice | Only one final invoice per advance invoice |
| `invoices.get` / XML query | Works only for outgoing invoices issued in Számlázz.hu | Use `getPdf` for the PDF only |
| Reversing a proforma or delivery note | Számlázz.hu returns the original document and reverses nothing; kassza throws a `validation` error | Use `invoices.deleteProforma` instead |
| `registerPayment` | `additive` defaults to `true` and appends to earlier payments | Use `clearPayments` to wipe them |
| Session cookie | Expires after 90 minutes of inactivity; the in-memory store is per process | In serverless, pass a shared `cookieStore` from `kassza/cookie-stores` |
| IPN webhook | Retried every 3 minutes, at most 10 times; only the latest one per invoice is sent | Respond with HTTP 200 quickly and process idempotently |
| IPN source check | `isSzamlazzIp` checks the rightmost `x-forwarded-for` entry, the address your nearest proxy saw; the left side is client-controlled | Behind several proxies pass `{ trustedProxies: n }`; never feed it a header that no proxy of yours writes |
| `buyer.groupTaxNumber`, item `dataDeletionCode` | Documented on docs.szamlazz.hu, but missing from the downloadable `xmlszamla.xsd` (and `torloKod` from `xmlnyugtacreate.xsd`) | Use them only when needed; if you get error 57, remove them |
| NAV receipt data reporting | Mandatory since 2026-09-01, with a grace period until 2026-12-31; Számlázz.hu reports the receipts issued there after the NAV connection | Check with `navDailyReports()` and `reconcileNavReports()`; report only paper receipts yourself |
| Receipts and the NAV Online data connection | Számlázz.hu issues receipts only from accounts where the NAV Online data connection is set up | Set it up in Számlázz.hu before the first receipt |
| Error `524` | The receipt prefix is not enabled in the account | Enable it under Beállítások / Előtagok |
| Error `491` | KATA protection blocks documents to businesses | Leave out the buyer's tax number, or a human disables the protection |
| Error `250` | A delegated account has not been taken over by its owner, or the delegation is not accepted | Wait for the principal; check with `probeDelegation()` rarely, never in a loop |
| Error `167` (`rate_limit`) | Too many documents in the test account in a short time | Wait a few minutes; never retry automatically |
| `attempt_limit` error | The same request already failed 5 times (counted across processes with `attemptLedger`) | A human fixes the cause, then `kassza.resetAttempts(error)` |
| `attemptLedger` limits | The ledger is conservative: network and timeout failures count too, and the check (read) and the count (increment) are separate store calls, so many processes sending the *same* request at the very same moment can each pass the check | Pair it with `createOnceLock` for documents, so only one process sends at a time |
| `maintenanceCooldownMs` | After error `1`, kassza sends nothing for the cooldown and throws `maintenance` at once | Switch to a fallback, for example a paper receipt pad |
| `in_progress` error | Another process holds the `createOnce` lock for this order | Do not issue by hand; call `createOnce` again later (5xx in a webhook) |
| `store_unavailable` error | The lock store (or a `fail-closed` attempt ledger) is down; nothing was sent | Restore the store, or choose `lockFailure: 'proceed'` / `attemptLedgerMode: 'fail-open'` deliberately |
| Partial refund on a mixed-VAT invoice | `issueForPayment` returns `refund-proposal`, issues nothing | Pass `refundItems` (what was returned) or `partialRefund: 'proportional'` |
| `registerPayment` twice | Two payments on the invoice (`additive` defaults to `true`) | Use `registerPaymentOnce({ key })` with a stable bank or payment ID |
| `szamlaLetoltesPld` (PDF copies) | Obsolete in the XSD; Számlázz.hu ignores it, so kassza does not offer it | Nothing to do |
| `express.json()` before a webhook route | The raw body is gone, signatures cannot be verified | Mount the route before `express.json()`, or use `express.raw()`; see `kassza/node` |

## Error categories

`SzamlazzError.category` is one of:

| Category | Meaning | Retry? |
|---|---|---|
| `auth` | Wrong key, or a browser session is interfering | No, fix the credentials |
| `account` | Subscription, e-invoice, or data-deletion-code settings | No, a human must act |
| `validation` | The request is wrong (client-side or server-side check) | No, fix the input |
| `duplicate` | Order number or `callId` already used | No, look the document up |
| `not_found` | The document does not exist | No |
| `partial_success` | The document exists, but a side effect (email) failed | No |
| `maintenance` | Számlázz.hu maintenance (code 1) | kassza retries lookups automatically |
| `rate_limit` | Too many documents in the test account (code 167) | No, wait a few minutes |
| `attempt_limit` | The request already failed 5 times; kassza did not send it | No, a human must act, then `resetAttempts` |
| `in_progress` | Another process is issuing the same document (`createOnce` lock) | Later, by calling `createOnce` again |
| `store_unavailable` | A required store (lock, fail-closed ledger) is down; nothing was sent | After the store is back |
| `network` / `timeout` | Transport failure; the outcome is unknown for writes | Look up by `orderNumber` before trying again |
| `configuration` | Missing key, bad options | No |
| `unexpected_response` | Számlázz.hu answered in an unknown format | Report it |
| `unknown` | An error code kassza does not know; the original message is kept | No, read `code` and `message` |
