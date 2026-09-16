import type { Kassza, KasszaDefaults } from '../client'
import { toAgentDate } from '../core/dates'
import { SzamlazzError } from '../core/errors'
import { resolveInvoice } from '../invoices/create-resolve'
import type { CreatedInvoice, CreateInvoiceInput, InvoiceType } from '../invoices/create-types'
import type { InvoiceDetails, InvoiceDetailsPayment } from '../invoices/get'
import type { PaymentEntry, RegisterPaymentInput } from '../invoices/payment'
import type { InvoiceReference } from '../invoices/reference'
import { summarizeItems } from '../money/items'
import { buildCreateReceiptXml, calculateReceiptItems } from '../receipts/create'
import type { CreateReceiptInput, Receipt, SendReceiptInput } from '../receipts/types'
import type { TaxpayerInfo } from '../taxpayer/query-taxpayer'

export const MOCK_PDF: Uint8Array = new TextEncoder().encode(
  '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n',
)

export interface MockInvoiceRecord {
  readonly number: string
  readonly type: InvoiceType | 'reversal'
  readonly input: CreateInvoiceInput | undefined
  readonly details: InvoiceDetails
  payments: InvoiceDetailsPayment[]
  reversed: boolean
  deleted: boolean
}

export interface MockReceiptRecord {
  receipt: Receipt
  readonly sentTo: string[][]
}

export interface MockCall {
  readonly method: string
  readonly args: readonly unknown[]
}

export interface MockKasszaOptions {
  readonly defaults?: KasszaDefaults
  readonly taxpayers?: Readonly<Record<string, TaxpayerInfo>>
  readonly credentialsValid?: boolean
  readonly now?: () => Date
}

export interface MockKassza extends Kassza {
  readonly calls: readonly MockCall[]
  readonly invoiceRecords: ReadonlyMap<string, MockInvoiceRecord>
  readonly receiptRecords: ReadonlyMap<string, MockReceiptRecord>
  failNext(method: string, error?: SzamlazzError): void
  reset(): void
}

function notFound(code: number, message: string): SzamlazzError {
  return new SzamlazzError(`[${code}] ${message}`, { category: 'not_found', code })
}

function invoiceTypeCode(type: MockInvoiceRecord['type']): string {
  const codes: Record<MockInvoiceRecord['type'], string> = {
    invoice: 'SZ',
    proforma: 'D',
    advance: 'E',
    final: 'V',
    corrective: 'H',
    deliveryNote: 'SZL',
    reversal: 'SS',
  }
  return codes[type]
}

function referenceMatches(record: MockInvoiceRecord, reference: InvoiceReference): boolean {
  if (typeof reference === 'string') return record.number === reference
  if ('invoiceNumber' in reference) return record.number === reference.invoiceNumber
  if ('orderNumber' in reference) return record.input?.orderNumber === reference.orderNumber
  return record.input?.externalId === reference.externalId
}

function normalizePayments(input: RegisterPaymentInput, today: string): PaymentEntry[] {
  if ('payments' in input) return [...input.payments]
  return [
    {
      amount: input.amount,
      method: input.method ?? 'átutalás',
      date: input.date ?? today,
      description: input.description,
    },
  ]
}

