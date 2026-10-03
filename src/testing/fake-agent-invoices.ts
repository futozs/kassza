import {
  childBoolean,
  childNumber,
  childText,
  findChild,
  findChildren,
  type XmlElement,
} from '../core/xml/parse'
import { el } from '../core/xml/serialize'
import { isHuf } from '../money/vat'
import {
  type FakeAgentResponse,
  type InvoiceResultFields,
  invoiceResultHeaders,
  invoiceResultResponse,
  textResponse,
  xmlDocument,
  xmlResponse,
} from './fake-agent-http'
import { renderInvoiceXml } from './fake-agent-invoice-xml'
import {
  assertInvoiceItems,
  negateItem,
  negateTotals,
  outstandingOf,
  parseItems,
  totalsOf,
  xmlFailure,
} from './fake-agent-items'
import { type FakeAgentRequest, responseVersion } from './fake-agent-request'
import {
  agentFailure,
  type FakeAgentBuyer,
  FakeAgentFailure,
  type FakeAgentInvoice,
  type FakeAgentInvoicePayment,
  type FakeAgentSeller,
  type FakeAgentState,
  type FakeInvoiceTypeCode,
  fakePdf,
  nextDocumentId,
  nextDocumentNumber,
  today,
} from './fake-agent-state'

type InvoiceFields = Omit<FakeAgentInvoice, 'id' | 'number' | 'createdAt'>

interface InvoiceRequest {
  readonly fields: InvoiceFields
  readonly preview: boolean
  readonly downloadPdf: boolean
}

const LANGUAGES: ReadonlySet<string> = new Set([
  'hu',
  'en',
  'de',
  'it',
  'ro',
  'sk',
  'hr',
  'fr',
  'es',
  'cz',
  'pl',
  'bg',
  'nl',
  'ru',
  'si',
])

const DUPLICATE_WINDOW_MS = 172_800_000
const MAX_PAYMENTS = 5
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function requiredText(parent: XmlElement | undefined, name: string, path: string): string {
  const value = childText(parent, name)
  if (value === undefined) throw xmlFailure(`hiányzik a(z) <${path}/${name}> elem.`)
  return value
}

function checkedDate(value: string, name: string, path: string): string {
  if (!DATE_PATTERN.test(value)) {
    throw xmlFailure(`a(z) <${path}/${name}> nem ÉÉÉÉ-HH-NN formátumú dátum: ${value}.`)
  }
  return value
}

function requiredDate(parent: XmlElement | undefined, name: string, path: string): string {
  return checkedDate(requiredText(parent, name, path), name, path)
}

function optionalDate(
  parent: XmlElement | undefined,
  name: string,
  path: string,
): string | undefined {
  const value = childText(parent, name)
  return value === undefined ? undefined : checkedDate(value, name, path)
}

function typeCodeOf(header: XmlElement): FakeInvoiceTypeCode {
  if (childBoolean(header, 'dijbekero') === true) return 'D'
  if (childBoolean(header, 'elolegszamla') === true) return 'ES'
  if (childBoolean(header, 'vegszamla') === true) return 'VS'
  if (childBoolean(header, 'helyesbitoszamla') === true) return 'HS'
  if (childBoolean(header, 'szallitolevel') === true) return 'SL'
  return 'SZ'
}

function seriesOf(typeCode: FakeInvoiceTypeCode, prefix: string, eInvoice: boolean): string {
  if (typeCode === 'D') return `D-${prefix}`
  if (typeCode === 'SL') return `SZL-${prefix}`
  return eInvoice ? `E-${prefix}` : prefix
}

function buyerOf(root: XmlElement): FakeAgentBuyer {
  const buyer = findChild(root, 'vevo')
  return {
    name: requiredText(buyer, 'nev', 'vevo'),
    identifier: childText(buyer, 'azonosito'),
    country: childText(buyer, 'orszag'),
    zip: requiredText(buyer, 'irsz', 'vevo'),
    city: requiredText(buyer, 'telepules', 'vevo'),
    address: requiredText(buyer, 'cim', 'vevo'),
    email: childText(buyer, 'email'),
    taxNumber: childText(buyer, 'adoszam'),
    groupTaxNumber: childText(buyer, 'csoportazonosito'),
    euTaxNumber: childText(buyer, 'adoszamEU'),
  }
}

function sellerOf(state: FakeAgentState, root: XmlElement): FakeAgentSeller {
  const seller = findChild(root, 'elado')
  const defaults = state.config.seller
  return {
    ...defaults,
    bankName: childText(seller, 'bank') ?? defaults.bankName,
    bankAccount: childText(seller, 'bankszamlaszam') ?? defaults.bankAccount,
  }
}

