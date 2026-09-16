import {
  type AgentContext,
  createAgentContext,
  type RequestOptions,
  type SzamlazzOptions,
} from './core/context'
import { isSzamlazzError } from './core/errors'
import { createInvoice, previewInvoice } from './invoices/create'
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
import { getInvoicePdf, type InvoicePdf } from './invoices/pdf'
import { deleteProforma, type ProformaReference } from './invoices/proforma'
import type { InvoiceReference } from './invoices/reference'
import { type ReversedInvoice, type ReverseInvoiceInput, reverseInvoice } from './invoices/reverse'
import { createReceipt } from './receipts/create'
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
import { queryTaxpayer, type TaxpayerInfo } from './taxpayer/query-taxpayer'

export interface KasszaDefaults {
  readonly invoice?: InvoiceDefaults
  readonly receipt?: ReceiptDefaults
}

export interface KasszaOptions extends SzamlazzOptions {
  readonly defaults?: KasszaDefaults
}

export interface InvoicesApi {
  create(input: CreateInvoiceInput, options?: RequestOptions): Promise<CreatedInvoice>
  preview(input: CreateInvoiceInput, options?: RequestOptions): Promise<InvoicePreview>
  reverse(input: ReverseInvoiceInput, options?: RequestOptions): Promise<ReversedInvoice>
  registerPayment(input: RegisterPaymentInput, options?: RequestOptions): Promise<RegisteredPayment>
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
  reverse(input: ReverseReceiptInput | string, options?: RequestOptions): Promise<Receipt>
  get(input: GetReceiptInput | string, options?: RequestOptions): Promise<Receipt>
  find(input: GetReceiptInput | string, options?: RequestOptions): Promise<Receipt | null>
  send(input: SendReceiptInput, options?: RequestOptions): Promise<void>
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
}

const CREDENTIAL_PROBE_INVOICE_NUMBER = 'KASSZA-CREDENTIAL-PROBE-0'

async function nullIfNotFound<T>(promise: Promise<T>): Promise<T | null> {
  try {
    return await promise
  } catch (error) {
    if (isSzamlazzError(error) && (error.isNotFound || error.code === 7)) return null
    throw error
  }
}

function createInvoicesApi(ctx: AgentContext, defaults: InvoiceDefaults): InvoicesApi {
  return {
    create: (input, options) => createInvoice(ctx, defaults, input, options),
    preview: (input, options) => previewInvoice(ctx, defaults, input, options),
    reverse: (input, options) => reverseInvoice(ctx, input, options),
    registerPayment: (input, options) => registerPayment(ctx, input, options),
    clearPayments: (input, options) => clearPayments(ctx, input, options),
    getPdf: (reference, options) => getInvoicePdf(ctx, reference, options),
    get: (reference, query, options) => getInvoice(ctx, reference, query, options),
    find: (reference, query, options) => nullIfNotFound(getInvoice(ctx, reference, query, options)),
    deleteProforma: (reference, options) => deleteProforma(ctx, reference, options),
  }
}

function createReceiptsApi(ctx: AgentContext, defaults: ReceiptDefaults): ReceiptsApi {
  return {
    create: (input, options) => createReceipt(ctx, defaults, input, options),
    reverse: (input, options) => reverseReceipt(ctx, input, options),
    get: (input, options) => getReceipt(ctx, input, options),
    find: (input, options) => nullIfNotFound(getReceipt(ctx, input, options)),
    send: (input, options) => sendReceipt(ctx, input, options),
  }
}

export function createKassza(options: KasszaOptions = {}): Kassza {
  const ctx = createAgentContext(options)
  return {
    invoices: createInvoicesApi(ctx, options.defaults?.invoice ?? {}),
    receipts: createReceiptsApi(ctx, options.defaults?.receipt ?? {}),
    taxpayer: {
      query: (taxNumber, requestOptions) => queryTaxpayer(ctx, taxNumber, requestOptions),
    },
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
  }
}
