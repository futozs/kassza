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

## 2. Paid order → invoice, safely (Stripe, Barion, SimplePay webhooks)

```ts
import { isSzamlazzError } from 'kassza'
import { kassza } from './kassza'

export async function invoiceOrder(order: Order) {
  const orderNumber = `ORDER-${order.id}`

  const existing = await kassza.invoices.find({ orderNumber })
  if (existing) return existing.header.number

  try {
    const invoice = await kassza.invoices.create({
      orderNumber,
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
    return invoice.number
  } catch (error) {
    if (isSzamlazzError(error) && ['network', 'timeout', 'partial_success', 'duplicate'].includes(error.category)) {
      const created = await kassza.invoices.find({ orderNumber })
      if (created) return created.header.number
    }
    throw error
  }
}
```

The first `find` makes the webhook idempotent when the payment provider redelivers the event.

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

## 5. Cash register receipt

```ts
const receipt = await kassza.receipts.create({
  callId: `POS-${sale.id}`,
  paymentMethod: sale.card ? 'bankkártya' : 'készpénz',
  items: sale.lines.map((line) => ({ name: line.name, quantity: line.qty, grossUnitPrice: line.price, vat: 27 })),
})

if (sale.email) await kassza.receipts.send({ receiptNumber: receipt.number, emails: sale.email })
```

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
