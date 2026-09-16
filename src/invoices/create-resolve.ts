import { MAX_INVOICE_ATTACHMENTS } from '../core/actions'
import { encodeUtf8 } from '../core/binary'
import type { AgentAttachment } from '../core/context'
import { addBudapestDays, type DateInput, toAgentDate } from '../core/dates'
import { SzamlazzError } from '../core/errors'
import { calculateInvoiceItem, type ItemAmounts } from '../money/items'
import { isHuf, type VatRate } from '../money/vat'
import {
  type CreatedInvoiceItem,
  type CreateInvoiceInput,
  INVOICE_LANGUAGES,
  INVOICE_TEMPLATES,
  INVOICE_TYPES,
  type InvoiceDefaults,
  type InvoiceItemInput,
  type InvoiceLanguage,
  type InvoiceSeller,
  type InvoiceTemplate,
  type InvoiceType,
  type Waybill,
} from './create-types'

export const MAX_ATTACHMENT_BYTES: number = 2 * 1024 * 1024
export const MNB_BANK = 'MNB'

const SIMPLE_ITEMS_MAX = 2
const SIMPLE_ITEMS_FINAL_MAX = 4
const SIMPLE_ITEMS_VAT_RATES: ReadonlySet<VatRate> = new Set<VatRate>([
  0,
  5,
  18,
  27,
  'TAM',
  'AAM',
  'K.AFA',
  'F.AFA',
])
const LANGUAGES: ReadonlySet<string> = new Set(INVOICE_LANGUAGES)
const TEMPLATES: ReadonlySet<string> = new Set(INVOICE_TEMPLATES)
const TYPES: ReadonlySet<string> = new Set(INVOICE_TYPES)

export interface ResolvedItem {
  readonly input: InvoiceItemInput
  readonly unit: string
  readonly amounts: CreatedInvoiceItem
}

export interface ResolvedInvoice {
  readonly input: CreateInvoiceInput
  readonly type: InvoiceType
  readonly issueDate: string
  readonly fulfillmentDate: string
  readonly dueDate: string
  readonly paymentMethod: string
  readonly currency: string
  readonly language: InvoiceLanguage
  readonly exchangeBank: string | undefined
  readonly exchangeRate: number | undefined
  readonly prefix: string | undefined
  readonly eInvoice: boolean
  readonly downloadPdf: boolean
  readonly template: InvoiceTemplate | undefined
  readonly simpleItems: boolean | undefined
  readonly euVat: boolean | undefined
  readonly logoExtra: string | undefined
  readonly aggregator: string | undefined
  readonly guardian: boolean | undefined
  readonly articleIdentifierInvoice: boolean | undefined
  readonly seller: InvoiceSeller
  readonly sendEmail: boolean
  readonly items: readonly ResolvedItem[]
  readonly attachments: readonly AgentAttachment[]
}

export function invalid(message: string, cause?: unknown): SzamlazzError {
  return new SzamlazzError(message, { category: 'validation', cause })
}

export function presentText(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value
}

export function agentDate(value: DateInput, field: string): string {
  try {
    return toAgentDate(value)
  } catch (error) {
    throw invalid(`A(z) ${field} mező nem érvényes dátum: ${String(value)}`, error)
  }
}

export function optionalAgentDate(value: DateInput | undefined, field: string): string | undefined {
  return value === undefined ? undefined : agentDate(value, field)
}

function requireText(value: string | undefined, message: string): void {
  if (typeof value !== 'string' || value.trim() === '') throw invalid(message)
}

function assertNonNegativeInteger(value: number | undefined, field: string): void {
  if (value === undefined) return
  if (!Number.isInteger(value) || value < 0) {
    throw invalid(`A(z) ${field} mező nemnegatív egész szám legyen, kapott: ${value}`)
  }
}

function assertFinite(value: number | undefined, field: string): void {
  if (value !== undefined && !Number.isFinite(value)) {
    throw invalid(`A(z) ${field} mező nem érvényes szám: ${value}`)
  }
}

function mergeSeller(defaults: InvoiceSeller = {}, input: InvoiceSeller = {}): InvoiceSeller {
  return {
    bank: input.bank ?? defaults.bank,
    bankAccount: input.bankAccount ?? defaults.bankAccount,
    emailReplyTo: input.emailReplyTo ?? defaults.emailReplyTo,
    emailSubject: input.emailSubject ?? defaults.emailSubject,
    emailText: input.emailText ?? defaults.emailText,
    signatoryName: input.signatoryName ?? defaults.signatoryName,
  }
}

function resolveType(input: CreateInvoiceInput): InvoiceType {
  const type = input.type ?? 'invoice'
  if (!TYPES.has(type)) throw invalid(`Ismeretlen bizonylattípus: ${String(type)}`)
  if (input.type === 'corrective') {
    requireText(
      input.correctedInvoiceNumber,
      'Helyesbítő számlához add meg a helyesbített számla számát (correctedInvoiceNumber).',
    )
  }
  if (input.type === 'final' && !presentText(input.advanceInvoiceNumber)) {
    requireText(
      input.orderNumber,
      'Végszámlához add meg az előlegszámla számát (advanceInvoiceNumber) vagy az előlegszámla rendelésszámát (orderNumber).',
    )
  }
  return type
}

