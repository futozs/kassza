# kassza: recipes

Copy-paste starting points. Each recipe follows the rules in [pitfalls.md](./pitfalls.md).

## 1. One shared client (server only)

```ts
import { createKassza } from 'kassza'

export const kassza = createKassza({
  defaults: {
    invoice: { prefix: 'WEB', paymentDueInDays: 8, seller: { emailReplyTo: 'billing@example.hu' } },
    receipt: { prefix: 'NYGT', paymentMethod: 'bankkártya' },
  },
})
```

The client reads `SZAMLAZZ_AGENT_KEY` from the environment. Create it once per process, not once per request, so the session cookie is reused.

## 2. Paid order → invoice, exactly once (any webhook or job)

```ts
import type { Kassza } from 'kassza'
import { kassza as defaultKassza } from './kassza'

export async function invoiceOrder(order: Order, kassza: Kassza = defaultKassza) {
  const { number } = await kassza.invoices.createOnce({
    orderNumber: `ORDER-${order.id}`,
    paid: true,
    paymentMethod: 'bankkártya',
    buyer: {
      name: order.billingName,
      zip: order.zip,
      city: order.city,
      address: order.street,
      email: order.email,
      taxNumber: order.taxNumber,
    },
    items: order.lines.map((line) => ({
      name: line.title,
      quantity: line.quantity,
      grossUnitPrice: line.unitPriceHuf,
      vat: 27,
    })),
  })
  return number
}
```

`createOnce` looks the invoice up first, so a redelivered webhook gets the existing number. After a network error, a timeout or error 56 it looks the invoice up again before giving up, and it never sends the invoice twice. For Stripe, SimplePay, Barion, Revolut and PayPal, recipe 11 does all of this with a ready-made handler.

## 3. Event registration: proforma → payment → invoice

```ts
const proforma = await kassza.invoices.create({
  type: 'proforma',
  orderNumber: `REG-${entry.id}`,
  buyer,
  items: [{ name: 'Nevezési díj', grossUnitPrice: 26_000, vat: 27 }],
})

const invoice = await kassza.invoices.create({
  orderNumber: `REG-${entry.id}`,
  proformaNumber: proforma.number,
  paid: true,
  buyer,
  items: [{ name: 'Nevezési díj', grossUnitPrice: 26_000, vat: 27 }],
})

await kassza.invoices.deleteProforma({ orderNumber: `REG-${entry.id}` })
```

- `buyer` is the same buyer object on both documents.
- Call `deleteProforma` only if the proforma was never paid and must be cancelled.

## 4. Payment notification (IPN) webhook, Next.js App Router

```ts
import { ipnOkResponse, readIpnNotification } from 'kassza/ipn'

export async function POST(request: Request) {
  const ipn = await readIpnNotification(request)
  if (ipn.isFullyPaid) await markOrderPaid({ invoiceNumber: ipn.invoiceNumber, orderNumber: ipn.orderNumber })
  return ipnOkResponse()
}
```

Set the webhook URL in Számlázz.hu under Fiók beállítások / Számlázás alapadatok. `markOrderPaid` must be idempotent, because the same notification can arrive more than once.

## 5. Point-of-sale receipt (food truck, webshop, services)

```ts
const { receipt } = await kassza.receipts.createOnce(
  {
    orderNumber: `POS-${sale.id}`,
    paymentMethod: sale.card ? 'bankkártya' : 'készpénz',
    items: sale.lines.map((line) => ({ name: line.name, quantity: line.qty, grossUnitPrice: line.price, vat: line.vat })),
  },
  { lookupFirst: false },
)

if (sale.email) await kassza.receipts.send({ receiptNumber: receipt.number, emails: sale.email })
```

- Agent receipts are only for activities without the online cash register obligation (rule 7 in [pitfalls.md](./pitfalls.md)): a food truck yes, a fixed shop or café no.
- The order number is also sent as `callId`, so a second tap on the button returns the same receipt (error 338 is handled for you). `lookupFirst: false` skips the lookup before each new sale.
- If Számlázz.hu is down, sell on a paper receipt pad and report it with `paperReceiptReport` (recipe 13).

## 6. Save the PDF to S3 or Cloudflare R2 (no AWS SDK needed)

```ts
import { invoicePdfKey, s3FetchStorage, storePdf } from 'kassza/storage'

const storage = s3FetchStorage({
  bucket: 'invoices',
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  accessKeyId: process.env.R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
})

const invoice = await kassza.invoices.create(input)
if (invoice.pdf) {
  const stored = await storePdf(storage, invoicePdfKey({ number: invoice.number }), invoice.pdf)
  await db.invoice.update({ where: { orderNumber }, data: { pdfKey: stored.key } })
}
```

Other adapters with the same interface:

- `s3Storage` (AWS SDK v3 client)
- `r2BindingStorage` (Workers binding)
- `vercelBlobStorage`
- `uploadthingStorage`
- `supabaseStorage`
- `fsStorage` from `kassza/storage/fs`
- `memoryStorage`

