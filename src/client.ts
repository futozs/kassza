import {
  type AgentContext,
  createAgentContext,
  type RequestOptions,
  type SzamlazzOptions,
} from './core/context'
import {
  type DocumentEvent,
  type DocumentEventOptions,
  type DocumentHook,
  emitDocumentEvent,
} from './core/document-events'
import { isSzamlazzError, type SzamlazzError } from './core/errors'
import type { CreateOnceOptions } from './core/once'
import { guardOnce, type OnceGuard } from './core/once-guard'
import type { KeyValueStore } from './core/store'
import { createInvoice, previewInvoice } from './invoices/create'
import { createInvoiceOnce, type InvoiceOnceResult } from './invoices/create-once'
import type {
  CreatedInvoice,
  CreateInvoiceInput,
  InvoiceDefaults,
  InvoicePreview,
} from './invoices/create-types'
import { type GetInvoiceOptions, getInvoice, type InvoiceDetails } from './invoices/get'
import {
  type ClearPaymentsInput,
  clearPayments,
  type RegisteredPayment,
  type RegisterPaymentInput,
  registerPayment,
} from './invoices/payment'
import {
  type RegisteredPaymentOnce,
  type RegisterPaymentOnceInput,
  registerPaymentOnce,
} from './invoices/payment-once'
import { getInvoicePdf, type InvoicePdf } from './invoices/pdf'
import { deleteProforma, type ProformaReference } from './invoices/proforma'
import type { InvoiceReference } from './invoices/reference'
import { type ReversedInvoice, type ReverseInvoiceInput, reverseInvoice } from './invoices/reverse'
import { type IssuedDocument, type IssueForPaymentOptions, issueForPayment } from './payments/issue'
import type { PaymentEvent } from './payments/types'
import {
  type ConvertedReceipt,
  type ConvertReceiptInput,
  convertReceiptToInvoice,
} from './receipts/convert'
import { createReceipt } from './receipts/create'
import { createReceiptOnce, type ReceiptOnceResult } from './receipts/create-once'
import { getReceipt } from './receipts/get'
import { reverseReceipt } from './receipts/reverse'
import { sendReceipt } from './receipts/send'
import type {
  CreateReceiptInput,
  GetReceiptInput,
  Receipt,
  ReceiptDefaults,
  ReverseReceiptInput,
  SendReceiptInput,
} from './receipts/types'
import { cachedTaxpayerQuery, type TaxpayerCacheOptions } from './taxpayer/cache'
import { queryTaxpayer, type TaxpayerInfo } from './taxpayer/query-taxpayer'

export interface KasszaDefaults {
  readonly invoice?: InvoiceDefaults
  readonly receipt?: ReceiptDefaults
}

export interface KasszaOptions extends SzamlazzOptions {
  readonly defaults?: KasszaDefaults
  readonly createOnceLock?: KeyValueStore | undefined
  readonly taxpayerCache?: TaxpayerCacheOptions | undefined
}

export interface InvoicesApi {
  create(input: CreateInvoiceInput, options?: RequestOptions): Promise<CreatedInvoice>
  createOnce(input: CreateInvoiceInput, options?: CreateOnceOptions): Promise<InvoiceOnceResult>
  preview(input: CreateInvoiceInput, options?: RequestOptions): Promise<InvoicePreview>
  reverse(input: ReverseInvoiceInput, options?: RequestOptions): Promise<ReversedInvoice>
  registerPayment(input: RegisterPaymentInput, options?: RequestOptions): Promise<RegisteredPayment>
  registerPaymentOnce(
    input: RegisterPaymentOnceInput,
    options?: CreateOnceOptions,
  ): Promise<RegisteredPaymentOnce>
  clearPayments(input: ClearPaymentsInput, options?: RequestOptions): Promise<RegisteredPayment>
  getPdf(reference: InvoiceReference, options?: RequestOptions): Promise<InvoicePdf>
  get(
    reference: InvoiceReference,
    query?: GetInvoiceOptions,
    options?: RequestOptions,
  ): Promise<InvoiceDetails>
  find(
    reference: InvoiceReference,
    query?: GetInvoiceOptions,
    options?: RequestOptions,
  ): Promise<InvoiceDetails | null>
  deleteProforma(reference: ProformaReference, options?: RequestOptions): Promise<void>
}

