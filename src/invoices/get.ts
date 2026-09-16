import type { AgentContext, RequestOptions } from '../core/context'
import type { SzamlazzError } from '../core/errors'
import {
  type AgentResponse,
  parseResponseXml,
  throwIfHeaderError,
  throwIfHttpError,
  throwIfTextError,
  throwIfXmlFailure,
  unexpectedResponse,
} from '../core/response'
import {
  childBoolean,
  childNumber,
  childText,
  findChild,
  findChildren,
  type XmlElement,
} from '../core/xml/parse'
import { buildXmlDocument, optionalEl, type XmlNode } from '../core/xml/serialize'
import {
  AGENT_XSD_BASE_URL,
  decodeResponsePdf,
  type InvoiceReference,
  referenceValue,
  resolveInvoiceReference,
} from './reference'

export interface GetInvoiceOptions {
  readonly includePdf?: boolean | undefined
}

export type InvoiceDocumentType =
  | 'invoice'
  | 'proforma'
  | 'advance'
  | 'final'
  | 'corrective'
  | 'reversal'
  | 'deliveryNote'
  | 'unknown'

export const INVOICE_DOCUMENT_TYPE_CODES: Readonly<
  Record<Exclude<InvoiceDocumentType, 'unknown'>, string>
> = {
  invoice: 'SZ',
  proforma: 'D',
  advance: 'ES',
  final: 'VS',
  corrective: 'HS',
  reversal: 'SS',
  deliveryNote: 'SL',
}

export interface InvoiceDetailsAddress {
  readonly name?: string | undefined
  readonly country?: string | undefined
  readonly zip?: string | undefined
  readonly city?: string | undefined
  readonly address?: string | undefined
}

export interface InvoiceDetailsBank {
  readonly name?: string | undefined
  readonly accountNumber?: string | undefined
}

export interface InvoiceDetailsSeller {
  readonly id?: number | undefined
  readonly name: string
  readonly address?: InvoiceDetailsAddress | undefined
  readonly postalAddress?: InvoiceDetailsAddress | undefined
  readonly taxNumber?: string | undefined
  readonly groupTaxNumber?: string | undefined
  readonly euTaxNumber?: string | undefined
  readonly bank?: InvoiceDetailsBank | undefined
}

export interface InvoiceDetailsHeader {
  readonly id?: number | undefined
  readonly number: string
  readonly economicEventId?: number | undefined
  readonly sourceSystem?: number | undefined
  readonly registrationNumber?: string | undefined
  readonly type: InvoiceDocumentType
  readonly typeCode: string
  readonly eInvoice: boolean
  readonly appearanceCode?: number | undefined
  readonly referencedInvoiceNumber?: string | undefined
  readonly referencedProformaNumber?: string | undefined
  readonly issueDate: string
  readonly fulfillmentDate?: string | undefined
  readonly dueDate?: string | undefined
  readonly paymentMethod?: string | undefined
  readonly unifiedPaymentMethod?: string | undefined
  readonly cash?: boolean | undefined
  readonly orderNumber?: string | undefined
  readonly language?: string | undefined
  readonly currency?: string | undefined
  readonly exchangeBank?: string | undefined
  readonly exchangeRate?: number | undefined
  readonly comment?: string | undefined
  readonly vatType?: string | undefined
  readonly cashAccounting?: boolean | undefined
  readonly kata?: boolean | undefined
  readonly kataLedger?: boolean | undefined
  readonly email?: string | undefined
  readonly test?: boolean | undefined
  readonly reversed?: boolean | undefined
}

export interface InvoiceDetailsBuyerLedger {
  readonly ledgerAccount?: string | undefined
  readonly buyerId?: string | undefined
  readonly bookingDate?: string | undefined
  readonly continuousFulfillment?: boolean | undefined
  readonly settlementPeriodStart?: string | undefined
  readonly settlementPeriodEnd?: string | undefined
}

