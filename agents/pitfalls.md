# kassza: rules and pitfalls

Read this before writing any code that issues invoices or receipts. These rules come from the official Számlázz.hu docs and from production incidents. Breaking them produces invalid tax documents, duplicate invoices, or a banned API key.

## Hard rules

1. **Never retry creating an invoice or receipt in a loop.** Számlázz.hu bans accounts that resend requests. kassza already retries only when it is safe to do so. Do not wrap `invoices.create` in your own retry loop.
2. **After an uncertain failure, look the document up before creating it again.** A timeout, a network error, or error `56` (`partial_success`) can mean the invoice was created anyway. Always set an `orderNumber`, and on those errors call `kassza.invoices.find({ orderNumber })` first.
3. **Do not compute item amounts yourself.** Pass `netUnitPrice` (B2B) or `grossUnitPrice` (B2C) plus `vat`, and kassza applies the official rounding rules. Hand-computed floats cause errors 259–264, and on receipts 261 and 363–365.
4. **Never use `new Date().toISOString().slice(0, 10)` for invoice dates.** Between midnight and 02:00 Budapest time it returns yesterday, which gives error 352. Leave dates out (kassza defaults to today in `Europe/Budapest`) or pass a `Date`.
5. **The Agent key is a secret and must be lowercase.** Read it from `SZAMLAZZ_AGENT_KEY` on the server only, and never ship it to a browser bundle. kassza rejects keys containing uppercase letters before sending anything.
6. **Use the test account while developing.** It allows at most 500 invoices per 10 minutes. Never run tests against a production Agent key.

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
| IPN source check | `isSzamlazzIp` trusts the first `x-forwarded-for` entry | Use it only behind a proxy you control |
| NAV receipt data reporting | Mandatory since 2026-09-01, with a grace period until 2026-12-31 | No code change needed yet; watch the kassza changelog |

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
| `network` / `timeout` | Transport failure; the outcome is unknown for writes | Look up by `orderNumber` before trying again |
| `configuration` | Missing key, bad options | No |
| `unexpected_response` | Számlázz.hu answered in an unknown format | Report it |