function resolvePrefix(state: FakeAgentState, header: XmlElement): string {
  const prefix = childText(header, 'szamlaszamElotag') ?? state.config.defaultInvoicePrefix
  const allowed = state.config.invoicePrefixes
  if (allowed !== undefined && !allowed.has(prefix)) throw agentFailure(202)
  return prefix
}

function marginVatOf(root: XmlElement, header: XmlElement): (index: number) => boolean {
  const wholeInvoice = childBoolean(header, 'arresAfa') === true
  const items = findChildren(findChild(root, 'tetelek'), 'tetel')
  return (index) => wholeInvoice || childText(items[index], 'arresAfaAlap') !== undefined
}

function readInvoiceRequest(state: FakeAgentState, root: XmlElement): InvoiceRequest {
  const settings = findChild(root, 'beallitasok')
  const header = findChild(root, 'fejlec')
  if (!header) throw xmlFailure('hiányzik a <fejlec> blokk.')
  const currency = requiredText(header, 'penznem', 'fejlec')
  const language = requiredText(header, 'szamlaNyelve', 'fejlec')
  if (!LANGUAGES.has(language)) throw xmlFailure(`ismeretlen számlanyelv: ${language}.`)
  const issueDate = requiredDate(header, 'keltDatum', 'fejlec')
  const fulfillmentDate = requiredDate(header, 'teljesitesDatum', 'fejlec')
  const dueDate = requiredDate(header, 'fizetesiHataridoDatum', 'fejlec')
  const paymentMethod = requiredText(header, 'fizmod', 'fejlec')
  const buyer = buyerOf(root)
  const items = parseItems(root, 'invoice')
  const prefix = resolvePrefix(state, header)
  assertInvoiceItems(items, currency, marginVatOf(root, header))
  const typeCode = typeCodeOf(header)
  const eInvoice = childBoolean(settings, 'eszamla') === true
  const totals = totalsOf(items)
  const foreign = !isHuf(currency)
  return {
    preview: childBoolean(header, 'elonezetpdf') === true,
    downloadPdf: childBoolean(settings, 'szamlaLetoltes') === true,
    fields: {
      prefix,
      series: seriesOf(typeCode, prefix, eInvoice),
      typeCode,
      eInvoice,
      issueDate,
      fulfillmentDate,
      dueDate,
      paymentMethod,
      language,
      currency,
      exchangeBank: foreign ? childText(header, 'arfolyamBank') : undefined,
      exchangeRate: foreign ? childNumber(header, 'arfolyam') : undefined,
      comment: childText(header, 'megjegyzes'),
      orderNumber: childText(header, 'rendelesSzam'),
      externalId: childText(settings, 'szamlaKulsoAzon'),
      referencedInvoiceNumber:
        childText(header, 'helyesbitettSzamlaszam') ?? childText(header, 'elolegSzamlaszam'),
      referencedProformaNumber: childText(header, 'dijbekeroSzamlaszam'),
      seller: sellerOf(state, root),
      buyer,
      items,
      totals,
      payments:
        childBoolean(header, 'fizetve') === true
          ? [{ date: issueDate, method: paymentMethod, amount: totals.gross }]
          : [],
      reversed: false,
      deleted: false,
    },
  }
}

function activeInvoice(state: FakeAgentState, number: string): FakeAgentInvoice | undefined {
  const invoice = state.invoices.get(number)
  return invoice && !invoice.deleted ? invoice : undefined
}

function paidAmount(invoice: FakeAgentInvoice): number {
  return invoice.payments.reduce((sum, payment) => sum + payment.amount, 0)
}

function resultFields(invoice: FakeAgentInvoice, pdf: boolean): InvoiceResultFields {
  return {
    number: invoice.number,
    netTotal: invoice.totals.net,
    grossTotal: invoice.totals.gross,
    outstanding:
      invoice.typeCode === 'SS'
        ? undefined
        : outstandingOf(invoice.totals.gross, paidAmount(invoice)),
    paymentMethod: invoice.paymentMethod,
    pdf: pdf ? fakePdf(invoice.number) : undefined,
  }
}

function invoiceResult(
  invoice: FakeAgentInvoice,
  version: number,
  downloadPdf: boolean,
): FakeAgentResponse {
  return invoiceResultResponse(resultFields(invoice, downloadPdf), version)
}