export interface InvoiceDetailsBuyer {
  readonly id?: number | undefined
  readonly name: string
  readonly identifier?: string | undefined
  readonly address?: InvoiceDetailsAddress | undefined
  readonly postalAddress?: InvoiceDetailsAddress | undefined
  readonly email?: string | undefined
  readonly taxNumber?: string | undefined
  readonly groupTaxNumber?: string | undefined
  readonly euTaxNumber?: string | undefined
  readonly location?: number | undefined
  readonly privatePerson?: boolean | undefined
  readonly ledger?: InvoiceDetailsBuyerLedger | undefined
}

export interface InvoiceDetailsItemLedger {
  readonly revenueLedgerAccount?: string | undefined
  readonly vatLedgerAccount?: string | undefined
  readonly economicEvent?: string | undefined
  readonly vatEconomicEvent?: string | undefined
  readonly settlementPeriodStart?: string | undefined
  readonly settlementPeriodEnd?: string | undefined
}

export interface InvoiceDetailsItem {
  readonly name: string
  readonly identifier?: string | undefined
  readonly quantity: number
  readonly unit?: string | undefined
  readonly netUnitPrice: number
  readonly vat: number
  readonly vatCode?: string | undefined
  readonly netAmount: number
  readonly marginVatBase?: number | undefined
  readonly vatAmount: number
  readonly grossAmount: number
  readonly comment?: string | undefined
  readonly position?: number | undefined
  readonly ledger?: InvoiceDetailsItemLedger | undefined
}

export interface InvoiceDetailsFinancialItem {
  readonly name: string
  readonly vat: number
  readonly vatCode?: string | undefined
  readonly netAmount: number
  readonly vatAmount: number
  readonly grossAmount: number
  readonly settlementPeriodStart?: string | undefined
  readonly settlementPeriodEnd?: string | undefined
  readonly vatDeduction?: number | undefined
  readonly labels: readonly string[]
}

export interface InvoiceDetailsVatTotal {
  readonly vat: number
  readonly vatCode?: string | undefined
  readonly netAmount: number
  readonly vatAmount: number
  readonly grossAmount: number
}

export interface InvoiceDetailsTotals {
  readonly netAmount: number
  readonly vatAmount: number
  readonly grossAmount: number
  readonly byVat: readonly InvoiceDetailsVatTotal[]
}

export interface InvoiceDetailsPayment {
  readonly date: string
  readonly method: string
  readonly amount: number
  readonly comment?: string | undefined
  readonly bankAccountNumber?: string | undefined
  readonly bankTransactionId?: number | undefined
  readonly exchangeRate?: number | undefined
}

export interface InvoiceDetails {
  readonly seller: InvoiceDetailsSeller
  readonly header: InvoiceDetailsHeader
  readonly buyer: InvoiceDetailsBuyer
  readonly items: readonly InvoiceDetailsItem[]
  readonly financialItems: readonly InvoiceDetailsFinancialItem[]
  readonly labels: readonly string[]
  readonly totals: InvoiceDetailsTotals
  readonly payments: readonly InvoiceDetailsPayment[]
  readonly pdf?: Uint8Array | undefined
}

export function buildGetInvoiceXml(
  credentials: readonly XmlNode[],
  reference: InvoiceReference,
  query: GetInvoiceOptions = {},
): string {
  const resolved = resolveInvoiceReference(reference)
  return buildXmlDocument({
    root: 'xmlszamlaxml',
    namespace: 'http://www.szamlazz.hu/xmlszamlaxml',
    schemaLocation: `${AGENT_XSD_BASE_URL}agentxml/xmlszamlaxml.xsd`,
    children: [
      ...credentials,
      optionalEl('szamlaszam', referenceValue(resolved, 'invoiceNumber')),
      optionalEl('rendelesSzam', referenceValue(resolved, 'orderNumber')),
      optionalEl('pdf', query.includePdf),
      optionalEl('szamlaKulsoAzon', referenceValue(resolved, 'externalId')),
    ],
  })
}

