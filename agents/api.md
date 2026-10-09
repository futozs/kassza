# kassza: API reference for coding agents

All types are exported from `kassza`, so import them instead of redefining them. Every method throws `SzamlazzError` on failure and accepts an optional last argument `{ signal?: AbortSignal }`.

## Client

```ts
import { createKassza } from 'kassza'

const kassza = createKassza({
  agentKey?: string,
  username?: string, password?: string,
  defaults?: { invoice?: InvoiceDefaults, receipt?: ReceiptDefaults },
  cookieStore?: KeyValueStore | false,
  attemptLedger?: KeyValueStore,
  attemptLedgerMode?: 'fail-open' | 'fail-closed',
  createOnceLock?: KeyValueStore,
  taxpayerCache?: { store: KeyValueStore, ttlSeconds?, invalidTtlSeconds? },
  timeoutMs?: number,
  maxAttempts?: number,
  retryDelayMs?: number,
  maintenanceCooldownMs?: number,
  fetch?: typeof fetch,
  endpoint?: string,
  hooks?: { onRequest?, onResponse?, onError?, onComplete?, onDocument?, onDocumentError?, onWarning? },
})
```

- `agentKey` falls back to the `SZAMLAZZ_AGENT_KEY` environment variable.
- `username` and `password` are legacy credentials; prefer the Agent key.
- `cookieStore` defaults to an in-memory store; `false` disables session reuse.
- `timeoutMs` defaults to 60000.
- `maxAttempts` defaults to 3 and is capped at 5. It applies only to operations that are safe to retry.
- `hooks` receive events for logging. They never receive the XML payload or the key.
- `KeyValueStore` (alias `CookieStore`) is `{ get, set, delete }` plus the optional atomic `setIfAbsent`, `increment`, `deleteIfEquals`. Adapters live in `kassza/stores` (see below).
- `attemptLedger` is a shared store. It counts failed attempts of identical requests across processes for a day, atomically when the store has `increment`. After 5 failures kassza throws an `attempt_limit` error without sending the request; after a human fixed the cause, call `kassza.resetAttempts(error)`. If the store fails, `attemptLedgerMode: 'fail-open'` (default) falls back to an in-process counter and emits `onWarning`; `'fail-closed'` throws `store_unavailable` without sending (create the adapter with `resilient: false` so read errors reach kassza).
- `createOnceLock` is a shared store with `setIfAbsent` (Redis, Upstash, Durable Object; not Cloudflare KV). It makes `createOnce` exactly-once across processes. Calls for the same order inside one process are always merged, without any option.
- `taxpayerCache` caches `taxpayer.query` results (valid ones for a day, invalid ones for 10 minutes; errors are never cached).
- `maintenanceCooldownMs` defaults to 0. When set, a maintenance error (code 1) blocks all requests of the client for that long, and they fail at once with category `maintenance`.
- `hooks.onDocument(event)` runs after every created or reversed document and every registered payment, with `{ kind: 'invoice' | 'receipt', action: 'created' | 'reversed' | 'payment', number, document }` (plus `reversedNumber` for reversals and `input` for created invoices). It is awaited. `hooks.onDocumentError` decides what happens when it throws: `'warn'` (default, the call still succeeds), `'throw'` (a `DocumentHookError` carrying `event`, `document` and `number` of the document that WAS created; never re-create it) or a handler `(error, event) => void`.
- `hooks.onWarning(warning)` receives the errors kassza swallows on purpose: `{ kind: 'session' | 'ledger' | 'hook' | 'document' | 'lock' | 'dedupe' | 'cache', message, error, action?, operation? }`.
- `hooks.onRequest`, `onResponse`, `onError` and `onComplete` events carry `{ action, attempt, requestId }`; `onResponse` adds `status`, `durationMs`, `responseBytes`, `sessionReused`; `onComplete` adds `outcome: 'success' | 'error'`, `durationMs`, `error?`, `willRetry` and fires once per attempt.
- Retries of safe operations wait `retryDelayMs * 2^(attempt-1)` with ±20% jitter, and honour `Retry-After` (no retry when it exceeds 60 s).

## Invoices: `kassza.invoices`