function isSameInvoice(existing: FakeAgentInvoice, fields: InvoiceFields): boolean {
  return (
    existing.buyer.name === fields.buyer.name &&
    existing.totals.gross === fields.totals.gross &&
    existing.issueDate === fields.issueDate &&
    existing.dueDate === fields.dueDate &&
    existing.fulfillmentDate === fields.fulfillmentDate
  )
}

function findOrderDuplicate(
  state: FakeAgentState,
  fields: InvoiceFields,
): FakeAgentInvoice | undefined {
  const { orderNumber, typeCode } = fields
  if (!state.config.uniqueInvoiceOrderNumbers || orderNumber === undefined || typeCode === 'HS') {
    return undefined
  }
  return [...state.invoices.values()].findLast(
    (invoice) =>
      invoice.typeCode === typeCode &&
      invoice.orderNumber === orderNumber &&
      !invoice.reversed &&
      !invoice.deleted,
  )
}

export function handleCreateInvoice(
  state: FakeAgentState,
  request: FakeAgentRequest,
): FakeAgentResponse {
  const version = responseVersion(request.root)
  const { fields, preview, downloadPdf } = readInvoiceRequest(state, request.root)
  if (preview) {
    return invoiceResultResponse(
      { netTotal: fields.totals.net, grossTotal: fields.totals.gross, pdf: fakePdf('előnézet') },
      version,
    )
  }
  const duplicate = findOrderDuplicate(state, fields)
  if (duplicate) {
    const withinWindow = state.now().getTime() - duplicate.createdAt <= DUPLICATE_WINDOW_MS
    if (!withinWindow || !isSameInvoice(duplicate, fields)) {
      throw agentFailure(
        152,
        `Már létező rendelésszám: ${fields.orderNumber}. Az ismétlődés engedélyezhető a Beállítások oldalon.`,
      )
    }
    return invoiceResult(duplicate, version, downloadPdf)
  }
  const invoice: FakeAgentInvoice = {
    ...fields,
    id: nextDocumentId(state),
    number: nextDocumentNumber(state, fields.series),
    createdAt: state.now().getTime(),
  }
  state.invoices.set(invoice.number, invoice)
  return invoiceResult(invoice, version, downloadPdf)
}

function reversalOf(
  state: FakeAgentState,
  original: FakeAgentInvoice,
  root: XmlElement,
): FakeAgentInvoice {
  const settings = findChild(root, 'beallitasok')
  const header = findChild(root, 'fejlec')
  const buyer = findChild(root, 'vevo')
  const issueDate = optionalDate(header, 'keltDatum', 'fejlec') ?? today(state)
  return {
    ...original,
    id: nextDocumentId(state),
    number: nextDocumentNumber(state, original.series),
    typeCode: 'SS',
    createdAt: state.now().getTime(),
    eInvoice: original.eInvoice || childBoolean(settings, 'eszamla') === true,
    issueDate,
    fulfillmentDate: optionalDate(header, 'teljesitesDatum', 'fejlec') ?? original.fulfillmentDate,
    dueDate: issueDate,
    comment: childText(header, 'megjegyzes'),
    externalId: childText(settings, 'szamlaKulsoAzon'),
    referencedInvoiceNumber: original.number,
    referencedProformaNumber: undefined,
    buyer: {
      ...original.buyer,
      email: childText(buyer, 'email') ?? original.buyer.email,
      taxNumber: childText(buyer, 'adoszam') ?? original.buyer.taxNumber,
    },
    items: original.items.map(negateItem),
    totals: negateTotals(original.totals),
    payments: [],
    reversed: false,
    deleted: false,
  }
}

export function handleReverseInvoice(
  state: FakeAgentState,
  request: FakeAgentRequest,
): FakeAgentResponse {
  const { root } = request
  const version = responseVersion(root)
  const downloadPdf = childBoolean(findChild(root, 'beallitasok'), 'szamlaLetoltes') === true
  const number = requiredText(findChild(root, 'fejlec'), 'szamlaszam', 'fejlec')
  const original = activeInvoice(state, number)
  if (!original) {
    throw agentFailure(7, `Hiányzó adat: sztornózandó számla (ismeretlen számlaszám: ${number}).`)
  }
  if (original.typeCode === 'D' || original.typeCode === 'SL') {
    return invoiceResult(original, version, downloadPdf)
  }
  if (original.typeCode === 'SS') {
    throw new FakeAgentFailure(undefined, `A(z) ${number} sztornó számla, nem sztornózható.`)
  }
  if (original.reversed) {
    throw new FakeAgentFailure(undefined, `A(z) ${number} számlát már sztornózták.`)
  }
  const reversal = reversalOf(state, original, root)
  state.invoices.set(original.number, { ...original, reversed: true })
  state.invoices.set(reversal.number, reversal)
  return invoiceResult(reversal, version, downloadPdf)
}