class InvoiceReader {
  private readonly response: AgentResponse

  constructor(response: AgentResponse) {
    this.response = response
  }

  missing(path: string): SzamlazzError {
    return unexpectedResponse(this.response, `Hiányzik a(z) <${path}> elem a számla XML-ből.`)
  }

  element(parent: XmlElement, name: string, path: string): XmlElement {
    const child = findChild(parent, name)
    if (!child) throw this.missing(path)
    return child
  }

  text(parent: XmlElement, name: string, path: string): string {
    const value = childText(parent, name)
    if (value === undefined) throw this.missing(`${path}/${name}`)
    return value
  }

  number(parent: XmlElement, name: string, path: string): number {
    const value = childNumber(parent, name)
    if (value === undefined) throw this.missing(`${path}/${name}`)
    return value
  }
}

function readAddress(element: XmlElement | undefined): InvoiceDetailsAddress | undefined {
  if (!element) return undefined
  return {
    name: childText(element, 'nev'),
    country: childText(element, 'orszag'),
    zip: childText(element, 'irsz'),
    city: childText(element, 'telepules'),
    address: childText(element, 'cim'),
  }
}

function readSeller(root: XmlElement, reader: InvoiceReader): InvoiceDetailsSeller {
  const seller = reader.element(root, 'szallito', 'szallito')
  const bank = findChild(seller, 'bank')
  return {
    id: childNumber(seller, 'id'),
    name: reader.text(seller, 'nev', 'szallito'),
    address: readAddress(findChild(seller, 'cim')),
    postalAddress: readAddress(findChild(seller, 'postacim')),
    taxNumber: childText(seller, 'adoszam'),
    groupTaxNumber: childText(seller, 'csoportazonosito'),
    euTaxNumber: childText(seller, 'adoszameu'),
    bank: bank && { name: childText(bank, 'nev'), accountNumber: childText(bank, 'bankszamla') },
  }
}

const DOCUMENT_TYPES_BY_CODE: ReadonlyMap<string, InvoiceDocumentType> = new Map(
  Object.entries(INVOICE_DOCUMENT_TYPE_CODES).map(([type, code]) => [
    code,
    type as InvoiceDocumentType,
  ]),
)

const E_INVOICE_CODES: ReadonlySet<number> = new Set([2, 3])

function readHeader(root: XmlElement, reader: InvoiceReader): InvoiceDetailsHeader {
  const header = reader.element(root, 'alap', 'alap')
  const typeCode = reader.text(header, 'tipus', 'alap')
  const appearanceCode = childNumber(header, 'eszamla')
  return {
    id: childNumber(header, 'id'),
    number: reader.text(header, 'szamlaszam', 'alap'),
    economicEventId: childNumber(header, 'gazdEsemAzon'),
    sourceSystem: childNumber(header, 'forras'),
    registrationNumber: childText(header, 'iktatoszam'),
    type: DOCUMENT_TYPES_BY_CODE.get(typeCode) ?? 'unknown',
    typeCode,
    eInvoice: appearanceCode !== undefined && E_INVOICE_CODES.has(appearanceCode),
    appearanceCode,
    referencedInvoiceNumber: childText(header, 'hivszamlaszam'),
    referencedProformaNumber: childText(header, 'hivdijbekszam'),
    issueDate: reader.text(header, 'kelt', 'alap'),
    fulfillmentDate: childText(header, 'telj'),
    dueDate: childText(header, 'fizh'),
    paymentMethod: childText(header, 'fizmod'),
    unifiedPaymentMethod: childText(header, 'fizmodunified'),
    cash: childBoolean(header, 'keszpenz'),
    orderNumber: childText(header, 'rendelesszam'),
    language: childText(header, 'nyelv'),
    currency: childText(header, 'devizanem'),
    exchangeBank: childText(header, 'devizabank'),
    exchangeRate: childNumber(header, 'devizaarf'),
    comment: childText(header, 'megjegyzes'),
    vatType: childText(header, 'afatipus'),
    cashAccounting: childBoolean(header, 'penzforg'),
    kata: childBoolean(header, 'kata'),
    kataLedger: childBoolean(header, 'katafokonyv'),
    email: childText(header, 'email'),
    test: childBoolean(header, 'teszt'),
    reversed: childBoolean(header, 'sztornozott'),
  }
}

