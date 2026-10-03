import { type DateInput, toAgentDate } from '../core/dates'
import { roundMoney } from '../money/rounding'
import { compareReceiptNumbers } from '../reports/nav'
import { NAV_VAT_CATEGORIES } from '../reports/vat-category'
import { NavReceiptError } from './errors'
import type { NavReceiptData } from './types'

export interface PaperReceiptEntry {
  readonly number: string
  readonly vat: string
  readonly gross: number
  readonly modifying?: boolean | undefined
}

export interface PaperReceiptDay {
  readonly applicableDate: DateInput
  readonly currency?: string | undefined
  readonly exchangeRate?: number | null | undefined
  readonly entries: readonly PaperReceiptEntry[]
}

function invalid(message: string): NavReceiptError {
  return new NavReceiptError(message, { category: 'validation' })
}

function categoryOrder(name: string): number {
  const index = (NAV_VAT_CATEGORIES as readonly string[]).indexOf(name)
  return index === -1 ? NAV_VAT_CATEGORIES.length : index
}

export function paperReceiptReport(day: PaperReceiptDay): NavReceiptData {
  if (!Array.isArray(day.entries) || day.entries.length === 0) {
    throw invalid('A papír nyugtatömb napi jelentéséhez legalább egy tétel kell.')
  }
  const currency = (day.currency ?? 'HUF').trim().toUpperCase()
  const totals = new Map<string, { sale: number; modifying: number }>()
  const sales = new Set<string>()
  const modifying = new Set<string>()
  for (const entry of day.entries) {
    const number = typeof entry.number === 'string' ? entry.number.trim() : ''
    if (number === '') throw invalid('Minden papír nyugtatételhez add meg a nyugta sorszámát.')
    if (!Number.isFinite(entry.gross)) {
      throw invalid(`A(z) ${number} nyugta bruttó összege érvénytelen: ${entry.gross}`)
    }
    if (entry.modifying !== true && entry.gross < 0) {
      throw invalid(
        `A(z) ${number} eladási nyugta összege nem lehet negatív; a visszavételt jelöld modifying: true értékkel.`,
      )
    }
    const row = totals.get(entry.vat) ?? { sale: 0, modifying: 0 }
    if (entry.modifying === true) {
      row.modifying += entry.gross
      modifying.add(number)
    } else {
      row.sale += entry.gross
      sales.add(number)
    }
    totals.set(entry.vat, row)
  }
  const overlap = [...sales].filter((number) => modifying.has(number))
  if (overlap.length > 0) {
    throw invalid(
      `Ugyanaz a sorszám nem lehet egyszerre eladási és módosító bizonylat: ${overlap.join(', ')}.`,
    )
  }
  const vatCategories = [...totals.entries()]
    .map(([vat, row]) => ({
      vat,
      saleDocument: roundMoney(row.sale, 2),
      modifyingDocument: roundMoney(row.modifying, 2),
    }))
    .sort((a, b) => categoryOrder(a.vat) - categoryOrder(b.vat) || a.vat.localeCompare(b.vat))
  const numbers = [...sales, ...modifying].sort(compareReceiptNumbers)
  return {
    applicableDate: toAgentDate(day.applicableDate),
    serialNumber: numbers[0] ?? '',
    currency,
    exchangeRate: currency === 'HUF' ? null : (day.exchangeRate ?? null),
    vatCategories,
    total: roundMoney(
      vatCategories.reduce((sum, row) => sum + row.saleDocument + row.modifyingDocument, 0),
      2,
    ),
    numberOfSaleDocument: sales.size,
    numberOfModifyingDocument: modifying.size,
  }
}