function paymentOf(element: XmlElement, index: number): FakeAgentInvoicePayment {
  const path = `kifizetes[${index + 1}]`
  const amount = childNumber(element, 'osszeg')
  if (amount === undefined) throw xmlFailure(`a(z) <${path}/osszeg> hiányzik vagy nem szám.`)
  return {
    date: requiredDate(element, 'datum', path),
    method: requiredText(element, 'jogcim', path),
    amount,
    comment: childText(element, 'leiras'),
  }
}

export function handleRegisterPayment(
  state: FakeAgentState,
  request: FakeAgentRequest,
): FakeAgentResponse {
  const { root } = request
  const settings = findChild(root, 'beallitasok')
  const number = requiredText(settings, 'szamlaszam', 'beallitasok')
  const additive = childBoolean(settings, 'additiv')
  if (additive === undefined) throw xmlFailure('hiányzik a(z) <beallitasok/additiv> elem.')
  const elements = findChildren(root, 'kifizetes')
  if (elements.length > MAX_PAYMENTS) {
    throw xmlFailure(`egy kérésben legfeljebb ${MAX_PAYMENTS} <kifizetes> elem lehet.`)
  }
  const entries = elements.map(paymentOf)
  const invoice = activeInvoice(state, number)
  if (!invoice) throw agentFailure(7, `Hiányzó adat: ismeretlen számlaszám (${number}).`)
  const updated = { ...invoice, payments: additive ? [...invoice.payments, ...entries] : entries }
  state.invoices.set(number, updated)
  const fields = { ...resultFields(updated, false), paymentMethod: undefined }
  if (responseVersion(root) === 2) return invoiceResultResponse(fields, 2)
  return textResponse('xmlagentresponse=DONE\n', invoiceResultHeaders(fields))
}

function lookupInvoice(state: FakeAgentState, root: XmlElement): FakeAgentInvoice | undefined {
  const number = childText(root, 'szamlaszam')
  if (number !== undefined) return activeInvoice(state, number)
  const orderNumber = childText(root, 'rendelesSzam')
  const externalId = childText(root, 'szamlaKulsoAzon')
  if (orderNumber === undefined && externalId === undefined) {
    throw xmlFailure('add meg a számlaszámot, a rendelésszámot vagy a külső azonosítót.')
  }
  return [...state.invoices.values()].findLast(
    (invoice) =>
      !invoice.deleted &&
      (orderNumber !== undefined
        ? invoice.orderNumber === orderNumber
        : invoice.externalId === externalId),
  )
}

export function handleGetInvoicePdf(
  state: FakeAgentState,
  request: FakeAgentRequest,
): FakeAgentResponse {
  const invoice = lookupInvoice(state, request.root)
  if (!invoice) {
    throw agentFailure(
      7,
      'Hiányzó adat: számla pdf (ismeretlen számlaszám, rendelésszám vagy külső azonosító).',
    )
  }
  return invoiceResult(invoice, responseVersion(request.root), true)
}

export function handleGetInvoiceXml(
  state: FakeAgentState,
  request: FakeAgentRequest,
): FakeAgentResponse {
  const invoice = lookupInvoice(state, request.root)
  if (!invoice) {
    throw agentFailure(
      7,
      'Hiányzó adat: számla xml (ismeretlen számlaszám, rendelésszám vagy külső azonosító).',
    )
  }
  const includePdf = childBoolean(request.root, 'pdf') === true
  return xmlResponse(renderInvoiceXml(invoice, state.config.testAccount, includePdf))
}

export function handleDeleteProforma(
  state: FakeAgentState,
  request: FakeAgentRequest,
): FakeAgentResponse {
  const header = findChild(request.root, 'fejlec')
  const number = childText(header, 'szamlaszam')
  const orderNumber = childText(header, 'rendelesszam')
  if (number === undefined && orderNumber === undefined) {
    throw xmlFailure('add meg a díjbekérő számát vagy a rendelésszámot.')
  }
  const targets = [...state.invoices.values()].filter(
    (invoice) =>
      invoice.typeCode === 'D' &&
      !invoice.deleted &&
      (number !== undefined ? invoice.number === number : invoice.orderNumber === orderNumber),
  )
  if (targets.length === 0) throw agentFailure(335)
  for (const target of targets) state.invoices.set(target.number, { ...target, deleted: true })
  return xmlResponse(xmlDocument('xmlszamladbkdelvalasz', [el('sikeres', true)]))
}
