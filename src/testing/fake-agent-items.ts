import { childNumber, childText, findChild, findChildren, type XmlElement } from '../core/xml/parse'
import { decimalPlaces, roundMoney } from '../money/rounding'
import { isHuf, NUMERIC_VAT_RATES } from '../money/vat'
import {
  FakeAgentFailure,
  type FakeAgentItem,
  type FakeAgentItemLedger,
  type FakeAgentTotals,
} from './fake-agent-state'

export type FakeItemKind = 'invoice' | 'receipt'

export interface FakeVatGroup {
  readonly vatRate: number
  readonly vatCode?: string | undefined
  readonly net: number
  readonly vat: number
  readonly gross: number
}

const SERVER_VAT_CODES: ReadonlySet<string> = new Set([
  'TAM',
  'AAM',
  'EU',
  'EUK',
  'MAA',
  'F.AFA',
  'K.AFA',
  'ÁKK',
  'TAHK',
  'TEHK',
  'EUT',
  'EUKT',
  'HO',
  'EUE',
  'EUFADE',
  'EUFAD37',
  'ATK',
  'NAM',
  'EAM',
  'KBAUK',
  'KBAET',
])

const NUMERIC_RATES: ReadonlySet<number> = new Set(NUMERIC_VAT_RATES)

const AMOUNT_FIELDS: Readonly<
  Record<FakeItemKind, { readonly net: string; readonly vat: string; readonly gross: string }>
> = {
  invoice: { net: 'nettoErtek', vat: 'afaErtek', gross: 'bruttoErtek' },
  receipt: { net: 'netto', vat: 'afa', gross: 'brutto' },
}

const HUF_TOLERANCE = 2
const FOREIGN_TOLERANCE = 0.02
const SUM_EPSILON = 1e-6
const RECEIPT_DECIMALS = 2
const TOTAL_DECIMALS = 6

export function xmlFailure(detail: string): FakeAgentFailure {
  return new FakeAgentFailure(57, `XML beolvasási hiba: ${detail}`)
}

function requiredText(element: XmlElement, name: string, position: number): string {
  const value = childText(element, name)
  if (value === undefined) throw xmlFailure(`hiányzik a(z) ${position}. tétel <${name}> eleme.`)
  return value
}

function requiredNumber(element: XmlElement, name: string, position: number): number {
  const value = childNumber(element, name)
  if (value === undefined) {
    throw xmlFailure(`a(z) ${position}. tétel <${name}> eleme hiányzik vagy nem szám.`)
  }
  return value
}

function parseVat(
  raw: string,
  itemName: string,
): { readonly rate: number; readonly code?: string } {
  const numeric = Number(raw.replace(',', '.'))
  if (Number.isFinite(numeric) && NUMERIC_RATES.has(numeric)) return { rate: numeric }
  if (SERVER_VAT_CODES.has(raw)) return { rate: 0, code: raw }
  throw new FakeAgentFailure(395, `Érvénytelen áfakulcs: ${raw}. Termék: ${itemName}`)
}

function ledgerOf(element: XmlElement | undefined): FakeAgentItemLedger | undefined {
  const revenue = childText(element, 'arbevetel')
  const vat = childText(element, 'afa')
  return revenue === undefined && vat === undefined ? undefined : { revenue, vat }
}

function parseItem(element: XmlElement, kind: FakeItemKind, position: number): FakeAgentItem {
  const fields = AMOUNT_FIELDS[kind]
  const name = requiredText(element, 'megnevezes', position)
  const vat = parseVat(requiredText(element, 'afakulcs', position), name)
  return {
    name,
    identifier: childText(element, 'azonosito'),
    quantity: requiredNumber(element, 'mennyiseg', position),
    unit: requiredText(element, 'mennyisegiEgyseg', position),
    netUnitPrice: requiredNumber(element, 'nettoEgysegar', position),
    vatRate: vat.rate,
    vatCode: vat.code,
    netAmount: requiredNumber(element, fields.net, position),
    vatAmount: requiredNumber(element, fields.vat, position),
    grossAmount: requiredNumber(element, fields.gross, position),
    comment: childText(element, 'megjegyzes'),
    ledger: kind === 'receipt' ? ledgerOf(findChild(element, 'fokonyv')) : undefined,
  }
}

export function parseItems(root: XmlElement, kind: FakeItemKind): FakeAgentItem[] {
  const elements = findChildren(findChild(root, 'tetelek'), 'tetel')
  if (elements.length === 0) throw xmlFailure('legalább egy tételt (<tetel>) meg kell adni.')
  return elements.map((element, index) => parseItem(element, kind, index + 1))
}