| Method | Returns | Retried automatically |
|---|---|---|
| `create(input: CreateInvoiceInput)` | `CreatedInvoice` | never |
| `createOnce(input: CreateInvoiceInput, options?: CreateOnceOptions)` | `InvoiceOnceResult` | never resends; looks the invoice up instead |
| `preview(input: CreateInvoiceInput)` | `InvoicePreview` (PDF only, no document is created) | never |
| `reverse(input: string \| ReverseInvoiceOptions)` | `ReversedInvoice` | never |
| `registerPayment(input: RegisterPaymentInput)` | `RegisteredPayment` | only when `additive: false` |
| `registerPaymentOnce({ invoiceNumber, key, amount, method?, date?, description?, taxNumber? }, options?)` | `RegisteredPaymentOnce` (`{ invoiceNumber, key, marker, created, payment?, existing? }`) | never resends; looks the payment up by its marker |
| `clearPayments(input: string \| { invoiceNumber })` | `RegisteredPayment` | yes |
| `getPdf(ref: InvoiceReference)` | `InvoicePdf` | yes |
| `get(ref: InvoiceReference, { includePdf? })` | `InvoiceDetails` | yes |
| `find(ref: InvoiceReference, { includePdf? })` | `InvoiceDetails \| null` | yes |
| `deleteProforma(ref: string \| { proformaNumber } \| { orderNumber })` | `void` | never |

`InvoiceReference` is `string` (the invoice number), `{ invoiceNumber }`, `{ orderNumber }`, or `{ externalId }`. When several documents share an order number, the latest one is returned.

### createOnce

`invoices.createOnce(input, { lookupFirst?, matchOrderNumber?, recoveryDelayMs?, signal?, lock?, lockTtlSeconds?, lockWaitMs?, lockFailure? })` makes invoicing exactly-once:

1. It looks the invoice up by external ID (and, with `matchOrderNumber`, by order number) and returns it if it exists.
2. Otherwise it creates the invoice.
3. After an uncertain failure (`network`, `timeout`, `partial_success`, `duplicate`, `unexpected_response`, `unknown`) it looks the invoice up twice more, after `recoveryDelayMs` (default 1000, doubled for the second lookup).