export interface ReceiptsApi {
  create(input: CreateReceiptInput, options?: RequestOptions): Promise<Receipt>
  createOnce(input: CreateReceiptInput, options?: CreateOnceOptions): Promise<ReceiptOnceResult>
  reverse(input: ReverseReceiptInput | string, options?: RequestOptions): Promise<Receipt>
  get(input: GetReceiptInput | string, options?: RequestOptions): Promise<Receipt>
  find(input: GetReceiptInput | string, options?: RequestOptions): Promise<Receipt | null>
  send(input: SendReceiptInput, options?: RequestOptions): Promise<void>
  convertToInvoice(
    input: ConvertReceiptInput,
    options?: CreateOnceOptions,
  ): Promise<ConvertedReceipt>
}

export interface TaxpayerApi {
  query(taxNumber: string, options?: RequestOptions): Promise<TaxpayerInfo>
}

export interface Kassza {
  readonly invoices: InvoicesApi
  readonly receipts: ReceiptsApi
  readonly taxpayer: TaxpayerApi
  verifyCredentials(options?: RequestOptions): Promise<boolean>
  resetSession(): Promise<void>
  resetAttempts(target: SzamlazzError | string): Promise<void>
  issueForPayment(payment: PaymentEvent, options?: IssueForPaymentOptions): Promise<IssuedDocument>
}

const CREDENTIAL_PROBE_INVOICE_NUMBER = 'KASSZA-CREDENTIAL-PROBE-0'

export async function nullIfNotFound<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise
  } catch (error) {
    if (isSzamlazzError(error) && (error.isNotFound || error.code === 7)) return null
    throw error
  }
}

export function attemptKeyOf(target: SzamlazzError | string): string {
  if (typeof target === 'string') return target
  const key = target.details?.attemptKey
  if (key === undefined) {
    throw new TypeError(
      'A resetAttempts egy attempt_limit hibát vagy annak details.attemptKey kulcsát várja.',
    )
  }
  return key
}

function invoiceNumberOf(input: ReverseInvoiceInput): string {
  return typeof input === 'string' ? input : input.invoiceNumber
}

function receiptNumberOf(input: ReverseReceiptInput | string): string {
  return typeof input === 'string' ? input : input.receiptNumber
}

interface DocumentEmitter {
  emit(event: DocumentEvent): Promise<void>
}

function createDocumentEmitter(
  hook: DocumentHook | undefined,
  options: DocumentEventOptions,
): DocumentEmitter {
  return { emit: (event) => emitDocumentEvent(hook, event, options) }
}

function createInvoicesApi(
  ctx: AgentContext,
  defaults: InvoiceDefaults,
  events: DocumentEmitter,
  guard: OnceGuard,
): InvoicesApi {
  const api: InvoicesApi = {
    async create(input, options) {
      const document = await createInvoice(ctx, defaults, input, options)
      await events.emit({
        kind: 'invoice',
        action: 'created',
        number: document.number,
        document,
        input,
      })
      return document
    },
    createOnce: (input, options) => createInvoiceOnce(api, input, options, guard),
    preview: (input, options) => previewInvoice(ctx, defaults, input, options),
    async reverse(input, options) {
      const document = await reverseInvoice(ctx, input, options)
      await events.emit({
        kind: 'invoice',
        action: 'reversed',
        number: document.number,
        reversedNumber: invoiceNumberOf(input),
        document,
      })
      return document
    },
    async registerPayment(input, options) {
      const document = await registerPayment(ctx, input, options)
      await events.emit({
        kind: 'invoice',
        action: 'payment',
        number: document.invoiceNumber,
        document,
      })
      return document
    },
    registerPaymentOnce: (input, options) => registerPaymentOnce(api, input, options, guard),
    async clearPayments(input, options) {
      const document = await clearPayments(ctx, input, options)
      await events.emit({
        kind: 'invoice',
        action: 'payment',
        number: document.invoiceNumber,
        document,
      })
      return document
    },
    getPdf: (reference, options) => getInvoicePdf(ctx, reference, options),
    get: (reference, query, options) => getInvoice(ctx, reference, query, options),
    find: (reference, query, options) => nullIfNotFound(getInvoice(ctx, reference, query, options)),
    deleteProforma: (reference, options) => deleteProforma(ctx, reference, options),
  }
  return api
}