interface ResolvedDates {
  readonly issueDate: string
  readonly fulfillmentDate: string
  readonly dueDate: string
}

function resolveDates(
  defaults: InvoiceDefaults,
  input: CreateInvoiceInput,
  now: Date,
): ResolvedDates {
  if (input.dueDate !== undefined && input.paymentDueInDays !== undefined) {
    throw invalid('A dueDate és a paymentDueInDays közül csak az egyiket add meg.')
  }
  const issueDate = optionalAgentDate(input.issueDate, 'issueDate') ?? agentDate(now, 'now')
  const fulfillmentDate = optionalAgentDate(input.fulfillmentDate, 'fulfillmentDate') ?? issueDate
  const explicitDue = optionalAgentDate(input.dueDate, 'dueDate')
  if (explicitDue !== undefined) return { issueDate, fulfillmentDate, dueDate: explicitDue }
  const days = input.paymentDueInDays ?? defaults.paymentDueInDays ?? 0
  assertNonNegativeInteger(days, 'paymentDueInDays')
  const dueDate = addBudapestDays(new Date(`${issueDate}T12:00:00Z`), days)
  return { issueDate, fulfillmentDate, dueDate }
}

interface ResolvedCurrency {
  readonly currency: string
  readonly exchangeBank: string | undefined
  readonly exchangeRate: number | undefined
}

function resolveCurrency(defaults: InvoiceDefaults, input: CreateInvoiceInput): ResolvedCurrency {
  const currency = presentText(input.currency) ?? presentText(defaults.currency) ?? 'HUF'
  const exchangeRate = input.exchangeRate
  if (isHuf(currency)) {
    if (exchangeRate !== undefined || presentText(input.exchangeBank) !== undefined) {
      throw invalid('Forintos számlán nem adható meg árfolyam (exchangeRate, exchangeBank).')
    }
    return { currency, exchangeBank: undefined, exchangeRate: undefined }
  }
  if (exchangeRate !== undefined && !(Number.isFinite(exchangeRate) && exchangeRate > 0)) {
    throw invalid(`Az árfolyam (exchangeRate) pozitív szám legyen, kapott: ${exchangeRate}`)
  }
  const exchangeBank =
    presentText(input.exchangeBank) ?? presentText(defaults.exchangeBank) ?? MNB_BANK
  if (exchangeRate === undefined && exchangeBank.trim().toUpperCase() !== MNB_BANK) {
    throw invalid(
      `Devizás számlához (${currency}) add meg az árfolyamot (exchangeRate). Árfolyam nélkül csak az MNB automatikus árfolyama használható.`,
    )
  }
  return { currency, exchangeBank, exchangeRate }
}

function resolveItems(items: readonly InvoiceItemInput[], currency: string): ResolvedItem[] {
  if (!Array.isArray(items) || items.length === 0) {
    throw invalid('A számlán legalább egy tételnek szerepelnie kell.')
  }
  return items.map((item, index) => {
    const label = `${index + 1}. tétel`
    requireText(item.name, `A(z) ${label} megnevezése (name) nem lehet üres.`)
    const unit = item.unit ?? 'db'
    requireText(unit, `A(z) ${label} mennyiségi egysége (unit) nem lehet üres.`)
    assertNonNegativeInteger(item.dataDeletionCode, `${label} dataDeletionCode`)
    assertFinite(item.marginVatBase, `${label} marginVatBase`)
    let amounts: ItemAmounts
    try {
      amounts = calculateInvoiceItem(item, currency)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw invalid(`${label} (${item.name}): ${message}`, error)
    }
    return { input: item, unit, amounts: { name: item.name, ...amounts } }
  })
}

function validateSimpleItems(type: InvoiceType, items: readonly ResolvedItem[]): void {
  if (type === 'corrective' || type === 'deliveryNote') {
    throw invalid(
      'Egyszerűsített számlakép (simpleItems) helyesbítő számlán és szállítólevélen nem használható.',
    )
  }
  const max = type === 'final' ? SIMPLE_ITEMS_FINAL_MAX : SIMPLE_ITEMS_MAX
  if (items.length > max) {
    throw invalid(`Egyszerűsített számlaképen (simpleItems) legfeljebb ${max} tétel adható meg.`)
  }
  const invalidItem = items.find((item) => !SIMPLE_ITEMS_VAT_RATES.has(item.amounts.vat))
  if (invalidItem) {
    throw invalid(
      `Egyszerűsített számlaképen (simpleItems) csak 0, 5, 18, 27, TAM, AAM, K.AFA vagy F.AFA áfakulcs használható, kapott: ${String(invalidItem.amounts.vat)}`,
    )
  }
}

function attachmentSize(content: AgentAttachment['content']): number {
  if (typeof content === 'string') return encodeUtf8(content).byteLength
  if (content instanceof Blob) return content.size
  return content.byteLength
}