export function createMockKassza(options: MockKasszaOptions = {}): MockKassza {
  const now = options.now ?? (() => new Date())
  const calls: MockCall[] = []
  const failures = new Map<string, SzamlazzError>()
  const invoices = new Map<string, MockInvoiceRecord>()
  const receipts = new Map<string, MockReceiptRecord>()
  const sequences = new Map<string, number>()
  let receiptId = 0

  const nextNumber = (prefix: string): string => {
    const year = toAgentDate(now()).slice(0, 4)
    const key = `${prefix}-${year}`
    const next = (sequences.get(key) ?? 0) + 1
    sequences.set(key, next)
    return `${key}-${next}`
  }

  const record = (method: string, args: readonly unknown[]): void => {
    calls.push({ method, args })
    const failure = failures.get(method)
    if (failure) {
      failures.delete(method)
      throw failure
    }
  }

  const findInvoice = (reference: InvoiceReference): MockInvoiceRecord => {
    const matches = [...invoices.values()].filter(
      (candidate) => !candidate.deleted && referenceMatches(candidate, reference),
    )
    const found = matches.at(-1)
    if (!found)
      throw notFound(7, 'Hiányzó adat: ismeretlen számlaszám, rendelésszám vagy külső azonosító.')
    return found
  }

  const detailsOf = (found: MockInvoiceRecord, includePdf: boolean): InvoiceDetails => ({
    ...found.details,
    header: { ...found.details.header, reversed: found.reversed },
    payments: [...found.payments],
    ...(includePdf ? { pdf: MOCK_PDF } : {}),
  })

  const findReceipt = (
    key:
      | string
      | { readonly receiptNumber?: string | undefined; readonly orderNumber?: string | undefined },
  ): MockReceiptRecord => {
    const entries = [...receipts.values()]
    const found =
      typeof key === 'string'
        ? receipts.get(key)
        : entries.findLast(
            (entry) =>
              (key.receiptNumber !== undefined && entry.receipt.number === key.receiptNumber) ||
              (key.orderNumber !== undefined && entry.receipt.orderNumber === key.orderNumber),
          )
    if (!found) throw notFound(339, 'A nyugtaszám nem létezik.')
    return found
  }

  const createInvoiceRecord = (input: CreateInvoiceInput): CreatedInvoice => {
    const resolved = resolveInvoice(options.defaults?.invoice ?? {}, input, now())
    const items = resolved.items.map((item) => item.amounts)
    const totals = summarizeItems(items)
    const typePrefix = resolved.type === 'proforma' ? 'D' : 'E'
    const number = nextNumber(
      resolved.prefix ? `${typePrefix}-${resolved.prefix}` : `${typePrefix}-KASSZA`,
    )
    const details: InvoiceDetails = {
      seller: { name: 'Kassza Teszt Kft.' },
      header: {
        number,
        type: resolved.type,
        typeCode: invoiceTypeCode(resolved.type),
        eInvoice: resolved.eInvoice,
        issueDate: resolved.issueDate,
        fulfillmentDate: resolved.fulfillmentDate,
        dueDate: resolved.dueDate,
        paymentMethod: resolved.paymentMethod,
        orderNumber: input.orderNumber,
        language: resolved.language,
        currency: resolved.currency,
        comment: input.comment,
        test: true,
      },
      buyer: {
        name: input.buyer.name,
        email: input.buyer.email,
        taxNumber: input.buyer.taxNumber,
        address: {
          country: input.buyer.country,
          zip: input.buyer.zip,
          city: input.buyer.city,
          address: input.buyer.address,
        },
      },
      items: resolved.items.map((item) => ({
        name: item.amounts.name,
        quantity: item.amounts.quantity,
        unit: item.unit,
        netUnitPrice: item.amounts.netUnitPrice,
        vat: typeof item.amounts.vat === 'number' ? item.amounts.vat : 0,
        vatCode: typeof item.amounts.vat === 'number' ? undefined : item.amounts.vat,
        netAmount: item.amounts.netAmount,
        vatAmount: item.amounts.vatAmount,
        grossAmount: item.amounts.grossAmount,
        comment: item.input.comment,
      })),
      financialItems: [],
      labels: [],
      totals: {
        netAmount: totals.netAmount,
        vatAmount: totals.vatAmount,
        grossAmount: totals.grossAmount,
        byVat: totals.byVat.map((bucket) => ({
          vat: typeof bucket.vat === 'number' ? bucket.vat : 0,
          vatCode: typeof bucket.vat === 'number' ? undefined : bucket.vat,
          netAmount: bucket.netAmount,
          vatAmount: bucket.vatAmount,
          grossAmount: bucket.grossAmount,
        })),
      },
      payments: [],
    }
    const paid = input.paid
      ? [{ date: resolved.issueDate, method: resolved.paymentMethod, amount: totals.grossAmount }]
      : []
    invoices.set(number, {
      number,
      type: resolved.type,
      input,
      details,
      payments: paid,
      reversed: false,
      deleted: false,
    })
    return {
      number,
      netTotal: totals.netAmount,
      grossTotal: totals.grossAmount,
      outstanding: input.paid ? 0 : totals.grossAmount,
      items,
      ...(resolved.downloadPdf ? { pdf: MOCK_PDF } : {}),
    }
  }

  const createReceiptRecord = (input: CreateReceiptInput, callId?: string): Receipt => {
    const defaults = options.defaults?.receipt ?? {}
    buildCreateReceiptXml([], defaults, input)
    if (
      callId !== undefined &&
      [...receipts.values()].some((entry) => entry.receipt.callId === callId)
    ) {
      throw new SzamlazzError('[338] A hívásazonosító már létezik.', {
        category: 'duplicate',
        code: 338,
      })
    }
    const currency = input.currency ?? defaults.currency ?? 'HUF'
    const calculated = calculateReceiptItems(input.items, currency)
    const totals = summarizeItems(calculated.map((item) => item.amounts))
    const prefix = (input.prefix ?? defaults.prefix ?? 'NY').trim()
    const paymentMethod = (input.paymentMethod ?? defaults.paymentMethod ?? '').trim()
    receiptId += 1
    const receipt: Receipt = {
      id: receiptId,
      number: nextNumber(prefix),
      callId,
      type: 'receipt',
      isReversed: false,
      issueDate: toAgentDate(now()),
      paymentMethod,
      currency,
      comment: input.comment,
      isTest: true,
      orderNumber: input.orderNumber,
      items: calculated.map((item) => ({
        name: item.input.name,
        quantity: item.amounts.quantity,
        unit: item.input.unit ?? defaults.unit ?? 'db',
        netUnitPrice: item.amounts.netUnitPrice,
        vat: item.vat,
        vatPercentage: typeof item.vat === 'number' ? item.vat : 0,
        netAmount: item.amounts.netAmount,
        vatAmount: item.amounts.vatAmount,
        grossAmount: item.amounts.grossAmount,
      })),
      payments: (input.payments ?? []).map((payment) => ({ ...payment })),
      totals: {
        netAmount: totals.netAmount,
        vatAmount: totals.vatAmount,
        grossAmount: totals.grossAmount,
        byVat: totals.byVat.map((bucket) => ({
          vat: bucket.vat,
          vatPercentage: typeof bucket.vat === 'number' ? bucket.vat : 0,
          netAmount: bucket.netAmount,
          vatAmount: bucket.vatAmount,
          grossAmount: bucket.grossAmount,
        })),
      },
    }
    receipts.set(receipt.number, { receipt, sentTo: [] })
    return (input.downloadPdf ?? defaults.downloadPdf ?? true)
      ? { ...receipt, pdf: MOCK_PDF }
      : receipt
  }

  const run = async <T>(method: string, args: readonly unknown[], fn: () => T): Promise<T> => {
    record(method, args)
    return fn()
  }

  const nullIfMissing = async <T>(promise: Promise<T>): Promise<T | null> => {
    try {
      return await promise
    } catch (error) {
      if (error instanceof SzamlazzError && error.isNotFound) return null
      throw error
    }
  }

  const getInvoice = (
    reference: InvoiceReference,
    includePdf: boolean | undefined,
  ): Promise<InvoiceDetails> =>
    run('invoices.get', [reference], () => detailsOf(findInvoice(reference), includePdf ?? false))

  const getReceipt: Kassza['receipts']['get'] = (input) =>
    run('receipts.get', [input], () => {
      const found = findReceipt(input)
      const downloadPdf = typeof input === 'string' ? true : (input.downloadPdf ?? true)
      return downloadPdf ? { ...found.receipt, pdf: MOCK_PDF } : found.receipt
    })

  return {
    calls,
    invoiceRecords: invoices,
    receiptRecords: receipts,
    failNext(method, error) {
      failures.set(
        method,
        error ??
          new SzamlazzError('Hálózati hiba a Számlázz.hu elérésekor.', { category: 'network' }),
      )
    },
    reset() {
      calls.length = 0
      failures.clear()
      invoices.clear()
      receipts.clear()
      sequences.clear()
      receiptId = 0
    },
    invoices: {
      create: (input) => run('invoices.create', [input], () => createInvoiceRecord(input)),
      preview: (input) =>
        run('invoices.preview', [input], () => {
          const resolved = resolveInvoice(options.defaults?.invoice ?? {}, input, now())
          const items = resolved.items.map((item) => item.amounts)
          const totals = summarizeItems(items)
          return {
            pdf: MOCK_PDF,
            netTotal: totals.netAmount,
            grossTotal: totals.grossAmount,
            items,
          }
        }),
      reverse: (input) =>
        run('invoices.reverse', [input], () => {
          const invoiceNumber = typeof input === 'string' ? input : input.invoiceNumber
          const original = findInvoice(invoiceNumber)
          original.reversed = true
          const number = nextNumber('E-STORNO')
          const totals = original.details.totals
          invoices.set(number, {
            number,
            type: 'reversal',
            input: undefined,
            details: {
              ...original.details,
              header: {
                ...original.details.header,
                number,
                type: 'reversal',
                typeCode: 'SS',
                referencedInvoiceNumber: invoiceNumber,
              },
              totals: {
                netAmount: -totals.netAmount,
                vatAmount: -totals.vatAmount,
                grossAmount: -totals.grossAmount,
                byVat: [],
              },
            },
            payments: [],
            reversed: false,
            deleted: false,
          })
          const downloadPdf = typeof input === 'string' || (input.downloadPdf ?? true)
          return {
            number,
            netTotal: -totals.netAmount,
            grossTotal: -totals.grossAmount,
            ...(downloadPdf ? { pdf: MOCK_PDF } : {}),
          }
        }),
      registerPayment: (input) =>
        run('invoices.registerPayment', [input], () => {
          const found = findInvoice(input.invoiceNumber)
          const today = toAgentDate(now())
          const entries = normalizePayments(input, today).map((entry) => ({
            date: toAgentDate(entry.date ?? today),
            method: entry.method,
            amount: entry.amount,
            comment: entry.description,
          }))
          found.payments = input.additive === false ? entries : [...found.payments, ...entries]
          const paid = found.payments.reduce((sum, payment) => sum + payment.amount, 0)
          return {
            invoiceNumber: found.number,
            netTotal: found.details.totals.netAmount,
            grossTotal: found.details.totals.grossAmount,
            outstanding: Math.max(0, found.details.totals.grossAmount - paid),
          }
        }),
      clearPayments: (input) =>
        run('invoices.clearPayments', [input], () => {
          const found = findInvoice(typeof input === 'string' ? input : input.invoiceNumber)
          found.payments = []
          return {
            invoiceNumber: found.number,
            netTotal: found.details.totals.netAmount,
            grossTotal: found.details.totals.grossAmount,
            outstanding: found.details.totals.grossAmount,
          }
        }),
      getPdf: (reference) =>
        run('invoices.getPdf', [reference], () => {
          const found = findInvoice(reference)
          return {
            pdf: MOCK_PDF,
            number: found.number,
            netTotal: found.details.totals.netAmount,
            grossTotal: found.details.totals.grossAmount,
          }
        }),
      get: (reference, query) => getInvoice(reference, query?.includePdf),
      find: (reference, query) => nullIfMissing(getInvoice(reference, query?.includePdf)),
      deleteProforma: (reference) =>
        run('invoices.deleteProforma', [reference], () => {
          const target: InvoiceReference =
            typeof reference === 'string'
              ? reference
              : 'proformaNumber' in reference
                ? reference.proformaNumber
                : { orderNumber: reference.orderNumber }
          const proforma = [...invoices.values()]
            .filter((candidate) => candidate.type === 'proforma' && !candidate.deleted)
            .findLast((candidate) => referenceMatches(candidate, target))
          if (!proforma) throw notFound(335, 'A hivatkozott díjbekérő nem található.')
          proforma.deleted = true
        }),
    },
    receipts: {
      create: (input) =>
        run('receipts.create', [input], () => createReceiptRecord(input, input.callId)),
      reverse: (input) =>
        run('receipts.reverse', [input], () => {
          const receiptNumber = typeof input === 'string' ? input : input.receiptNumber
          const original = findReceipt(receiptNumber)
          original.receipt = { ...original.receipt, isReversed: true }
          receiptId += 1
          const reversal: Receipt = {
            ...original.receipt,
            id: receiptId,
            number: nextNumber(`${original.receipt.number.split('-')[0] ?? 'NY'}-STORNO`),
            type: 'reversal',
            isReversed: false,
            reversedReceiptNumber: receiptNumber,
            issueDate: toAgentDate(now()),
          }
          receipts.set(reversal.number, { receipt: reversal, sentTo: [] })
          return { ...reversal, pdf: MOCK_PDF }
        }),
      get: getReceipt,
      find: (input, requestOptions) => nullIfMissing(getReceipt(input, requestOptions)),
      send: (input: SendReceiptInput) =>
        run('receipts.send', [input], () => {
          const found = findReceipt(input.receiptNumber)
          const emails =
            typeof input.emails === 'string' ? input.emails.split(/[,;]/) : [...input.emails]
          found.sentTo.push(emails.map((email) => email.trim()).filter(Boolean))
        }),
    },
    taxpayer: {
      query: (taxNumber) =>
        run('taxpayer.query', [taxNumber], () => {
          const taxpayerId = taxNumber.replace(/\D/g, '').slice(0, 8)
          return options.taxpayers?.[taxpayerId] ?? { valid: false, addresses: [] }
        }),
    },
    verifyCredentials: () => run('verifyCredentials', [], () => options.credentialsValid ?? true),
    resetSession: () => run('resetSession', [], () => undefined),
  }
}