function convertedJoin(result: ConvertedReceipt): ConvertedReceipt {
  return { receipt: result.receipt, invoice: { ...result.invoice, created: false } }
}

function createReceiptsApi(
  ctx: AgentContext,
  defaults: ReceiptDefaults,
  invoices: InvoicesApi,
  events: DocumentEmitter,
  guard: OnceGuard,
): ReceiptsApi {
  const api: ReceiptsApi = {
    async create(input, options) {
      const document = await createReceipt(ctx, defaults, input, options)
      await events.emit({
        kind: 'receipt',
        action: 'created',
        number: document.number,
        document,
      })
      return document
    },
    createOnce: (input, options) => createReceiptOnce(api, input, options, guard),
    async reverse(input, options) {
      const document = await reverseReceipt(ctx, input, options)
      await events.emit({
        kind: 'receipt',
        action: 'reversed',
        number: document.number,
        reversedNumber: receiptNumberOf(input),
        document,
      })
      return document
    },
    get: (input, options) => getReceipt(ctx, input, options),
    find: (input, options) => nullIfNotFound(getReceipt(ctx, input, options)),
    send: (input, options) => sendReceipt(ctx, input, options),
    convertToInvoice: (input, options = {}) =>
      guardOnce(
        guard,
        `convert:${input.receiptNumber?.trim() ?? ''}`,
        { ...options, lock: false },
        () => convertReceiptToInvoice({ receipts: api, invoices }, input, options),
        convertedJoin,
      ),
  }
  return api
}

export function onceScopeOf(ctx: AgentContext): string {
  return ctx.credentials.map((node) => `${node.name}=${String(node.content)}`).join('\n')
}

export function createKassza(options: KasszaOptions = {}): Kassza {
  const ctx = createAgentContext(options)
  const events = createDocumentEmitter(options.hooks?.onDocument, {
    mode: options.hooks?.onDocumentError,
    onWarning: options.hooks?.onWarning,
  })
  const guard: OnceGuard = { scope: onceScopeOf(ctx), lock: options.createOnceLock, warn: ctx.warn }
  const directQuery = (taxNumber: string, requestOptions?: RequestOptions) =>
    queryTaxpayer(ctx, taxNumber, requestOptions)
  const taxpayerQuery = options.taxpayerCache
    ? cachedTaxpayerQuery(directQuery, options.taxpayerCache, ctx.warn)
    : directQuery
  const invoices = createInvoicesApi(ctx, options.defaults?.invoice ?? {}, events, guard)
  const receipts = createReceiptsApi(ctx, options.defaults?.receipt ?? {}, invoices, events, guard)
  return {
    invoices,
    receipts,
    taxpayer: { query: taxpayerQuery },
    async verifyCredentials(requestOptions) {
      try {
        await getInvoicePdf(ctx, CREDENTIAL_PROBE_INVOICE_NUMBER, requestOptions)
        return true
      } catch (error) {
        if (!isSzamlazzError(error)) throw error
        if (error.category === 'auth') return false
        if (error.isNotFound || error.code === 7) return true
        throw error
      }
    },
    resetSession: () => ctx.resetSession(),
    resetAttempts: (target) => ctx.resetAttempts(attemptKeyOf(target)),
    issueForPayment: (payment, issueOptions) =>
      issueForPayment({ invoices, receipts }, payment, issueOptions),
  }
}