## 7. Serverless and edge: share the session

```ts
import { Redis } from '@upstash/redis'
import { createKassza } from 'kassza'
import { upstashRedisCookieStore } from 'kassza/cookie-stores'

const kassza = createKassza({ cookieStore: upstashRedisCookieStore(Redis.fromEnv()) })
```

- On Cloudflare Workers, use `cloudflareKvCookieStore(env.KASSZA_KV)`.
- Other stores: `ioredisCookieStore`, `nodeRedisCookieStore`, `customCookieStore({ get, set, delete })`.
- If the store fails, kassza simply continues without a session.

## 8. Unit tests without calling Számlázz.hu

```ts
import { createMockKassza } from 'kassza/testing'
import { expect, test } from 'vitest'

test('invoices a paid order once', async () => {
  const kassza = createMockKassza()

  await invoiceOrder(order, kassza)
  await invoiceOrder(order, kassza)

  expect(kassza.calls.filter((call) => call.method === 'invoices.create')).toHaveLength(1)
})

test('does not swallow a network failure when nothing was created', async () => {
  const kassza = createMockKassza()
  kassza.failNext('invoices.create')

  await expect(invoiceOrder(order, kassza)).rejects.toMatchObject({ category: 'network' })
})
```

Inject the client into your function, for example `invoiceOrder(order, kassza = defaultKassza)`, so tests can pass the mock. Mock method names match the API paths: `'invoices.create'`, `'invoices.get'` (also used by `find`), `'receipts.send'`, and so on.

## 9. Fill the buyer from a tax number

```ts
import { parseHungarianTaxNumber } from 'kassza/validators'

if (!parseHungarianTaxNumber(input)) throw new Error('Érvénytelen adószám')

const company = await kassza.taxpayer.query(input)
if (company.valid && company.address) {
  buyer = {
    name: company.name ?? '',
    zip: company.address.postalCode,
    city: company.address.city,
    address: company.address.formatted.split(', ').slice(1).join(', '),
    taxNumber: company.taxNumber?.formatted,
  }
}
```

## 10. Foreign currency and EU buyer

```ts
await kassza.invoices.create({
  currency: 'EUR',
  language: 'en',
  buyer: {
    name: 'Acme GmbH', country: 'Germany', zip: '10115', city: 'Berlin', address: 'Hauptstr. 1',
    euTaxNumber: 'DE123456789', taxpayerType: 'euBusiness',
  },
  items: [{ name: 'Consulting', quantity: 8, unit: 'hour', netUnitPrice: 95, vat: 'EUFAD37' }],
})
```

The exchange rate comes from MNB automatically when `exchangeRate` is omitted. Choose the VAT code together with an accountant.

## 11. Payment provider webhook → receipt or invoice (Stripe, SimplePay, Barion, Revolut, PayPal)

```ts
// app/api/stripe/webhook/route.ts
import { isSzamlazzError } from 'kassza'
import { stripeWebhook } from 'kassza/payments/stripe'
import { kassza } from '@/lib/kassza'

export const POST = stripeWebhook({
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
  apiKey: process.env.STRIPE_SECRET_KEY,
  onPayment: async (payment) => {
    try {
      await kassza.issueForPayment(payment, { vat: 27 })
    } catch (error) {
      if (isSzamlazzError(error) && !error.retryable) {
        await parkForHuman(payment.id, `${error.category}: ${error.message}`)
        return
      }
      throw error
    }
  },
})
```

- The handler verifies the signature and answers 400, 200 or 500 itself. A thrown error means 500, and the provider redelivers, which is safe: `issueForPayment` looks the document up first.
- Catch non-retryable errors (a missing VAT rate, an incomplete billing address) and hand them to a human, otherwise the provider keeps redelivering a request that can never succeed. `parkForHuman` is your own function.
- The same pattern works with `simplePayWebhook`, `barionWebhook`, `revolutWebhook` and `payPalWebhook`; only the credentials differ (see [api.md](./api.md)).
- A full refund reverses the document. A partial refund is skipped on purpose: it needs a corrective document decided by a human.
- The receipt prefix and payment method come from the client's `defaults.receipt` (recipe 1). Pass `receipt: { ... }` or `invoice: { ... }` only to override fields; a receipt prefix must never be one already used on invoices (error 336).

## 12. Receipt or invoice, and an invoice after a receipt

```ts
import { chooseDocument } from 'kassza'

const decision = chooseDocument({
  grossTotal: order.total,
  buyer: { taxNumber: order.taxNumber },
  invoiceRequested: order.wantsInvoice,
})

if (decision.type === 'receipt') {
  await kassza.receipts.createOnce({ orderNumber: `ORDER-${order.id}`, paymentMethod: 'bankkártya', items })
} else {
  await kassza.invoices.createOnce({ orderNumber: `ORDER-${order.id}`, paid: true, buyer, items })
}
```

When a buyer asks for an invoice after getting a receipt:

