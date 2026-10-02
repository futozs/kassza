import { SzamlazzError } from '../core/errors'
import {
  type CreateOnceOptions,
  isUncertainOutcome,
  recoverAfterFailure,
  resolveRecoveryDelay,
  unknownOutcomeError,
} from '../core/once'
import type { CreatedInvoice, CreateInvoiceInput, InvoiceType } from './create-types'
import type { GetInvoiceOptions, InvoiceDetails, InvoiceDocumentType } from './get'
import type { InvoiceReference } from './reference'

export interface InvoiceOnceApi {
  create(input: CreateInvoiceInput, options?: CreateOnceOptions): Promise<CreatedInvoice>
  find(
    reference: InvoiceReference,
    query?: GetInvoiceOptions,
    options?: CreateOnceOptions,
  ): Promise<InvoiceDetails | null>
}

export interface InvoiceOnceResult {
  readonly number: string
  readonly created: boolean
  readonly externalId: string
  readonly invoice?: CreatedInvoice | undefined
  readonly details?: InvoiceDetails | undefined
}

const EXTERNAL_ID_SUFFIXES: Readonly<Record<InvoiceType, string>> = {
  invoice: '',
  proforma: '/D',
  advance: '/E',
  final: '/V',
  corrective: '/H',
  deliveryNote: '/SZL',
}

export function invoiceOnceExternalId(type: InvoiceType, orderNumber: string): string {
  return `${orderNumber}${EXTERNAL_ID_SUFFIXES[type]}`
}

function requireOrderNumber(input: CreateInvoiceInput): string {
  const orderNumber = input.orderNumber?.trim()
  if (!orderNumber) {
    throw new SzamlazzError(
      'A createOnce-hoz add meg a rendelésszámot (orderNumber), ez azonosítja a bizonylatot.',
      { category: 'validation' },
    )
  }
  return orderNumber
}

function sameDocumentType(found: InvoiceDocumentType, requested: InvoiceType): boolean {
  return found === requested || found === 'reversal' || found === 'unknown'
}

async function lookup(
  api: InvoiceOnceApi,
  externalId: string,
  orderNumber: string,
  type: InvoiceType,
  options: CreateOnceOptions,
): Promise<InvoiceDetails | null> {
  const query = { includePdf: false }
  const byExternalId = await api.find({ externalId }, query, options)
  if (byExternalId) return byExternalId
  if (options.matchOrderNumber === false) return null
  const byOrderNumber = await api.find({ orderNumber }, query, options)
  if (byOrderNumber && sameDocumentType(byOrderNumber.header.type, type)) return byOrderNumber
  return null
}

function existingResult(
  details: InvoiceDetails,
  externalId: string,
  created: boolean,
): InvoiceOnceResult {
  return { number: details.header.number, created, externalId, details }
}

export async function createInvoiceOnce(
  api: InvoiceOnceApi,
  input: CreateInvoiceInput,
  options: CreateOnceOptions = {},
): Promise<InvoiceOnceResult> {
  const orderNumber = requireOrderNumber(input)
  const type: InvoiceType = input.type ?? 'invoice'
  const externalId = input.externalId?.trim() || invoiceOnceExternalId(type, orderNumber)
  const delayMs = resolveRecoveryDelay(options.recoveryDelayMs)

  if (options.lookupFirst !== false) {
    const existing = await lookup(api, externalId, orderNumber, type, options)
    if (existing) return existingResult(existing, externalId, false)
  }

  try {
    const invoice = await api.create({ ...input, orderNumber, externalId }, options)
    return { number: invoice.number, created: true, externalId, invoice }
  } catch (error) {
    if (!isUncertainOutcome(error)) throw error
    const recovered = await recoverAfterFailure(
      () => lookup(api, externalId, orderNumber, type, options),
      delayMs,
      options.signal,
    )
    if (recovered) return existingResult(recovered, externalId, error.category !== 'duplicate')
    if (error.category === 'duplicate') throw error
    throw unknownOutcomeError(error, `${orderNumber} rendelés`)
  }
}
