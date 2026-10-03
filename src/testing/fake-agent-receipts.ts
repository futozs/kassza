import { bytesToBase64 } from '../core/binary'
import {
  childBoolean,
  childNumber,
  childText,
  findChild,
  findChildren,
  type XmlElement,
} from '../core/xml/parse'
import { el, optionalEl, type XmlNode } from '../core/xml/serialize'
import { roundMoney } from '../money/rounding'
import { isHuf } from '../money/vat'
import { type FakeAgentResponse, xmlDocument, xmlResponse } from './fake-agent-http'
import { totalNode, vatGroupNode } from './fake-agent-invoice-xml'
import {
  assertReceiptItems,
  negateItem,
  negateTotals,
  parseItems,
  totalsOf,
  vatGroupsOf,
  xmlFailure,
} from './fake-agent-items'
import type { FakeAgentRequest } from './fake-agent-request'
import {
  agentFailure,
  FakeAgentFailure,
  type FakeAgentItem,
  type FakeAgentReceipt,
  type FakeAgentReceiptPayment,
  type FakeAgentState,
  fakePdf,
  nextDocumentId,
  nextDocumentNumber,
  today,
} from './fake-agent-state'

const PREFIX_PATTERN = /^[A-Z0-9]+$/
const MONEY_DECIMALS = 2

function requiredText(parent: XmlElement | undefined, name: string, path: string): string {
  const value = childText(parent, name)
  if (value === undefined) throw xmlFailure(`hiányzik a(z) <${path}/${name}> elem.`)
  return value
}

function assertUnusedCallId(state: FakeAgentState, callId: string | undefined): void {
  if (callId === undefined) return
  if ([...state.receipts.values()].some((receipt) => receipt.callId === callId)) {
    throw agentFailure(338, `A hívásazonosító már létezik: ${callId}.`)
  }
}

function isInvoicePrefix(state: FakeAgentState, prefix: string): boolean {
  if (state.config.invoicePrefixes?.has(prefix)) return true
  return [...state.invoices.values()].some((invoice) => invoice.prefix === prefix)
}

function resolvePrefix(state: FakeAgentState, header: XmlElement): string {
  const prefix = requiredText(header, 'elotag', 'fejlec')
  if (!PREFIX_PATTERN.test(prefix)) throw agentFailure(337)
  if (isInvoicePrefix(state, prefix)) throw agentFailure(336)
  const enabled = state.config.receiptPrefixes
  if (enabled !== undefined && !enabled.has(prefix)) throw agentFailure(524)
  return prefix
}

function paymentOf(element: XmlElement, index: number): FakeAgentReceiptPayment {
  const path = `kifizetesek/kifizetes[${index + 1}]`
  const amount = childNumber(element, 'osszeg')
  if (amount === undefined) throw xmlFailure(`a(z) <${path}/osszeg> hiányzik vagy nem szám.`)
  return {
    method: requiredText(element, 'fizetoeszkoz', path),
    amount,
    description: childText(element, 'leiras'),
  }
}

function assertPaymentsMatch(payments: readonly FakeAgentReceiptPayment[], gross: number): void {
  if (payments.length === 0) return
  const paid = roundMoney(
    payments.reduce((sum, payment) => sum + payment.amount, 0),
    MONEY_DECIMALS,
  )
  if (paid !== roundMoney(gross, MONEY_DECIMALS)) {
    throw agentFailure(340, `A kifizetett összeg (${paid}) eltér a bruttó végösszegtől (${gross}).`)
  }
}

function assertUniqueOrderNumber(state: FakeAgentState, orderNumber: string | undefined): void {
  if (!state.config.uniqueReceiptOrderNumbers || orderNumber === undefined) return
  const taken = [...state.receipts.values()].some(
    (receipt) => receipt.type === 'NY' && receipt.orderNumber === orderNumber && !receipt.reversed,
  )
  if (taken) {
    throw agentFailure(
      152,
      `Már létező rendelésszám: ${orderNumber}. Az ismétlődés engedélyezhető a Beállítások oldalon.`,
    )
  }
}

