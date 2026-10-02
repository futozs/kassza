import { SzamlazzError } from '../core/errors'
import { roundMoney } from '../money/rounding'
import { isHuf } from '../money/vat'
import type { Receipt, ReceiptItem } from '../receipts/types'
import { NAV_VAT_CATEGORIES, type NavVatCategory, navVatCategory } from './vat-category'

export type NavVatCategoryName = NavVatCategory | (string & {})

export interface NavVatCategoryTotal {
  readonly vat: NavVatCategoryName
  readonly saleDocument: number
  readonly modifyingDocument: number
}

export interface NavReceiptReport {
  readonly applicableDate: string
  readonly series: string
  readonly serialNumber: string
  readonly currency: string
  readonly exchangeRate: number | null
  readonly vatCategories: readonly NavVatCategoryTotal[]
  readonly total: number
  readonly numberOfSaleDocument: number
  readonly numberOfModifyingDocument: number
  readonly receiptNumbers: readonly string[]
}

export interface NavDailyReportOptions {
  readonly includeTest?: boolean | undefined
  readonly vatCategory?: ((item: ReceiptItem, receipt: Receipt) => NavVatCategoryName) | undefined
  readonly series?: ((receiptNumber: string) => string) | undefined
}

export interface ReceiptNumberParts {
  readonly series: string
  readonly sequence: number | undefined
}

const SEQUENCE_PATTERN = /^(.*)-(\d+)$/

export function splitReceiptNumber(receiptNumber: string): ReceiptNumberParts {
  const match = SEQUENCE_PATTERN.exec(receiptNumber.trim())
  if (!match?.[1]) return { series: receiptNumber.trim(), sequence: undefined }
  return { series: match[1], sequence: Number(match[2]) }
}

export function navCurrencyCode(currency: string): string {
  return isHuf(currency) ? 'HUF' : currency.trim().toUpperCase()
}

export function compareReceiptNumbers(a: string, b: string): number {
  const left = splitReceiptNumber(a)
  const right = splitReceiptNumber(b)
  if (left.series === right.series && left.sequence !== undefined && right.sequence !== undefined) {
    return left.sequence - right.sequence
  }
  return a.localeCompare(b, 'hu')
}

function reportError(message: string): SzamlazzError {
  return new SzamlazzError(message, { category: 'validation' })
}

function exchangeRateOf(receipt: Receipt, currency: string): number | null {
  if (currency === 'HUF') return null
  const rate = receipt.exchangeRate
  if (rate === undefined || !Number.isFinite(rate) || rate <= 0) {
    throw reportError(
      `A(z) ${receipt.number} devizás (${currency}) nyugtán nincs érvényes árfolyam, ezért nem összesíthető.`,
    )
  }
  return roundMoney(rate, 4)
}

interface Bucket {
  readonly applicableDate: string
  readonly series: string
  readonly currency: string
  readonly exchangeRate: number | null
  readonly categories: Map<string, { sale: number; modifying: number }>
  readonly numbers: string[]
  sales: number
  modifying: number
}

function signedGross(item: ReceiptItem, receipt: Receipt): number {
  return receipt.type === 'reversal' ? -Math.abs(item.grossAmount) : item.grossAmount
}

function bucketFor(
  buckets: Map<string, Bucket>,
  receipt: Receipt,
  series: string,
  currency: string,
  exchangeRate: number | null,
): Bucket {
  const key = JSON.stringify([receipt.issueDate, series, currency, exchangeRate])
  const existing = buckets.get(key)
  if (existing) return existing
  const created: Bucket = {
    applicableDate: receipt.issueDate,
    series,
    currency,
    exchangeRate,
    categories: new Map(),
    numbers: [],
    sales: 0,
    modifying: 0,
  }
  buckets.set(key, created)
  return created
}

function categoryOrder(name: string): number {
  const index = (NAV_VAT_CATEGORIES as readonly string[]).indexOf(name)
  return index === -1 ? NAV_VAT_CATEGORIES.length : index
}