function validateAttachments(
  attachments: readonly AgentAttachment[],
  sendEmail: boolean,
): readonly AgentAttachment[] {
  if (attachments.length === 0) return attachments
  if (attachments.length > MAX_INVOICE_ATTACHMENTS) {
    throw invalid(
      `Legfeljebb ${MAX_INVOICE_ATTACHMENTS} melléklet csatolható, kapott: ${attachments.length}`,
    )
  }
  if (!sendEmail) {
    throw invalid(
      'Mellékletet csak e-mail értesítővel lehet küldeni: add meg a vevő e-mail címét, és ne kapcsold ki a sendEmail beállítást.',
    )
  }
  for (const attachment of attachments) {
    requireText(attachment.filename, 'A melléklet fájlneve (filename) nem lehet üres.')
    if (attachmentSize(attachment.content) > MAX_ATTACHMENT_BYTES) {
      throw invalid(`A(z) ${attachment.filename} melléklet nagyobb 2 MB-nál.`)
    }
  }
  return attachments
}

function validateWaybill(waybill: Waybill | undefined): void {
  if (!waybill) return
  assertNonNegativeInteger(waybill.transOFlex?.packageCount, 'waybill.transOFlex.packageCount')
  assertNonNegativeInteger(waybill.sprinter?.packageCount, 'waybill.sprinter.packageCount')
  const mpl = waybill.mpl
  if (!mpl) return
  requireText(mpl.customerCode, 'Az MPL fuvarlevélhez add meg a vevőkódot (customerCode).')
  requireText(mpl.barcode, 'Az MPL fuvarlevélhez add meg a vonalkódot (barcode).')
  requireText(String(mpl.weight ?? ''), 'Az MPL fuvarlevélhez add meg a tömeget (weight).')
  assertFinite(mpl.declaredValue, 'waybill.mpl.declaredValue')
}

function resolveSendEmail(defaults: InvoiceDefaults, input: CreateInvoiceInput): boolean {
  const hasEmail = presentText(input.buyer.email) !== undefined
  if (input.buyer.sendEmail === true && !hasEmail) {
    throw invalid('A sendEmail be van kapcsolva, de a vevőnek nincs e-mail címe (buyer.email).')
  }
  if (!hasEmail) return false
  return input.buyer.sendEmail ?? defaults.sendEmail ?? true
}

function validateBuyer(input: CreateInvoiceInput): void {
  const buyer = input.buyer
  if (!buyer || typeof buyer !== 'object') throw invalid('A vevő adatai (buyer) kötelezők.')
  requireText(buyer.name, 'A vevő neve (buyer.name) nem lehet üres.')
  requireText(buyer.zip, 'A vevő irányítószáma (buyer.zip) nem lehet üres.')
  requireText(buyer.city, 'A vevő települése (buyer.city) nem lehet üres.')
  requireText(buyer.address, 'A vevő címe (buyer.address) nem lehet üres.')
}

export function resolveInvoice(
  defaults: InvoiceDefaults,
  input: CreateInvoiceInput,
  now: Date,
): ResolvedInvoice {
  validateBuyer(input)
  const type = resolveType(input)
  const language = input.language ?? defaults.language ?? 'hu'
  if (!LANGUAGES.has(language)) throw invalid(`Ismeretlen számlanyelv: ${String(language)}`)
  const template = input.template ?? defaults.template
  if (template !== undefined && !TEMPLATES.has(template)) {
    throw invalid(`Ismeretlen számlasablon: ${String(template)}`)
  }
  assertFinite(input.paymentCorrection, 'paymentCorrection')
  const currency = resolveCurrency(defaults, input)
  const dates = resolveDates(defaults, input, now)
  const items = resolveItems(input.items, currency.currency)
  const simpleItems = input.simpleItems ?? defaults.simpleItems
  if (simpleItems) validateSimpleItems(type, items)
  validateWaybill(input.waybill)
  const sendEmail = resolveSendEmail(defaults, input)
  const attachments = validateAttachments(input.attachments ?? [], sendEmail)

  return {
    input,
    type,
    ...dates,
    ...currency,
    paymentMethod:
      presentText(input.paymentMethod) ?? presentText(defaults.paymentMethod) ?? 'Átutalás',
    language,
    prefix: presentText(input.prefix) ?? presentText(defaults.prefix),
    eInvoice: input.eInvoice ?? defaults.eInvoice ?? false,
    downloadPdf: input.downloadPdf ?? defaults.downloadPdf ?? true,
    template,
    simpleItems,
    euVat: input.euVat ?? defaults.euVat,
    logoExtra: presentText(input.logoExtra) ?? presentText(defaults.logoExtra),
    aggregator: presentText(input.aggregator) ?? presentText(defaults.aggregator),
    guardian: input.guardian ?? defaults.guardian,
    articleIdentifierInvoice: input.articleIdentifierInvoice ?? defaults.articleIdentifierInvoice,
    seller: mergeSeller(defaults.seller, input.seller),
    sendEmail,
    items,
    attachments,
  }
}