```ts
const converted = await kassza.receipts.convertToInvoice({
  receiptNumber: 'NYGT-2026-118',
  buyer: { name: 'Példa Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.', taxNumber: '12345676-2-42' },
})

converted.reversal?.number
converted.invoice.number
```

It reverses the receipt and invoices the same items, exactly once (external ID `CONV/{receiptNumber}`).

## 13. NAV daily receipt report: check it, do not double-report

```ts
import { createNavReceiptClient, reconcileNavReports } from 'kassza/nav'
import { navDailyReports } from 'kassza/reports'

const nav = createNavReceiptClient({
  environment: 'production',
  login: process.env.NAV_LOGIN!,
  password: process.env.NAV_PASSWORD!,
  signatureKey: process.env.NAV_SIGNATURE_KEY!,
  taxNumber: process.env.NAV_TAX_NUMBER!,
})

const local = navDailyReports(await receiptsBetween('2026-09-01', '2026-09-30'))
const remote = await nav.listAllReports({ from: '2026-09-01', to: '2026-09-30' })
const { missing, mismatched } = reconcileNavReports(local, remote)
```

- Számlázz.hu reports the receipts issued there after the NAV connection, so this client stays read-only (no `allowWrite`). Alert a human about `missing` and `mismatched` days.
- `receiptsBetween` is your own query over stored `Receipt` objects (from `receipts.get`, `issueForPayment` results, or the data link in recipe 15).
- Only receipts that Számlázz.hu does not know about, such as a paper pad used during an outage, are yours to submit: `nav.submitReport(paperReceiptReport({ applicableDate, entries }))` with `allowWrite: true`.

## 14. Platform invoicing for many companies (delegated invoicing)

```ts
import { createKasszaPool } from 'kassza/delegation'
import { upstashRedisCookieStore } from 'kassza/cookie-stores'
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

export const pool = createKasszaPool({
  resolve: async (merchantId) => {
    const merchant = await loadMerchant(merchantId)
    if (!merchant) return undefined
    return { username: merchant.delegateUser, password: merchant.delegatePassword, invoicePrefix: merchant.prefix }
  },
  cookieStore: upstashRedisCookieStore(redis),
  attemptLedger: upstashRedisCookieStore(redis),
})

const kassza = await pool.get('merchant-42')
await kassza.invoices.createOnce({ orderNumber: 'BOOKING-881', buyer, items })
```

- Link each merchant once with `connectPrincipal` from `kassza/delegation`, then wait until the merchant accepts. Check with `probeDelegation` rarely: every call emails the merchant again.
- Store the dedicated user's password encrypted. Call `pool.forget(merchantId)` when it or the prefix changes.

## 15. Receive the Számlázz.hu financial data link (accounting or ERP systems)

```ts
// app/api/szamlazz/data-link/route.ts
import { dataLinkHandler } from 'kassza/data-link'

export const POST = dataLinkHandler({
  verifyKey: async (key) => (await customerKeys()).includes(key),
  onPush: async (push) => {
    if (push.kind === 'invoice' || push.kind === 'incoming-invoice') {
      const registrationNumber = await saveInvoice(push.id, push.invoice, push.deleted)
      return { registrationNumber }
    }
    if (push.kind === 'bank-transaction') await saveTransaction(push.transaction)
    if (push.kind === 'receipts') await saveReceipts(push.receipts)
  },
})
```

- The requests are not signed, so the key check is mandatory: `keys` or `verifyKey`.
- Upsert invoices by `push.id`, because the same invoice arrives again after a payment or a reversal.
- Keep `onPush` fast (save and return). A slow or failing endpoint is retried for 72 hours and can get the whole receiving system switched off by Számlázz.hu.

## 16. Integration tests with the fake Számla Agent

```ts
import { createKassza } from 'kassza'
import { createFakeAgentFetch } from 'kassza/testing'
import { expect, test } from 'vitest'

test('a lost response does not create a second invoice', async () => {
  const agent = createFakeAgentFetch()
  const kassza = createKassza({ agentKey: 'test-key', fetch: agent.fetch, retryDelayMs: 0 })
  agent.fail('ghostSuccess', { action: 'createInvoice' })

  const result = await kassza.invoices.createOnce(
    { orderNumber: 'WEB-1', buyer, items },
    { recoveryDelayMs: 0 },
  )

  expect(result.created).toBe(true)
  expect(agent.invoices.size).toBe(1)
})
```

The fake Agent runs the real kassza code (XML, multipart, response parsing, retries, `createOnce` recovery) against an in-memory Számla Agent. `agent.requests` shows every request kassza sent.

## 17. Invoicing from an AI assistant (MCP)

```json
{
  "mcpServers": {
    "kassza": {
      "command": "npx",
      "args": ["-y", "kassza", "mcp"],
      "env": { "SZAMLAZZ_AGENT_KEY": "..." }
    }
  }
}
```

- The server is read-only by default. Add `"--allow-write"` to `args` to enable issuing and reversing; even then every write needs the confirmation code from the matching preview tool, for exactly the same input.
- Start with a Számlázz.hu test account.