function toReport(bucket: Bucket): NavReceiptReport {
  const vatCategories = [...bucket.categories.entries()]
    .map(([vat, totals]) => ({
      vat,
      saleDocument: roundMoney(totals.sale, 2),
      modifyingDocument: roundMoney(totals.modifying, 2),
    }))
    .sort((a, b) => categoryOrder(a.vat) - categoryOrder(b.vat) || a.vat.localeCompare(b.vat))
  const total = roundMoney(
    vatCategories.reduce((sum, row) => sum + row.saleDocument + row.modifyingDocument, 0),
    2,
  )
  const receiptNumbers = [...bucket.numbers].sort(compareReceiptNumbers)
  return {
    applicableDate: bucket.applicableDate,
    series: bucket.series,
    serialNumber: receiptNumbers[0] ?? '',
    currency: bucket.currency,
    exchangeRate: bucket.exchangeRate,
    vatCategories,
    total,
    numberOfSaleDocument: bucket.sales,
    numberOfModifyingDocument: bucket.modifying,
    receiptNumbers,
  }
}

function assertIssueDate(receipt: Receipt): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receipt.issueDate)) {
    throw reportError(`A(z) ${receipt.number} nyugta kelte érvénytelen: "${receipt.issueDate}".`)
  }
}

export function navDailyReports(
  receipts: readonly Receipt[],
  options: NavDailyReportOptions = {},
): NavReceiptReport[] {
  const buckets = new Map<string, Bucket>()
  const seen = new Set<string>()
  const seriesOf = options.series ?? ((number: string) => splitReceiptNumber(number).series)
  const categoryOf = options.vatCategory ?? ((item: ReceiptItem) => navVatCategory(item.vat))
  for (const receipt of receipts) {
    if (receipt.isTest && options.includeTest !== true) continue
    if (seen.has(receipt.number)) continue
    seen.add(receipt.number)
    assertIssueDate(receipt)
    const currency = navCurrencyCode(receipt.currency)
    const bucket = bucketFor(
      buckets,
      receipt,
      seriesOf(receipt.number),
      currency,
      exchangeRateOf(receipt, currency),
    )
    bucket.numbers.push(receipt.number)
    const isModifying = receipt.type === 'reversal'
    if (isModifying) bucket.modifying += 1
    else bucket.sales += 1
    for (const item of receipt.items) {
      const name = categoryOf(item, receipt)
      const totals = bucket.categories.get(name) ?? { sale: 0, modifying: 0 }
      if (isModifying) totals.modifying += signedGross(item, receipt)
      else totals.sale += signedGross(item, receipt)
      bucket.categories.set(name, totals)
    }
  }
  return [...buckets.values()]
    .map(toReport)
    .sort(
      (a, b) =>
        a.applicableDate.localeCompare(b.applicableDate) ||
        a.series.localeCompare(b.series, 'hu') ||
        a.currency.localeCompare(b.currency) ||
        (a.exchangeRate ?? 0) - (b.exchangeRate ?? 0),
    )
}

const amountFormatter = new Intl.NumberFormat('hu-HU', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
})

export function describeNavReport(report: NavReceiptReport): string {
  const lines = [
    `Tárgynap: ${report.applicableDate}`,
    `Kezdő nyugtasorszám: ${report.serialNumber}`,
    `Pénznem: ${report.currency}${report.exchangeRate === null ? '' : ` (árfolyam: ${report.exchangeRate})`}`,
    ...report.vatCategories.map(
      (row) =>
        `${row.vat}: értékesítés ${amountFormatter.format(row.saleDocument)}, módosító/érvénytelenítő ${amountFormatter.format(row.modifyingDocument)}`,
    ),
    `Végösszeg: ${amountFormatter.format(report.total)}`,
    `Nyugták száma: ${report.numberOfSaleDocument}, módosító/érvénytelenítő bizonylatok száma: ${report.numberOfModifyingDocument}`,
  ]
  return lines.join('\n')
}
