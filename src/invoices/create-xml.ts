import {
  buildXmlDocument,
  el,
  optionalEl,
  type XmlChild,
  type XmlNode,
} from '../core/xml/serialize'
import { formatVatRate } from '../money/vat'
import {
  optionalAgentDate,
  presentText,
  type ResolvedInvoice,
  type ResolvedItem,
  resolveInvoice,
} from './create-resolve'
import {
  type BuyerLedger,
  type CreateInvoiceInput,
  type InvoiceBuyer,
  type InvoiceDefaults,
  type InvoiceSeller,
  type ItemLedger,
  TAXPAYER_TYPE_CODES,
  type Waybill,
} from './create-types'

export const INVOICE_XML_NAMESPACE = 'http://www.szamlazz.hu/xmlszamla'
export const INVOICE_XML_SCHEMA_LOCATION =
  'https://www.szamlazz.hu/szamla/docs/xsds/agent/xmlszamla.xsd'
const RESPONSE_VERSION_XML = 2

export interface RenderInvoiceOptions {
  readonly preview?: boolean | undefined
}

function textEl(name: string, value: string | undefined): XmlNode | undefined {
  return optionalEl(name, presentText(value))
}

function settingsNode(
  credentials: readonly XmlNode[],
  invoice: ResolvedInvoice,
  preview: boolean,
): XmlNode {
  return el('beallitasok', [
    ...credentials,
    el('eszamla', invoice.eInvoice),
    el('szamlaLetoltes', preview || invoice.downloadPdf),
    el('valaszVerzio', RESPONSE_VERSION_XML),
    textEl('aggregator', invoice.aggregator),
    optionalEl('guardian', invoice.guardian),
    optionalEl('cikkazoninvoice', invoice.articleIdentifierInvoice),
    textEl('szamlaKulsoAzon', invoice.input.externalId),
  ])
}

function documentTypeNodes(invoice: ResolvedInvoice): XmlChild[] {
  const { input, type } = invoice
  return [
    type === 'advance' && el('elolegszamla', true),
    type === 'final' && el('vegszamla', true),
    input.type === 'final' && textEl('elolegSzamlaszam', input.advanceInvoiceNumber),
    type === 'corrective' && el('helyesbitoszamla', true),
    input.type === 'corrective' && textEl('helyesbitettSzamlaszam', input.correctedInvoiceNumber),
    type === 'proforma' && el('dijbekero', true),
    type === 'deliveryNote' && el('szallitolevel', true),
  ]
}

function headerNode(invoice: ResolvedInvoice, preview: boolean): XmlNode {
  const { input } = invoice
  return el('fejlec', [
    el('keltDatum', invoice.issueDate),
    el('teljesitesDatum', invoice.fulfillmentDate),
    el('fizetesiHataridoDatum', invoice.dueDate),
    el('fizmod', invoice.paymentMethod),
    el('penznem', invoice.currency),
    el('szamlaNyelve', invoice.language),
    textEl('megjegyzes', input.comment),
    textEl('arfolyamBank', invoice.exchangeBank),
    optionalEl('arfolyam', invoice.exchangeRate),
    textEl('rendelesSzam', input.orderNumber),
    textEl('dijbekeroSzamlaszam', input.proformaNumber),
    ...documentTypeNodes(invoice),
    textEl('logoExtra', invoice.logoExtra),
    textEl('szamlaszamElotag', invoice.prefix),
    optionalEl('fizetendoKorrekcio', input.paymentCorrection),
    optionalEl('fizetve', input.paid),
    optionalEl('arresAfa', input.marginVat),
    optionalEl('eusAfa', invoice.euVat),
    optionalEl('szamlaSablon', invoice.template),
    preview && el('elonezetpdf', true),
    optionalEl('simpleItems', invoice.simpleItems),
  ])
}

function sellerNode(seller: InvoiceSeller): XmlNode {
  return el('elado', [
    textEl('bank', seller.bank),
    textEl('bankszamlaszam', seller.bankAccount),
    textEl('emailReplyto', seller.emailReplyTo),
    textEl('emailTargy', seller.emailSubject),
    textEl('emailSzoveg', seller.emailText),
    textEl('alairoNeve', seller.signatoryName),
  ])
}

function buyerLedgerNode(ledger: BuyerLedger | undefined): XmlNode | undefined {
  if (!ledger) return undefined
  return optionalEl('vevoFokonyv', [
    optionalEl('konyvelesDatum', optionalAgentDate(ledger.bookingDate, 'buyer.ledger.bookingDate')),
    textEl('vevoAzonosito', ledger.buyerId),
    textEl('vevoFokonyviSzam', ledger.ledgerAccount),
    optionalEl('folyamatosTelj', ledger.continuousFulfillment),
    optionalEl(
      'elszDatumTol',
      optionalAgentDate(ledger.settlementPeriodStart, 'buyer.ledger.settlementPeriodStart'),
    ),
    optionalEl(
      'elszDatumIg',
      optionalAgentDate(ledger.settlementPeriodEnd, 'buyer.ledger.settlementPeriodEnd'),
    ),
  ])
}

