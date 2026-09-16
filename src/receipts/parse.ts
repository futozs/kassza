import { base64ToBytes } from '../core/binary'
import {
  type AgentResponse,
  looksLikeXml,
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
import type {
  Receipt,
  ReceiptItem,
  ReceiptLedger,
  ReceiptPayment,
  ReceiptTotals,
  ReceiptVatRate,
  ReceiptVatTotal,
} from './types'

function requiredText(
  element: XmlElement | undefined,
  name: string,
  response: AgentResponse,
): string {
  const value = childText(element, name)
  if (value === undefined) {
    throw unexpectedResponse(response, `Hiányzik a(z) <${name}> elem a nyugta válaszból.`)
  }
  return value
}

function amount(element: XmlElement, names: readonly string[]): number {
  for (const name of names) {
    const value = childNumber(element, name)
    if (value !== undefined) return value
  }
  return 0
}

function vatOf(element: XmlElement): { vat: ReceiptVatRate; vatPercentage: number } {
  const vatPercentage = childNumber(element, 'afakulcs') ?? 0
  const vatType = childText(element, 'afatipus')
  return { vat: (vatType ?? vatPercentage) as ReceiptVatRate, vatPercentage }
}

function parseLedger(element: XmlElement): ReceiptLedger | undefined {
  const ledger = findChild(element, 'fokonyv')
  const revenue = childText(ledger, 'arbevetel')
  const vat = childText(ledger, 'afa')
  if (revenue === undefined && vat === undefined) return undefined
  return { revenue, vat }
}

function parseItem(element: XmlElement): ReceiptItem {
  return {
    name: childText(element, 'megnevezes') ?? '',
    identifier: childText(element, 'azonosito'),
    quantity: childNumber(element, 'mennyiseg') ?? 0,
    unit: childText(element, 'mennyisegiEgyseg') ?? '',
    netUnitPrice: childNumber(element, 'nettoEgysegar') ?? 0,
    ...vatOf(element),
    netAmount: amount(element, ['netto', 'nettoErtek']),
    vatAmount: amount(element, ['afa', 'afaErtek']),
    grossAmount: amount(element, ['brutto', 'bruttoErtek']),
    ledger: parseLedger(element),
  }
}

function parsePayment(element: XmlElement): ReceiptPayment {
  return {
    method: childText(element, 'fizetoeszkoz') ?? '',
    amount: childNumber(element, 'osszeg') ?? 0,
    description: childText(element, 'leiras'),
  }
}

function parseVatTotal(element: XmlElement): ReceiptVatTotal {
  return {
    ...vatOf(element),
    netAmount: amount(element, ['netto']),
    vatAmount: amount(element, ['afa']),
    grossAmount: amount(element, ['brutto']),
  }
}

function parseTotals(receipt: XmlElement, items: readonly ReceiptItem[]): ReceiptTotals {
  const totals = findChild(receipt, 'osszegek')
  const byVat = findChildren(totals, 'afakulcsossz').map(parseVatTotal)
  const total = findChild(totals, 'totalossz')
  if (total) {
    return {
      netAmount: amount(total, ['netto']),
      vatAmount: amount(total, ['afa']),
      grossAmount: amount(total, ['brutto']),
      byVat,
    }
  }
  const sum = (pick: (item: ReceiptItem) => number): number =>
    Number(items.reduce((acc, item) => acc + pick(item), 0).toFixed(2))
  return {
    netAmount: sum((item) => item.netAmount),
    vatAmount: sum((item) => item.vatAmount),
    grossAmount: sum((item) => item.grossAmount),
    byVat,
  }
}

function parsePdf(root: XmlElement): Uint8Array | undefined {
  const encoded = childText(root, 'nyugtaPdf')
  if (encoded === undefined) return undefined
  const bytes = base64ToBytes(encoded)
  return bytes.length > 0 ? bytes : undefined
}

export function parseReceiptXml(root: XmlElement, response: AgentResponse): Receipt {
  const receipt = findChild(root, 'nyugta')
  const base = findChild(receipt, 'alap')
  if (!receipt || !base) {
    throw unexpectedResponse(response, 'A nyugta válaszból hiányzik a <nyugta> blokk.')
  }
  const items = findChildren(findChild(receipt, 'tetelek'), 'tetel').map(parseItem)
  const pdf = parsePdf(root)
  return {
    id: childNumber(base, 'id') ?? 0,
    number: requiredText(base, 'nyugtaszam', response),
    callId: childText(base, 'hivasAzonosito'),
    type: childText(base, 'tipus')?.toUpperCase() === 'SN' ? 'reversal' : 'receipt',
    isReversed: childBoolean(base, 'stornozott') ?? false,
    reversedReceiptNumber: childText(base, 'stornozottNyugtaszam'),
    issueDate: childText(base, 'kelt') ?? '',
    paymentMethod: childText(base, 'fizmod') ?? '',
    currency: childText(base, 'penznem') ?? 'HUF',
    exchangeBank: childText(base, 'devizabank'),
    exchangeRate: childNumber(base, 'devizaarf'),
    comment: childText(base, 'megjegyzes'),
    customerLedgerId: childText(base, 'fokonyvVevo'),
    isTest: childBoolean(base, 'teszt') ?? false,
    orderNumber: childText(base, 'rendelesSzam'),
    items,
    payments: findChildren(findChild(receipt, 'kifizetesek'), 'kifizetes').map(parsePayment),
    totals: parseTotals(receipt, items),
    ...(pdf ? { pdf } : {}),
  }
}

function throwIfNotXml(response: AgentResponse): void {
  throwIfHeaderError(response)
  throwIfTextError(response)
  if (looksLikeXml(response)) return
  throwIfHttpError(response)
  throw unexpectedResponse(response, 'XML választ vártunk.')
}

export function parseReceiptResponse(response: AgentResponse): Receipt {
  throwIfNotXml(response)
  const root = parseResponseXml(response)
  throwIfXmlFailure(root, response)
  if (childBoolean(root, 'sikeres') !== true) {
    throwIfHttpError(response)
    throw unexpectedResponse(response, 'A válasz nem jelez sikeres műveletet.')
  }
  return parseReceiptXml(root, response)
}