function exchangeOf(
  header: XmlElement,
  currency: string,
): Pick<FakeAgentReceipt, 'exchangeBank' | 'exchangeRate'> {
  if (isHuf(currency)) return { exchangeBank: undefined, exchangeRate: undefined }
  const exchangeRate = childNumber(header, 'devizaarf')
  const exchangeBank = childText(header, 'devizabank')
  if (exchangeRate === undefined || exchangeRate <= 0 || exchangeBank === undefined) {
    throw xmlFailure(
      `devizás (${currency}) nyugtánál az árfolyam (devizaarf) és a bank (devizabank) megadása kötelező.`,
    )
  }
  return { exchangeBank, exchangeRate }
}

function itemNode(item: FakeAgentItem): XmlNode {
  return el('tetel', [
    el('megnevezes', item.name),
    optionalEl('azonosito', item.identifier),
    el('nettoEgysegar', item.netUnitPrice),
    el('mennyiseg', item.quantity),
    el('mennyisegiEgyseg', item.unit),
    el('netto', item.netAmount),
    optionalEl('afatipus', item.vatCode),
    el('afakulcs', item.vatRate),
    el('afa', item.vatAmount),
    el('brutto', item.grossAmount),
    item.ledger &&
      optionalEl('fokonyv', [
        optionalEl('arbevetel', item.ledger.revenue),
        optionalEl('afa', item.ledger.vat),
      ]),
  ])
}

function paymentNode(payment: FakeAgentReceiptPayment): XmlNode {
  return el('kifizetes', [
    el('fizetoeszkoz', payment.method),
    el('osszeg', payment.amount),
    optionalEl('leiras', payment.description),
  ])
}

function receiptNode(receipt: FakeAgentReceipt, testAccount: boolean): XmlNode {
  return el('nyugta', [
    el('alap', [
      el('id', receipt.id),
      optionalEl('hivasAzonosito', receipt.callId),
      el('nyugtaszam', receipt.number),
      el('tipus', receipt.type),
      el('stornozott', receipt.reversed),
      optionalEl('stornozottNyugtaszam', receipt.reversedNumber),
      el('kelt', receipt.issueDate),
      el('fizmod', receipt.paymentMethod),
      el('penznem', receipt.currency),
      optionalEl('devizabank', receipt.exchangeBank),
      optionalEl('devizaarf', receipt.exchangeRate),
      optionalEl('megjegyzes', receipt.comment),
      optionalEl('fokonyvVevo', receipt.customerLedgerId),
      el('teszt', testAccount),
      optionalEl('rendelesSzam', receipt.orderNumber),
    ]),
    el('tetelek', receipt.items.map(itemNode)),
    receipt.payments.length > 0 && el('kifizetesek', receipt.payments.map(paymentNode)),
    el('osszegek', [...vatGroupsOf(receipt.items).map(vatGroupNode), totalNode(receipt.totals)]),
  ])
}

function receiptResponse(
  state: FakeAgentState,
  receipt: FakeAgentReceipt,
  includePdf: boolean,
): FakeAgentResponse {
  return xmlResponse(
    xmlDocument('xmlnyugtavalasz', [
      el('sikeres', true),
      includePdf && el('nyugtaPdf', bytesToBase64(fakePdf(receipt.number))),
      receiptNode(receipt, state.config.testAccount),
    ]),
  )
}

function downloadPdfOf(root: XmlElement): boolean {
  return childBoolean(findChild(root, 'beallitasok'), 'pdfLetoltes') === true
}

export function handleCreateReceipt(
  state: FakeAgentState,
  request: FakeAgentRequest,
): FakeAgentResponse {
  const { root } = request
  const header = findChild(root, 'fejlec')
  if (!header) throw xmlFailure('hiányzik a <fejlec> blokk.')
  const callId = childText(header, 'hivasAzonosito')
  assertUnusedCallId(state, callId)
  const prefix = resolvePrefix(state, header)
  const paymentMethod = requiredText(header, 'fizmod', 'fejlec')
  const currency = childText(header, 'penznem') ?? 'HUF'
  const exchange = exchangeOf(header, currency)
  const items = parseItems(root, 'receipt')
  assertReceiptItems(items, currency)
  const totals = totalsOf(items)
  const payments = findChildren(findChild(root, 'kifizetesek'), 'kifizetes').map(paymentOf)
  assertPaymentsMatch(payments, totals.gross)
  const orderNumber = childText(header, 'rendelesSzam')
  assertUniqueOrderNumber(state, orderNumber)
  const receipt: FakeAgentReceipt = {
    id: nextDocumentId(state),
    number: nextDocumentNumber(state, prefix),
    prefix,
    callId,
    type: 'NY',
    reversed: false,
    issueDate: today(state),
    paymentMethod,
    currency,
    ...exchange,
    comment: childText(header, 'megjegyzes'),
    customerLedgerId: childText(header, 'fokonyvVevo'),
    orderNumber,
    items,
    payments,
    totals,
    sentTo: [],
  }
  state.receipts.set(receipt.number, receipt)
  return receiptResponse(state, receipt, downloadPdfOf(root))
}

