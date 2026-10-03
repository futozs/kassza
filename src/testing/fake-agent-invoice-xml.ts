import { bytesToBase64 } from '../core/binary'
import { buildXmlDocument, el, optionalEl, type XmlNode } from '../core/xml/serialize'
import { type FakeVatGroup, vatGroupsOf } from './fake-agent-items'
import {
  type FakeAgentInvoice,
  type FakeAgentInvoicePayment,
  type FakeAgentItem,
  type FakeAgentTotals,
  fakePdf,
} from './fake-agent-state'

const UNIFIED_PAYMENT_METHODS = [
  'átutalás',
  'készpénz',
  'bankkártya',
  'csekk',
  'utánvét',
  'ajándékutalvány',
  'barion',
  'barter',
  'csoportos beszedés',
  'OTP Simple',
  'kompenzáció',
  'kupon',
  'PayPal',
  'PayU',
  'SZÉP kártya',
  'utalvány',
  'MasterCard Mobile',
  'Borgun',
  'EP kártya',
  'térítésmentes',
  'egyéb',
] as const

const OTHER_PAYMENT_METHOD = 'egyéb'
const CASH_PAYMENT_METHOD = 'készpénz'
const SELLER_ID = 1
const DOMESTIC_LOCATION = 1
const PAPER_APPEARANCE = 0
const E_INVOICE_APPEARANCE = 2

export function unifiedPaymentMethod(method: string): string {
  const normalized = method.trim().toLowerCase()
  return (
    UNIFIED_PAYMENT_METHODS.find((candidate) => candidate.toLowerCase() === normalized) ??
    OTHER_PAYMENT_METHOD
  )
}

function sellerNode(invoice: FakeAgentInvoice): XmlNode {
  const { seller } = invoice
  return el('szallito', [
    el('id', SELLER_ID),
    el('nev', seller.name),
    el('cim', [
      optionalEl('orszag', seller.country),
      el('irsz', seller.zip),
      el('telepules', seller.city),
      el('cim', seller.address),
    ]),
    el('adoszam', seller.taxNumber),
    optionalEl('bank', [
      optionalEl('nev', seller.bankName),
      optionalEl('bankszamla', seller.bankAccount),
    ]),
  ])
}

function headerNode(invoice: FakeAgentInvoice, testAccount: boolean): XmlNode {
  const unified = unifiedPaymentMethod(invoice.paymentMethod)
  return el('alap', [
    el('id', invoice.id),
    el('szamlaszam', invoice.number),
    el('gazdEsemAzon', invoice.id),
    el('tipus', invoice.typeCode),
    el('eszamla', invoice.eInvoice ? E_INVOICE_APPEARANCE : PAPER_APPEARANCE),
    optionalEl('hivszamlaszam', invoice.referencedInvoiceNumber),
    optionalEl('hivdijbekszam', invoice.referencedProformaNumber),
    el('kelt', invoice.issueDate),
    el('telj', invoice.fulfillmentDate),
    el('fizh', invoice.dueDate),
    el('fizmod', invoice.paymentMethod),
    el('fizmodunified', unified),
    el('keszpenz', unified === CASH_PAYMENT_METHOD),
    optionalEl('rendelesszam', invoice.orderNumber),
    el('nyelv', invoice.language),
    el('devizanem', invoice.currency),
    optionalEl('devizabank', invoice.exchangeBank),
    optionalEl('devizaarf', invoice.exchangeRate),
    optionalEl('megjegyzes', invoice.comment),
    el('penzforg', false),
    el('kata', false),
    el('katafokonyv', false),
    optionalEl('email', invoice.buyer.email),
    el('teszt', testAccount),
    el('sztornozott', invoice.reversed),
  ])
}

function buyerNode(invoice: FakeAgentInvoice): XmlNode {
  const { buyer } = invoice
  return el('vevo', [
    el('nev', buyer.name),
    optionalEl('azonosito', buyer.identifier),
    el('cim', [
      optionalEl('orszag', buyer.country),
      el('irsz', buyer.zip),
      el('telepules', buyer.city),
      el('cim', buyer.address),
    ]),
    optionalEl('email', buyer.email),
    el('adoszam', buyer.taxNumber ?? ''),
    optionalEl('csoportazonosito', buyer.groupTaxNumber),
    optionalEl('adoszameu', buyer.euTaxNumber),
    el('lokacio', DOMESTIC_LOCATION),
    el('privatePersonIndicator', buyer.taxNumber === undefined && buyer.euTaxNumber === undefined),
  ])
}

function itemNode(item: FakeAgentItem, index: number): XmlNode {
  return el('tetel', [
    el('nev', item.name),
    optionalEl('azonosito', item.identifier),
    el('mennyiseg', item.quantity),
    el('mennyisegiegyseg', item.unit),
    el('nettoegysegar', item.netUnitPrice),
    optionalEl('afatipus', item.vatCode),
    el('afakulcs', item.vatRate),
    el('netto', item.netAmount),
    el('afa', item.vatAmount),
    el('brutto', item.grossAmount),
    optionalEl('megjegyzes', item.comment),
    el('sztetordering', index + 1),
  ])
}

export function vatGroupNode(group: FakeVatGroup): XmlNode {
  return el('afakulcsossz', [
    optionalEl('afatipus', group.vatCode),
    el('afakulcs', group.vatRate),
    el('netto', group.net),
    el('afa', group.vat),
    el('brutto', group.gross),
  ])
}

export function totalNode(totals: FakeAgentTotals): XmlNode {
  return el('totalossz', [
    el('netto', totals.net),
    el('afa', totals.vat),
    el('brutto', totals.gross),
  ])
}

function paymentNode(payment: FakeAgentInvoicePayment): XmlNode {
  return el('kifizetes', [
    el('datum', payment.date),
    el('jogcim', payment.method),
    el('osszeg', payment.amount),
    optionalEl('megjegyzes', payment.comment),
  ])
}

export function renderInvoiceXml(
  invoice: FakeAgentInvoice,
  testAccount: boolean,
  includePdf: boolean,
): string {
  return buildXmlDocument({
    root: 'szamla',
    namespace: 'http://www.szamlazz.hu/szamla',
    children: [
      sellerNode(invoice),
      headerNode(invoice, testAccount),
      buyerNode(invoice),
      el('tetelek', invoice.items.map(itemNode)),
      el('osszegek', [...vatGroupsOf(invoice.items).map(vatGroupNode), totalNode(invoice.totals)]),
      invoice.payments.length > 0 && el('kifizetesek', invoice.payments.map(paymentNode)),
      includePdf && el('pdf', bytesToBase64(fakePdf(invoice.number))),
    ],
  })
}