function buyerNode(buyer: InvoiceBuyer, sendEmail: boolean): XmlNode {
  const taxpayerType = buyer.taxpayerType
  return el('vevo', [
    el('nev', buyer.name),
    textEl('orszag', buyer.country),
    el('irsz', buyer.zip),
    el('telepules', buyer.city),
    el('cim', buyer.address),
    textEl('email', buyer.email),
    el('sendEmail', sendEmail),
    optionalEl(
      'adoalany',
      taxpayerType === undefined ? undefined : TAXPAYER_TYPE_CODES[taxpayerType],
    ),
    textEl('adoszam', buyer.taxNumber),
    textEl('csoportazonosito', buyer.groupTaxNumber),
    textEl('adoszamEU', buyer.euTaxNumber),
    textEl('postazasiNev', buyer.postal?.name),
    textEl('postazasiOrszag', buyer.postal?.country),
    textEl('postazasiIrsz', buyer.postal?.zip),
    textEl('postazasiTelepules', buyer.postal?.city),
    textEl('postazasiCim', buyer.postal?.address),
    buyerLedgerNode(buyer.ledger),
    textEl('azonosito', buyer.identifier),
    textEl('alairoNeve', buyer.signatoryName),
    textEl('telefonszam', buyer.phone),
    textEl('megjegyzes', buyer.comment),
  ])
}

function waybillNode(waybill: Waybill | undefined): XmlNode | undefined {
  if (!waybill) return undefined
  const { transOFlex: tof, pickPackPoint: ppp, sprinter, mpl } = waybill
  return el('fuvarlevel', [
    textEl('futarSzolgalat', waybill.courier),
    textEl('vonalkod', waybill.barcode),
    textEl('megjegyzes', waybill.comment),
    tof &&
      el('tof', [
        textEl('azonosito', tof.id),
        textEl('shipmentID', tof.shipmentId),
        optionalEl('csomagszam', tof.packageCount),
        textEl('countryCode', tof.countryCode),
        textEl('zip', tof.zip),
        textEl('service', tof.service),
      ]),
    ppp &&
      el('ppp', [
        textEl('vonalkodPrefix', ppp.barcodePrefix),
        textEl('vonalkodPostfix', ppp.barcodePostfix),
      ]),
    sprinter &&
      el('sprinter', [
        textEl('azonosito', sprinter.id),
        textEl('feladokod', sprinter.senderCode),
        textEl('iranykod', sprinter.directionCode),
        optionalEl('csomagszam', sprinter.packageCount),
        textEl('vonalkodPostfix', sprinter.barcodePostfix),
        textEl('szallitasiIdo', sprinter.deliveryTime),
      ]),
    mpl &&
      el('mpl', [
        el('vevokod', mpl.customerCode),
        el('vonalkod', mpl.barcode),
        el('tomeg', String(mpl.weight)),
        textEl('kulonszolgaltatasok', mpl.services),
        optionalEl('erteknyilvanitas', mpl.declaredValue),
      ]),
  ])
}

function itemLedgerNode(ledger: ItemLedger | undefined, label: string): XmlNode | undefined {
  if (!ledger) return undefined
  return optionalEl('tetelFokonyv', [
    textEl('gazdasagiEsem', ledger.economicEvent),
    textEl('gazdasagiEsemAfa', ledger.vatEconomicEvent),
    textEl('arbevetelFokonyviSzam', ledger.revenueLedgerAccount),
    textEl('afaFokonyviSzam', ledger.vatLedgerAccount),
    optionalEl(
      'elszDatumTol',
      optionalAgentDate(ledger.settlementPeriodStart, `${label} settlementPeriodStart`),
    ),
    optionalEl(
      'elszDatumIg',
      optionalAgentDate(ledger.settlementPeriodEnd, `${label} settlementPeriodEnd`),
    ),
  ])
}

function itemNode(item: ResolvedItem, index: number): XmlNode {
  const { input, amounts } = item
  return el('tetel', [
    el('megnevezes', input.name),
    textEl('azonosito', input.identifier),
    el('mennyiseg', amounts.quantity),
    el('mennyisegiEgyseg', item.unit),
    el('nettoEgysegar', amounts.netUnitPrice),
    el('afakulcs', formatVatRate(amounts.vat)),
    optionalEl('arresAfaAlap', input.marginVatBase),
    el('nettoErtek', amounts.netAmount),
    el('afaErtek', amounts.vatAmount),
    el('bruttoErtek', amounts.grossAmount),
    textEl('megjegyzes', input.comment),
    itemLedgerNode(input.ledger, `${index + 1}. tétel ledger`),
    optionalEl('torloKod', input.dataDeletionCode),
  ])
}

export function renderInvoiceXml(
  credentials: readonly XmlNode[],
  invoice: ResolvedInvoice,
  options: RenderInvoiceOptions = {},
): string {
  const preview = options.preview === true
  return buildXmlDocument({
    root: 'xmlszamla',
    namespace: INVOICE_XML_NAMESPACE,
    schemaLocation: INVOICE_XML_SCHEMA_LOCATION,
    children: [
      settingsNode(credentials, invoice, preview),
      headerNode(invoice, preview),
      sellerNode(invoice.seller),
      buyerNode(invoice.input.buyer, invoice.sendEmail),
      waybillNode(invoice.input.waybill),
      el('tetelek', invoice.items.map(itemNode)),
    ],
  })
}

export function buildCreateInvoiceXml(
  credentials: readonly XmlNode[],
  defaults: InvoiceDefaults,
  input: CreateInvoiceInput,
  now: Date = new Date(),
): string {
  return renderInvoiceXml(credentials, resolveInvoice(defaults, input, now))
}