export function handleReverseReceipt(
  state: FakeAgentState,
  request: FakeAgentRequest,
): FakeAgentResponse {
  const { root } = request
  const header = findChild(root, 'fejlec')
  const number = requiredText(header, 'nyugtaszam', 'fejlec')
  const callId = childText(header, 'hivasAzonosito')
  assertUnusedCallId(state, callId)
  const original = state.receipts.get(number)
  if (!original) {
    throw agentFailure(339, 'Hiányzó adat: sztornózandó nyugta (nincs ilyen nyugtaszám)')
  }
  if (original.type === 'SN') {
    throw new FakeAgentFailure(
      undefined,
      'Hiányzó adat: sztornózandó nyugta (ez a nyugta egy sztornónyugta)',
    )
  }
  if (original.reversed) {
    throw new FakeAgentFailure(
      undefined,
      `Hiányzó adat: sztornózandó nyugta (ezt a nyugtát már sztornózták: ${number})`,
    )
  }
  const reversal: FakeAgentReceipt = {
    ...original,
    id: nextDocumentId(state),
    number: nextDocumentNumber(state, original.prefix),
    callId,
    type: 'SN',
    reversed: false,
    reversedNumber: original.number,
    issueDate: today(state),
    items: original.items.map(negateItem),
    payments: original.payments.map((payment) => ({ ...payment, amount: -payment.amount })),
    totals: negateTotals(original.totals),
    sentTo: [],
  }
  state.receipts.set(original.number, { ...original, reversed: true })
  state.receipts.set(reversal.number, reversal)
  return receiptResponse(state, reversal, downloadPdfOf(root))
}

export function handleGetReceipt(
  state: FakeAgentState,
  request: FakeAgentRequest,
): FakeAgentResponse {
  const { root } = request
  const header = findChild(root, 'fejlec')
  const number = childText(header, 'nyugtaszam')
  const orderNumber = childText(header, 'rendelesSzam')
  if (number === undefined && orderNumber === undefined) {
    throw xmlFailure('add meg a nyugtaszámot (nyugtaszam) vagy a rendelésszámot (rendelesSzam).')
  }
  const receipt =
    number !== undefined
      ? state.receipts.get(number)
      : [...state.receipts.values()].findLast((candidate) => candidate.orderNumber === orderNumber)
  if (!receipt) throw agentFailure(339)
  return receiptResponse(state, receipt, downloadPdfOf(root))
}

export function handleSendReceipt(
  state: FakeAgentState,
  request: FakeAgentRequest,
): FakeAgentResponse {
  const { root } = request
  const number = requiredText(findChild(root, 'fejlec'), 'nyugtaszam', 'fejlec')
  const email = findChild(root, 'emailKuldes')
  const recipients = childText(email, 'email')
  if (recipients === undefined) throw agentFailure(7, 'Hiányzó adat: email elem.')
  if (childText(email, 'emailTargy') === undefined) {
    throw agentFailure(7, 'Hiányzó adat: emailtargy elem.')
  }
  const receipt = state.receipts.get(number)
  if (!receipt) throw agentFailure(339)
  const addresses = recipients
    .split(/[,;]/)
    .map((address) => address.trim())
    .filter((address) => address !== '')
  state.receipts.set(number, { ...receipt, sentTo: [...receipt.sentTo, addresses] })
  return xmlResponse(xmlDocument('xmlnyugtasendvalasz', [el('sikeres', true)]))
}