- `orderNumber` is required. The external ID defaults to the order number with a suffix per type: `/D` proforma, `/E` advance, `/V` final, `/H` corrective, `/SZL` delivery note, none for a normal invoice. Pass `externalId` to override it.
- `lookupFirst` and `matchOrderNumber` default to `true`.
- It returns `InvoiceOnceResult`: `{ number, created, externalId, invoice?: CreatedInvoice, details?: InvoiceDetails }`. `created` is `false` when the invoice already existed.
- If the outcome stays unknown, it rethrows the original error with `details.outcome: 'unknown'`. Do not create the invoice by hand then; call `createOnce` again later.
- Concurrent calls for the same order in one process share one execution; the others get the result with `created: false`. Across processes `lock` (default: the client's `createOnceLock`, `false` disables) is held for `lockTtlSeconds` (600); a waiter polls up to `lockWaitMs` (10000) and then throws `in_progress` (respond 5xx in a webhook so it is redelivered). `lockFailure: 'throw'` (default) throws `store_unavailable` when the lock store is down; `'proceed'` continues without a lock and warns.
- `registerPaymentOnce` writes `[kassza:{key}]` into the payment description and looks for it on the invoice before registering. If the marker cannot be read back after registering, it throws `unexpected_response` with `details.registered: 'true'`: the payment exists, do not call again.

### CreateInvoiceInput

```ts
{
  type?: 'invoice' | 'proforma' | 'advance' | 'deliveryNote'
       | 'final' | 'corrective',
  advanceInvoiceNumber?: string,
  correctedInvoiceNumber?: string,

  buyer: {
    name: string, zip: string, city: string, address: string,
    country?, email?, sendEmail?, taxNumber?, euTaxNumber?, groupTaxNumber?,
    taxpayerType?: 'hungarianTaxNumber' | 'euBusiness' | 'nonEuBusiness' | 'noTaxNumber' | 'unknown',
    postal?: { name?, country?, zip?, city?, address? },
    identifier?, phone?, comment?, signatoryName?, ledger?,
  },
  items: Array<{
    name: string,
    vat: VatRate,
    quantity?: number,
    unit?: string,
    netUnitPrice?: number,
    grossUnitPrice?: number,
    netAmount?, vatAmount?, grossAmount?,
    identifier?, comment?, ledger?, dataDeletionCode?, marginVatBase?,
  }>,

  issueDate?: Date | 'YYYY-MM-DD',
  fulfillmentDate?, dueDate?, paymentDueInDays?: number,
  paymentMethod?: string,
  currency?: string,
  exchangeRate?: number,
  exchangeBank?: string,
  language?: 'hu' | 'en' | 'de' | 'it' | 'ro' | 'sk' | 'hr' | 'fr' | 'es' | 'cz' | 'pl' | 'bg' | 'nl' | 'ru' | 'si',
  orderNumber?: string,
  proformaNumber?: string,
  externalId?: string,
  prefix?: string,
  comment?, paid?: boolean,
  eInvoice?: boolean,
  downloadPdf?: boolean,
  seller?: { bank?, bankAccount?, emailReplyTo?, emailSubject?, emailText?, signatoryName? },
  template?: 'SzlaMost' | 'SzlaAlap' | 'SzlaNoEnv' | 'Szla8cm' | 'SzlaTomb' | 'SzlaFuvarlevelesAlap',
  attachments?: Array<{ filename, content: Uint8Array | ArrayBuffer | Blob | string, contentType? }>,
  waybill?, simpleItems?, euVat?, marginVat?, paymentCorrection?, logoExtra?,
}
```

Notes on the fields:

- `type` defaults to `'invoice'`. `'final'` optionally takes `advanceInvoiceNumber`, and `'corrective'` requires `correctedInvoiceNumber`.
- In `items`:
  - `quantity` defaults to 1 and may be negative on final or corrective invoices.
  - `unit` defaults to `'db'`.
  - Give exactly one of `netUnitPrice` (B2B, net-based rounding) and `grossUnitPrice` (B2C, gross-based rounding).
  - Use `netAmount`, `vatAmount` and `grossAmount` only to override the calculation, and give all three.
- All dates default to today in `Europe/Budapest`.
- `paymentMethod` defaults to `'Átutalás'`.
- `currency` defaults to `'HUF'`. For other currencies, `exchangeBank` defaults to MNB, and `exchangeRate` is required unless the bank is MNB.
- `orderNumber` is your ID. Always set it, because it enables `find` and deduplication.
- `proformaNumber` links the invoice to the proforma it was paid from. `externalId` is an ID for lookups.
- `prefix` must be registered in the Számlázz.hu account (error 202).
- `eInvoice` defaults to `false`, and `downloadPdf` defaults to `true`.
- `attachments` allows at most 5 files, 2 MB each, and they are sent only by email.

`VatRate` is one of 0, 5, 18, 27 (plus the other rates allowed by Számlázz.hu) or one of `'TAM' | 'AAM' | 'EUT' | 'EUKT' | 'F.AFA' | 'K.AFA' | 'TAHK' | 'HO' | 'EUE' | 'EUFADE' | 'EUFAD37' | 'ATK' | 'NAM' | 'EAM' | 'KBAUK' | 'KBAET'`.

`CreatedInvoice` is `{ number, netTotal, grossTotal, outstanding?, buyerAccountUrl?, pdf?: Uint8Array, items: ItemAmounts[] }`.

### RegisterPaymentInput

```ts
{ invoiceNumber, amount, method?: string, date?, description?, additive? }
{ invoiceNumber, payments: Array<{ amount, method, date?, description? }>, additive?, taxNumber? }
```

- The single-payment form defaults `method` to `'átutalás'` and `date` to today.
- The multi-payment form accepts at most 5 payments.
- `additive` defaults to `true`, which appends to earlier payments; `false` replaces them.

### ReverseInvoiceOptions

```ts
{ invoiceNumber, issueDate?, fulfillmentDate?, comment?, template?, eInvoice?, downloadPdf?, externalId?,
  email?: { replyTo?, subject?, text? }, buyer?: { email?, taxNumber?, euTaxNumber? } }
```

## Receipts: `kassza.receipts`

| Method | Returns | Retried automatically |
|---|---|---|
| `create(input: CreateReceiptInput)` | `Receipt` | only with `callId` |
| `createOnce(input: CreateReceiptInput, options?: CreateOnceOptions)` | `{ receipt: Receipt, created: boolean }` | only with `callId` (defaults to `orderNumber`) |
| `convertToInvoice(input: ConvertReceiptInput, options?: CreateOnceOptions)` | `ConvertedReceipt` | never resends; looks the invoice up instead |
| `reverse(input: string \| { receiptNumber, callId?, downloadPdf?, template? })` | `Receipt` | only with `callId` |
| `get(input: string \| { receiptNumber } \| { orderNumber }, + downloadPdf?)` | `Receipt` | yes |
| `find(same as get)` | `Receipt \| null` | yes |
| `send({ receiptNumber, emails: string \| string[], replyTo?, subject?, text? })` | `void` | never |

```ts
{
  prefix: string,
  paymentMethod: string,
  items: Array<{ name, vat: VatRate | 'ÁKK' | 'MAA' | 'EU' | 'EUK', quantity?, unit?,
                 netUnitPrice? | grossUnitPrice?, identifier?, comment?, ledger? }>,
  callId?: string,
  orderNumber?, comment?, currency?, exchangeRate?, exchangeBank?,
  payments?: Array<{ method, amount, description? }>,
  template?: 'A' | 'N' | 'J' | 'L', downloadPdf?,
}
```

- `prefix` accepts uppercase letters and digits only. Give it in the input or in `defaults.receipt`.
- `paymentMethod` has no default: `'készpénz'`, `'bankkártya'` or anything else must be given here or in `defaults.receipt`.
- `callId` is an idempotency key; set it from your order ID.
- If you pass `payments`, their sum must equal the gross total.

`Receipt` is `{ id, number, callId?, type: 'receipt' | 'reversal', isReversed, reversedReceiptNumber?, issueDate, paymentMethod, currency, orderNumber?, items, payments, totals: { netAmount, vatAmount, grossAmount, byVat }, pdf? }`.

- `receipts.createOnce` requires `orderNumber`, uses it as `callId` unless you give one, looks the receipt up by order number first (skip with `lookupFirst: false`), and after error 338 or another uncertain failure returns the receipt that already exists.
- `receipts.convertToInvoice({ receiptNumber, buyer, orderNumber?, prefix?, comment?, language?, template?, seller?, eInvoice?, downloadPdf?, vatMapping?, allowAlreadyReversed? })` reverses the receipt and issues an invoice for the same items to `buyer`, exactly once. It returns `{ receipt, reversal?, invoice: InvoiceOnceResult }`. The invoice external ID is `CONV/{receiptNumber}`. Receipt-only VAT codes (`ÁKK`, `MAA`, `EU`, `EUK`) need a `vatMapping` entry, chosen with an accountant.

## Taxpayer: `kassza.taxpayer`

`query(taxNumber: string): TaxpayerInfo` accepts `12345676`, `12345676-2-42` or `HU12345676`. With `taxpayerCache` the result is cached by the 8-digit taxpayer ID.

`TaxpayerInfo` is `{ valid, name?, shortName?, taxNumber?: { taxpayerId, vatCode?, countyCode?, formatted? }, address?: TaxpayerAddress, addresses, incorporation?, infoDate? }`, and `TaxpayerAddress.formatted` looks like `'1031 Budapest, Záhony utca 7.'`.

## Other

- `kassza.verifyCredentials(): Promise<boolean>` returns `false` for a wrong key and throws for account problems.
- `kassza.resetSession()` clears the session. Call it after changing account data in Számlázz.hu.
- `kassza.resetAttempts(errorOrKey)` clears the `attemptLedger` counter of an `attempt_limit` error (or of its `details.attemptKey`).
- `kassza.issueForPayment(payment, options?)` issues a receipt or invoice for a `PaymentEvent`, exactly once. See `kassza/payments` below.

## Receipt or invoice: `chooseDocument`

```ts
import { chooseDocument } from 'kassza'

const decision = chooseDocument({
  grossTotal: 18_990,
  currency: 'HUF',
  exchangeRate?: number,
  buyer?: { taxNumber?, euTaxNumber?, isBusiness? },
  paidByFulfillment?: boolean,
  invoiceRequested?: boolean,
  cashRegisterRequired?: boolean,
})
```

- It returns `{ type: 'receipt' | 'invoice' | 'cash-register', reasons: string[], grossTotalHuf }` and makes no network call.
- `invoice` means at least one of the four receipt conditions fails: a business buyer, a total of 900 000 HUF or more, not paid by fulfilment (`paidByFulfillment: false`), or `invoiceRequested: true`. `reasons` says which, in Hungarian.
- `cash-register` means a receipt would be due, but the activity needs an online cash register (`cashRegisterRequired: true`), so an Agent receipt must not be issued. An invoice is still allowed.
- Foreign currency totals need `exchangeRate`, because the limit is in HUF.

## Subpath modules

### `kassza/testing`

```ts
createMockKassza({ defaults?, taxpayers?: Record<taxpayerId, TaxpayerInfo>, credentialsValid?, now?: () => Date }): MockKassza
```

- A `MockKassza` has the same interface as `Kassza`, plus `calls`, `invoiceRecords`, `receiptRecords`, `failNext(method, error?)` and `reset()`.
- The method names used in `calls` and `failNext` look like `'invoices.create'` and `'receipts.send'`.
- The mock runs the real validation and rounding, and throws the same error codes: 7, 335, 338 and 339.
- `createMockKassza({ hooks: { onDocument } })` fires the same document events as the real client.

```ts
createFakeAgentFetch(options?: FakeAgentOptions): FakeAgent
```

- A fake Számla Agent behind a `fetch`: pass `agent.fetch` to the real `createKassza({ agentKey, fetch: agent.fetch, retryDelayMs: 0 })`. It parses the real request XML, numbers documents, applies the Számlázz.hu rules (259–261, 336–340, 363–365, 395, 152, 202, 524, 7, 335, 339, 53, 57, 3) and answers in the real response formats.
- `FakeAgent` is `{ fetch, requests, invoices, receipts, fail(fault, { action?, times? }), acceptDelegation(taxNumber), reset() }`.
- Faults: `'ghostSuccess'` (created, but the response is lost), `'timeout'`, `'networkError'`, `'serverError'`, `'maintenance'`, `'partialSuccess'` (56), `'testAccountLimit'` (167), `'duplicateCallId'` (338), `'duplicateOrderNumber'` (152), or `{ code, message?, afterSuccess? }`.
- Options: `now`, `agentKeys` and `users` (strict authentication), `testAccount` (default `true`), `invoicePrefixes`, `defaultInvoicePrefix` (default `KASSZA`), `receiptPrefixes`, `rejectDuplicateOrderNumbers` (`boolean` or `{ invoices?, receipts? }`), `seller`, `taxpayers`, `principals` (`{ [taxNumber]: 'owned' | 'unowned' }`), `faults`.
- Use the mock for business logic, and the fake Agent for webhooks, retries and `createOnce` recovery.

### `kassza/ipn`

- `readIpnNotification(request: Request): Promise<IpnNotification>`, for Next.js route handlers, Hono, Workers and similar.
- `parseIpnNotification(body: string | URLSearchParams | FormData | Record<string, string>): IpnNotification`
- `IpnNotification` is `{ invoiceNumber, proformaNumber?, orderNumber?, grossTotal, paidAmount, paymentMethod?, paymentDate?, isFullyPaid, raw }`.
- `ipnOkResponse(): Response`
- `isSzamlazzIp(ip, { trustedProxies?, allowedIps? })` and `SZAMLAZZ_OUTBOUND_IPS`. `ip` may be an `x-forwarded-for` list: the rightmost entry is checked, after skipping `trustedProxies` entries.
- `readIpnNotification` rejects bodies above `MAX_IPN_BODY_BYTES` (64 KiB) with a `validation` error.

### `kassza/validators`

- Tax number: `parseHungarianTaxNumber`, `isValidHungarianTaxNumber` (CDV check), `isValidHungarianTaxpayerId`, `isValidHungarianGroupTaxNumber`.
- Bank account: `parseHungarianBankAccount`, `isValidHungarianBankAccount`, `formatHungarianBankAccount`, `isValidHungarianIban`.
- Address: `isValidHungarianZipCode`, `parseHungarianAddress('1234 Budapest, Fő utca 1.')` returns `{ zip, city, address, district? }`.
- Other: `isValidEuVatNumber`, `normalizeEuVatNumber`, `isValidEmail`, `normalizeEmail`, `isValidAgentKey`.

### `kassza/money`

- `calculateInvoiceItem(input, currency?)` and `calculateReceiptItem(input, currency?)` return `ItemAmounts`.
- `allocateRefund(items: { name, vat, grossAmount, unit?, identifier? }[], refundGross, { decimals?, refundedBefore? })` splits a refund exactly over items (Sainte-Laguë, BigInt), path-independent: refunds split into parts give the same per-item totals as one refund.
- `summarizeItems(items)` returns `{ netAmount, vatAmount, grossAmount, byVat }`.
- `roundMoney(value, decimals)`, `isVatRate(value)`, `NUMERIC_VAT_RATES`, `SPECIAL_VAT_CODES`.

### `kassza/storage`

- `storePdf(storage, key, pdf)` and `invoicePdfKey({ number })` save PDFs through adapters: `s3FetchStorage`, `s3Storage`, `r2BindingStorage`, `vercelBlobStorage`, `uploadthingStorage`, `supabaseStorage`, `memoryStorage`, and `fsStorage` from `kassza/storage/fs`.

### `kassza/stores` (also `kassza/cookie-stores`)

- `memoryStore()`, `upstashRedisStore(redis)`, `ioredisStore(redis)`, `nodeRedisStore(client)`, `cloudflareKvStore(namespace)`, `customStore(store)`, `resilientStore(store)`; the old `*CookieStore` names are aliases.
- Redis adapters get the atomic operations through Lua (`eval`) when the client has it. Cloudflare KV has none: use `durableObjectStore(stub)` with `handleDurableObjectStoreRequest(this.ctx.storage, request)` inside your Durable Object class for locks and the journal on Workers.
- Adapters are resilient by default: `get`/`set`/`delete` errors are reported to `onError` and swallowed, atomic operation errors are reported and rethrown. `resilient: false` rethrows everything.
- `diagnoseStore(store)` returns `{ ok, capabilities, suitableFor: { session, attemptLedger, createOnceLock, journal, webhookDedupe }, latencyMs, problems }` after a round-trip with a temporary key.

### `kassza/journal`

```ts
const journal = createJournal(kvJournal(store), { now? })
createKassza({ hooks: { onDocument: (event) => journal.record(event), onDocumentError: 'throw' } })
```

- `kvJournal(store, { prefix?, retentionDays? (400), reservationTtlDays? (30) })` needs a store with `increment`; `memoryJournal()` for tests; or implement `JournalStorage` for SQL.
- `record(event)` stores created and reversed documents (payments are ignored); idempotent by document number.
- `trackReceipt(orderNumber, run)` / `trackInvoice(orderNumber, run)` reserve before `run` and complete after it. Definite `SzamlazzError`s release the reservation; uncertain errors and crashes leave it pending. A failed journal write after success throws `JournalWriteError` with `result`.
- `pending(range?)` lists reservations (last 30 days by default); `settle(kassza, { range?, releaseNotFound? })` looks them up by order number and records what it finds.
- `entries({ from, to, kind? })`, `receipts({ from, to, includeTest? })` (feed into `navDailyReports`), at most 366 days per call.
- `reconcile(archive, { from?, to?, dryRun? })` compares with the data link receipt archive: `{ range, added, missingFromArchive, matched }`.

### `kassza/payments`

Webhook handlers are `(request: Request) => Promise<Response>`, usable directly as Next.js route handlers, in Hono or in Workers. Each one verifies the request, turns it into a `PaymentEvent` and calls `onPayment`:

| Import | Handler | Required options |
|---|---|---|
| `kassza/payments/stripe` | `stripeWebhook` | `secret` (string or array for rotation); optional `apiKey` to load line items and refunds |
| `kassza/payments/simplepay` | `simplePayWebhook` | `secretKey` or `merchants` |
| `kassza/payments/barion` | `barionWebhook` | `posKey` |
| `kassza/payments/revolut` | `revolutWebhook` | `secret`, `apiKey` |
| `kassza/payments/paypal` | `payPalWebhook` | `webhookId`, `clientId`, `clientSecret` |

- Common options: `onPayment(payment)`, `onError?(error)`, `method?` (the payment method written on the document), `maxBodyBytes?`, `fetch?`; `sandbox?` where the provider has one.
- Responses: `400` for a bad signature or payload (never reaches `onPayment`), `200` on success (`204` for Revolut, a signed JSON for SimplePay), `500` when `onPayment` throws, so the provider redelivers.
- `PaymentEvent` is `{ provider, kind: 'paid' | 'refunded' | 'partially-refunded' | 'failed' | 'other', id, eventId?, eventType?, orderRef?, amount?: { value, currency }, refundedAmount?, refunds?: { id, amount, refundedBefore?, createdAt? }[], paidAt?, method, customer?, items?, raw }`. Amounts are in major units (12700 HUF, not minor units). `refunds` lists the individual refunds the provider reported (Barion and SimplePay: all; Revolut and PayPal: the current one; Stripe: the delta of `charge.refunded` keyed by the event ID).
- `dedupe?: KeyValueStore` and `dedupeTtlSeconds?` (7 days): an event that was already processed successfully is acknowledged without calling `onPayment` again. It is marked only after `onPayment` succeeds.

```ts
const result = await kassza.issueForPayment(payment, {
  vat?: VatRate,
  vatFor?: (item: PaymentLineItem) => VatRate,
  items?: PaymentDocumentItem[],
  fallbackItemName?: string,
  document?: 'auto' | 'receipt' | 'invoice',
  buyer?: InvoiceBuyer,
  buyerIsBusiness?, invoiceRequested?, cashRegisterRequired?,
  orderNumber?: string,
  exchangeRate?, exchangeBank?,
  allowAmountMismatch?: boolean,
  partialRefund?: 'auto' | 'proportional' | 'skip',
  refundItems?: ({ refund, invoiceNumber, items }) => PaymentDocumentItem[] | undefined,
  receipt?: Partial<CreateReceiptInput>,
  invoice?: Partial<CreateInvoiceInput>,
})
```

- `paid`: chooses receipt or invoice with `chooseDocument` (override with `document`) and issues it with `createOnce`. `refunded`: reverses that document exactly once. `failed` and `other`: skipped.
- `partially-refunded`: for an invoice, one corrective invoice per refund (external ID `{orderNumber}/R-{refund}`), with the refund allocated exactly over the original items (`allocateRefund`, house-monotone, never more than an item's original amount across refunds). If the invoice has several VAT rates and no `refundItems` is given, it returns `{ kind: 'refund-proposal', ... }` instead (or allocate proportionally with `partialRefund: 'proportional'`). For a receipt it always returns a `refund-proposal`. Without `payment.refunds` it is skipped with a reason.
- The order number defaults to `{PROVIDER}-{payment id}`, for example `STRIPE-pi_123`, so the payment and its refund share it.
- Items come from `items`, then the provider's line items, then one item with the paid amount (`fallbackItemName`). VAT comes from `vatFor`, the provider's per-item rate, then `vat`. Without any, it throws `validation`: kassza never guesses VAT.
- The document total must equal the paid amount, unless `allowAmountMismatch: true`.
- It returns `{ kind: 'receipt', number, created, receipt, decision, orderNumber }`, `{ kind: 'invoice', number, created, invoice, decision, orderNumber }`, `{ kind: 'reversal', document, reversedNumber, number?, created, orderNumber }`, `{ kind: 'correction', correctedNumber, created, corrections: { refundId, externalId, number, created, grossTotal, invoice }[], orderNumber }`, `{ kind: 'refund-proposal', document, documentNumber, refunds: { refundId, grossTotal, items }[], reason, orderNumber }` or `{ kind: 'skipped', reason, orderNumber }`.
- `issueForPayment(api, payment, options)` from `kassza/payments` does the same with any object that has `invoices` and `receipts` (`createOnce`, `find`, `reverse`), for example a delegated client.

### `kassza/batch`

- `runBatch(kassza, { items: { key, document: () => ({ kind: 'invoice' | 'receipt', input }) }[], concurrency? (1, max 4), ratePerMinute? (30), dryRun?, journal?, signal?, onProgress?, recoveryDelayMs? })` issues each item with `createOnce`, using `key` as the order number, so a rerun never duplicates. It stops (marking the rest `skipped`) on `rate_limit`, `auth`, `account`, `configuration`, `maintenance`, `attempt_limit` or `store_unavailable`; other item errors land in `failed`. `dryRun` previews invoices and computes receipts locally. Returns `{ dryRun, items, created, existing, previewed, failed, skipped, stopped?, grossTotal }`.
- `billingPeriod({ interval: 'week' | 'month' | 'quarter' | 'year', anchor, paymentDueInDays? }, index)`, `billingPeriodAt(options, date)`, `billingPeriodsBetween(options, from, to)`, `todayPeriod(options)` return `{ index, interval, start, end, dueDate?, key }` in Budapest dates; month ends never drift (Jan 31 → Feb 28/29 → Mar 31). The fulfilment date is the caller's legal decision.

### `kassza/node`

- `toNodeHandler(webHandler, { trustProxy?, onError? })` adapts any `(Request) => Response` handler to Express, NestJS and `node:http`. It streams the raw body (so signatures verify), uses `rawBody` (NestJS) or a Buffer `body` (`express.raw`), and throws `NodeBodyError` when `express.json()` already consumed the body. With Express `next`, errors go to `next`.
- `toWebRequest(nodeRequest)` and `writeWebResponse(response, nodeResponse)` for Fastify or custom servers.

### `kassza/observe`

- `observe({ logger?, tracer?, metrics?, redact? (true), orderRefSalt?, logRequests? })` returns hooks: structured logs without secrets (order numbers as `hmac:` refs), one span per attempt (OpenTelemetry `Tracer` compatible), and metrics. `combineHooks(...hooks)` merges hook sets.
- `createMetricsRegistry(buckets?)` is a dependency-free registry with `renderPrometheus()`. Metrics: `kassza_requests_total{action,outcome}`, `kassza_request_duration_ms{action}`, `kassza_retries_total`, `kassza_maintenance_total`, `kassza_unexpected_response_total`, `kassza_store_errors_total{store}`, `kassza_warnings_total{kind}`, `kassza_documents_total{kind,action}`.

### `kassza/delegation`

```ts
connectPrincipal({ principal, user }, { agentKey?, verifyTaxNumber?, ... }): Promise<ConnectPrincipalResult>
probeDelegation({ username, password, ... }): Promise<DelegationProbeResult>
createDelegateKassza({ username, password, invoicePrefix, receiptPrefix?, defaults?, ... }): Kassza
createKasszaPool({ resolve, maxClients?, ... }): KasszaPool
```

- `connectPrincipal` (the Agent call `action-agent_ceg_mb`) creates or links a principal's account. `principal` is `{ name, taxNumber, invoicePrefix, zip, city, address, email, postalAddress?, bankName?, bankAccount?, replyToEmail?, cashAccountingFrom?, cashAccountingTo?, kataFrom?, kataTo? }`; `user` is the dedicated user `{ email, password (8–128 characters), firstName, lastName? }`. The tax number must pass the checksum, and the prefix is at most 5 uppercase letters or digits.
- Its `status` is `'account-created'`, `'owner-invite-resent'`, `'join-request-sent'`, `'join-request-resent'` or `'unknown'`. Every call emails the principal again, so never call it in a loop.
- `probeDelegation` signs in as the dedicated user and returns `state`: `'active'`, `'awaiting-approval'` (error 3), `'awaiting-owner-registration'` (error 250) or `'multi-account-user'` (error 164). It also re-sends the owner invitation, so call it rarely.
- `createDelegateKassza` returns a normal `Kassza` that authenticates as the dedicated user and sends the principal's prefix on every document.
- `createKasszaPool({ resolve: (principalId) => credentials | undefined })` caches clients per principal (LRU, `maxClients` default 100): `get(principalId)`, `forget(principalId)`, `clear()`, `size`.
- `suggestedPrefix(error)` reads the prefix Számlázz.hu suggests in error 356.

### `kassza/reports`

- `navDailyReports(receipts: Receipt[], { includeTest?, vatCategory?, series? }): NavReceiptReport[]` builds the NAV daily receipt report: one entry per day, receipt series and currency, with `applicableDate`, `series`, `serialNumber` (the first receipt number), `currency`, `exchangeRate`, `vatCategories: [{ vat, saleDocument, modifyingDocument }]`, `total`, `numberOfSaleDocument`, `numberOfModifyingDocument`, `receiptNumbers`. Test-account receipts are skipped unless `includeTest`.
- `dailyClose(receipts, { includeTest? })` returns per-day totals by payment method and VAT rate.
- `navVatCategory(vat)` maps a VAT rate to the NAV category (`0%`, `5%`, `18%`, `27%`, `Alanyi adómentes`, `Egyéb`); `describeNavReport(report)` gives a one-line Hungarian summary.

### `kassza/nav`

```ts
const nav = createNavReceiptClient({
  environment: 'test' | 'production',
  login, password | passwordHash, signatureKey, taxNumber,
  softwareName?, allowWrite?: boolean, timeoutMs?, fetch?,
})
```

- Reads: `listReports({ from, to, page?, pageSize? })`, `listAllReports({ from, to })`, `getReport(id)`, `listSoftware()`, `vatCategories()`, `currencies()`.
- Writes (`submitReport(data)`, `modifyReport(id, data)`, `invalidateReport(id)`, `registerSoftware(name?)`) throw `write_blocked` unless `allowWrite: true`. Never submit receipts that Számlázz.hu reports.
- `reconcileNavReports(local, remote)` compares local daily reports (for example `navDailyReports()` output) with `listAllReports()` and returns `{ matched, mismatched, missing, unexpected }`.
- `paperReceiptReport({ applicableDate, currency?, exchangeRate?, entries: [{ number, vat, gross, modifying? }] })` builds the daily report of a paper receipt pad, the one thing you submit yourself.
- Errors are `NavReceiptError` with `category`, `code`, `hint` and field errors.

### `kassza/data-link`

```ts
export const POST = dataLinkHandler({
  keys?: string[],
  verifyKey?: (key, push) => boolean | 'KEY_ERR' | 'KEY_DEL' | Promise<...>,
  onPush: (push) => void | { registrationNumber?, keyError? },
  onError?, maxBodyBytes?,
})
```

- Receives the Számlázz.hu financial data link (PUSH). Either `keys` or `verifyKey` is required, because the requests are not signed; the key is in the `X-Szamlazzhu-Key` header.
- `push.kind` is `'invoice'` or `'incoming-invoice'` (`{ id, invoice: InvoiceDetails, deleted }`), `'bank-transaction'` (`{ transaction }`) or `'receipts'` (`{ receipts: [{ receipt, issuerTaxNumber? }] }`).
- The handler builds the required response XML. Return `registrationNumber` to store your filing number for invoices. Use the `id` field as the key: the same invoice can arrive again after a payment or reversal.
- `400` for bad XML (Számlázz.hu retries), `500` when `onPush` throws (retries for 72 hours), `KEY_ERR` for an unknown key, `KEY_DEL` to switch the link off for that customer.

### `kassza/mcp` and the CLI

- `createKasszaMcpServer({ ...KasszaOptions, allowWrite?, confirmationSecret?, confirmationTtlMs? })` is a runtime-neutral Model Context Protocol server; `connect()` returns `{ handle(message), handleLine(line) }`.
- `npx kassza mcp` runs it over stdio. Tools: `preview_invoice`, `preview_receipt`, `preview_reversal`, `get_invoice`, `get_receipt`, `query_taxpayer`, `nav_daily_summary`, and with `--allow-write` (or `KASSZA_MCP_ALLOW_WRITE=1`) `create_invoice`, `create_receipt`, `reverse_invoice`, `reverse_receipt`. Write tools need the confirmation code returned by the matching preview tool for exactly the same input.
- Other commands: `kassza doctor` (Node, time zone, key, clock skew, session), `kassza verify`, `kassza xml preview <file.json>` (the XML kassza would send, with the key masked), `kassza invoice get`, `kassza receipt get`, `kassza nav summary --file receipts.json`. Exit codes: 0 success, 1 error, 2 usage.