function readBuyerLedger(element: XmlElement | undefined): InvoiceDetailsBuyerLedger | undefined {
  if (!element) return undefined
  return {
    ledgerAccount: childText(element, 'vevo'),
    buyerId: childText(element, 'vevoazon'),
    bookingDate: childText(element, 'datum'),
    continuousFulfillment: childBoolean(element, 'folyamatostelj'),
    settlementPeriodStart: childText(element, 'elszDatTol') ?? childText(element, 'elszdattol'),
    settlementPeriodEnd: childText(element, 'elszDatIg') ?? childText(element, 'elszdatig'),
  }
}

function readBuyer(root: XmlElement, reader: InvoiceReader): InvoiceDetailsBuyer {
  const buyer = reader.element(root, 'vevo', 'vevo')
  return {
    id: childNumber(buyer, 'id'),
    name: reader.text(buyer, 'nev', 'vevo'),
    identifier: childText(buyer, 'azonosito'),
    address: readAddress(findChild(buyer, 'cim')),
    postalAddress: readAddress(findChild(buyer, 'postacim')),
    email: childText(buyer, 'email'),
    taxNumber: childText(buyer, 'adoszam'),
    groupTaxNumber: childText(buyer, 'csoportazonosito'),
    euTaxNumber: childText(buyer, 'adoszameu'),
    location: childNumber(buyer, 'lokacio'),
    privatePerson: childBoolean(buyer, 'privatePersonIndicator'),
    ledger: readBuyerLedger(findChild(buyer, 'fokonyv')),
  }
}

function readItemLedger(element: XmlElement | undefined): InvoiceDetailsItemLedger | undefined {
  if (!element) return undefined
  return {
    revenueLedgerAccount: childText(element, 'arbevetel'),
    vatLedgerAccount: childText(element, 'afa'),
    economicEvent: childText(element, 'gazdasagiesemeny'),
    vatEconomicEvent: childText(element, 'gazdasagiesemenyafa'),
    settlementPeriodStart: childText(element, 'elszdattol'),
    settlementPeriodEnd: childText(element, 'elszdatig'),
  }
}

function readItem(item: XmlElement, reader: InvoiceReader): InvoiceDetailsItem {
  const path = 'tetelek/tetel'
  return {
    name: reader.text(item, 'nev', path),
    identifier: childText(item, 'azonosito'),
    quantity: reader.number(item, 'mennyiseg', path),
    unit: childText(item, 'mennyisegiegyseg'),
    netUnitPrice: reader.number(item, 'nettoegysegar', path),
    vat: reader.number(item, 'afakulcs', path),
    vatCode: childText(item, 'afatipus'),
    netAmount: reader.number(item, 'netto', path),
    marginVatBase: childNumber(item, 'arresafaalap'),
    vatAmount: reader.number(item, 'afa', path),
    grossAmount: reader.number(item, 'brutto', path),
    comment: childText(item, 'megjegyzes'),
    position: childNumber(item, 'sztetordering'),
    ledger: readItemLedger(findChild(item, 'fokonyv')),
  }
}

function readLabels(element: XmlElement | undefined): string[] {
  return findChildren(element, 'cimke').flatMap((label) => {
    const value = label.text.trim()
    return value === '' ? [] : [value]
  })
}

