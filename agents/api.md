# kassza: API reference for coding agents

All types are exported from `kassza`, so import them instead of redefining them. Every method throws `SzamlazzError` on failure and accepts an optional last argument `{ signal?: AbortSignal }`.

## Client

```ts
import { createKassza } from 'kassza'

const kassza = createKassza({
  agentKey?: string,
  username?: string, password?: string,
  defaults?: { invoice?: InvoiceDefaults, receipt?: ReceiptDefaults },
  cookieStore?: CookieStore | false,
  timeoutMs?: number,
  maxAttempts?: number,
  retryDelayMs?: number,
  fetch?: typeof fetch,
  endpoint?: string,
  hooks?: { onRequest?, onResponse?, onError? },
})
```

- `agentKey` falls back to the `SZAMLAZZ_AGENT_KEY` environment variable.
- `username` and `password` are legacy credentials; prefer the Agent key.
- `cookieStore` defaults to an in-memory store; `false` disables session reuse.
- `timeoutMs` defaults to 60000.
- `maxAttempts` defaults to 3 and is capped at 5. It applies only to operations that are safe to retry.
- `hooks` receive events for logging. They never receive the XML payload or the key.

## Invoices: `kassza.invoices`

| Method | Returns | Retried automatically |
|---|---|---|
| `create(input: CreateInvoiceInput)` | `CreatedInvoice` | never |
| `preview(input: CreateInvoiceInput)` | `InvoicePreview` (PDF only, no document is created) | never |
| `reverse(input: string \| ReverseInvoiceOptions)` | `ReversedInvoice` | never |
| `registerPayment(input: RegisterPaymentInput)` | `RegisteredPayment` | only when `additive: false` |
| `clearPayments(input: string \| { invoiceNumber })` | `RegisteredPayment` | yes |
| `getPdf(ref: InvoiceReference)` | `InvoicePdf` | yes |
| `get(ref: InvoiceReference, { includePdf? })` | `InvoiceDetails` | yes |
| `find(ref: InvoiceReference, { includePdf? })` | `InvoiceDetails \| null` | yes |
| `deleteProforma(ref: string \| { proformaNumber } \| { orderNumber })` | `void` | never |

`InvoiceReference` is `string` (the invoice number), `{ invoiceNumber }`, `{ orderNumber }`, or `{ externalId }`. When several documents share an order number, the latest one is returned.

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

## Taxpayer: `kassza.taxpayer`

`query(taxNumber: string): TaxpayerInfo` accepts `12345678`, `12345678-2-42` or `HU12345678`.

`TaxpayerInfo` is `{ valid, name?, shortName?, taxNumber?: { taxpayerId, vatCode?, countyCode?, formatted? }, address?: TaxpayerAddress, addresses, incorporation?, infoDate? }`, and `TaxpayerAddress.formatted` looks like `'1031 Budapest, Záhony utca 7.'`.

## Other

- `kassza.verifyCredentials(): Promise<boolean>` returns `false` for a wrong key and throws for account problems.
- `kassza.resetSession()` clears the session. Call it after changing account data in Számlázz.hu.

## Subpath modules

### `kassza/testing`

```ts
createMockKassza({ defaults?, taxpayers?: Record<taxpayerId, TaxpayerInfo>, credentialsValid?, now?: () => Date }): MockKassza
```

- A `MockKassza` has the same interface as `Kassza`, plus `calls`, `invoiceRecords`, `receiptRecords`, `failNext(method, error?)` and `reset()`.
- The method names used in `calls` and `failNext` look like `'invoices.create'` and `'receipts.send'`.
- The mock runs the real validation and rounding, and throws the same error codes: 7, 335, 338 and 339.

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
- `summarizeItems(items)` returns `{ netAmount, vatAmount, grossAmount, byVat }`.
- `roundMoney(value, decimals)`, `isVatRate(value)`, `NUMERIC_VAT_RATES`, `SPECIAL_VAT_CODES`.