function amountFailure(code: number, item: FakeAgentItem): FakeAgentFailure {
  const messages: Readonly<Record<number, string>> = {
    259: 'A tétel nettó értéke nem megfelelő; nettó érték = nettó egységár x mennyiség.',
    260: 'A tétel áfa értéke nem megfelelő; áfa érték = tétel nettó értéke x áfakulcs mértéke / 100.',
    261: 'A tétel bruttó értéke nem megfelelő; bruttó érték = tétel nettó értéke + tétel áfa értéke.',
    363: 'A tétel bruttó értékének egész számnak kell lennie.',
    364: 'A tétel nettó értéke maximum 2 tizedes jegyet tartalmazhat.',
    365: 'A tétel áfa értéke maximum 2 tizedes jegyet tartalmazhat.',
  }
  return new FakeAgentFailure(
    code,
    `${messages[code] ?? 'Hibás tételösszeg.'} Termék: ${item.name}`,
  )
}

function netMismatch(item: FakeAgentItem, tolerance: number): boolean {
  return Math.abs(item.netUnitPrice * item.quantity - item.netAmount) > tolerance
}

function vatMismatch(item: FakeAgentItem, tolerance: number): boolean {
  return Math.abs((item.netAmount * item.vatRate) / 100 - item.vatAmount) > tolerance
}

function grossMismatch(item: FakeAgentItem): boolean {
  return Math.abs(item.netAmount + item.vatAmount - item.grossAmount) > SUM_EPSILON
}

export function assertInvoiceItems(
  items: readonly FakeAgentItem[],
  currency: string,
  hasMarginVat: (index: number) => boolean,
): void {
  const tolerance = isHuf(currency) ? HUF_TOLERANCE : FOREIGN_TOLERANCE
  items.forEach((item, index) => {
    if (netMismatch(item, tolerance)) throw amountFailure(259, item)
    if (!hasMarginVat(index) && vatMismatch(item, tolerance)) throw amountFailure(260, item)
    if (grossMismatch(item)) throw amountFailure(261, item)
  })
}

export function assertReceiptItems(items: readonly FakeAgentItem[], currency: string): void {
  if (!isHuf(currency)) return
  for (const item of items) {
    if (grossMismatch(item)) throw amountFailure(261, item)
    if (!Number.isInteger(item.grossAmount)) throw amountFailure(363, item)
    if (decimalPlaces(item.netAmount) > RECEIPT_DECIMALS) throw amountFailure(364, item)
    if (decimalPlaces(item.vatAmount) > RECEIPT_DECIMALS) throw amountFailure(365, item)
    if (netMismatch(item, HUF_TOLERANCE)) throw amountFailure(259, item)
    if (vatMismatch(item, HUF_TOLERANCE)) throw amountFailure(260, item)
  }
}

function sum(values: readonly number[]): number {
  return roundMoney(
    values.reduce((total, value) => total + value, 0),
    TOTAL_DECIMALS,
  )
}

export function totalsOf(items: readonly FakeAgentItem[]): FakeAgentTotals {
  return {
    net: sum(items.map((item) => item.netAmount)),
    vat: sum(items.map((item) => item.vatAmount)),
    gross: sum(items.map((item) => item.grossAmount)),
  }
}

export function vatGroupsOf(items: readonly FakeAgentItem[]): FakeVatGroup[] {
  const groups = new Map<string, FakeAgentItem[]>()
  for (const item of items) {
    const key = `${item.vatCode ?? ''}|${item.vatRate}`
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return [...groups.values()].flatMap((group) => {
    const [first] = group
    if (!first) return []
    const totals = totalsOf(group)
    return [
      {
        vatRate: first.vatRate,
        vatCode: first.vatCode,
        net: totals.net,
        vat: totals.vat,
        gross: totals.gross,
      },
    ]
  })
}

export function negateItem(item: FakeAgentItem): FakeAgentItem {
  return {
    ...item,
    quantity: -item.quantity,
    netAmount: -item.netAmount,
    vatAmount: -item.vatAmount,
    grossAmount: -item.grossAmount,
  }
}

export function negateTotals(totals: FakeAgentTotals): FakeAgentTotals {
  return { net: -totals.net, vat: -totals.vat, gross: -totals.gross }
}

export function outstandingOf(gross: number, paid: number): number {
  return gross > 0 ? Math.max(0, sum([gross, -paid])) : 0
}