function readFinancialItem(item: XmlElement, reader: InvoiceReader): InvoiceDetailsFinancialItem {
  const path = 'qutetek/qutet'
  return {
    name: reader.text(item, 'nev', path),
    vat: reader.number(item, 'afakulcs', path),
    vatCode: childText(item, 'afatipus'),
    netAmount: reader.number(item, 'netto', path),
    vatAmount: reader.number(item, 'afa', path),
    grossAmount: reader.number(item, 'brutto', path),
    settlementPeriodStart: childText(item, 'elszdattol'),
    settlementPeriodEnd: childText(item, 'elszdatig'),
    vatDeduction: childNumber(item, 'afalevon'),
    labels: readLabels(findChild(item, 'cimkek')),
  }
}

function readTotals(root: XmlElement, reader: InvoiceReader): InvoiceDetailsTotals {
  const totals = reader.element(root, 'osszegek', 'osszegek')
  const total = reader.element(totals, 'totalossz', 'osszegek/totalossz')
  const path = 'osszegek/totalossz'
  return {
    netAmount: reader.number(total, 'netto', path),
    vatAmount: reader.number(total, 'afa', path),
    grossAmount: reader.number(total, 'brutto', path),
    byVat: findChildren(totals, 'afakulcsossz').map((entry) => ({
      vat: reader.number(entry, 'afakulcs', 'osszegek/afakulcsossz'),
      vatCode: childText(entry, 'afatipus'),
      netAmount: reader.number(entry, 'netto', 'osszegek/afakulcsossz'),
      vatAmount: reader.number(entry, 'afa', 'osszegek/afakulcsossz'),
      grossAmount: reader.number(entry, 'brutto', 'osszegek/afakulcsossz'),
    })),
  }
}

function readPayment(payment: XmlElement, reader: InvoiceReader): InvoiceDetailsPayment {
  const path = 'kifizetesek/kifizetes'
  return {
    date: reader.text(payment, 'datum', path),
    method: reader.text(payment, 'jogcim', path),
    amount: reader.number(payment, 'osszeg', path),
    comment: childText(payment, 'megjegyzes'),
    bankAccountNumber: childText(payment, 'bankszamlaszam'),
    bankTransactionId: childNumber(payment, 'banktranzid'),
    exchangeRate: childNumber(payment, 'devizaarf'),
  }
}

export function parseInvoiceDetailsXml(root: XmlElement, response: AgentResponse): InvoiceDetails {
  const reader = new InvoiceReader(response)
  return {
    seller: readSeller(root, reader),
    header: readHeader(root, reader),
    buyer: readBuyer(root, reader),
    items: findChildren(findChild(root, 'tetelek'), 'tetel').map((item) => readItem(item, reader)),
    financialItems: findChildren(findChild(root, 'qutetek'), 'qutet').map((item) =>
      readFinancialItem(item, reader),
    ),
    labels: readLabels(findChild(root, 'cimkek')),
    totals: readTotals(root, reader),
    payments: findChildren(findChild(root, 'kifizetesek'), 'kifizetes').map((payment) =>
      readPayment(payment, reader),
    ),
    pdf: decodeResponsePdf(root, response),
  }
}

export function parseGetInvoiceResponse(response: AgentResponse): InvoiceDetails {
  throwIfHeaderError(response)
  throwIfTextError(response)
  throwIfHttpError(response)
  const root = parseResponseXml(response)
  throwIfXmlFailure(root, response)
  if (root.name !== 'szamla') {
    throw unexpectedResponse(response, 'A számla XML (<szamla>) helyett más válasz érkezett.')
  }
  return parseInvoiceDetailsXml(root, response)
}

export async function getInvoice(
  ctx: AgentContext,
  reference: InvoiceReference,
  query: GetInvoiceOptions = {},
  options: RequestOptions = {},
): Promise<InvoiceDetails> {
  const xml = buildGetInvoiceXml(ctx.credentials, reference, query)
  return ctx.execute(
    { action: 'getInvoiceXml', xml, signal: options.signal, safeToRetry: true },
    parseGetInvoiceResponse,
  )
}
