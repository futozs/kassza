import type { ReceiptVatRate } from '../receipts/types'

export const NAV_VAT_CATEGORIES = ['0%', '5%', '18%', '27%', 'Alanyi adómentes', 'Egyéb'] as const

export type NavVatCategory = (typeof NAV_VAT_CATEGORIES)[number]

const NUMERIC_CATEGORIES: ReadonlyMap<number, NavVatCategory> = new Map([
  [0, '0%'],
  [5, '5%'],
  [18, '18%'],
  [27, '27%'],
])

export function navVatCategory(vat: ReceiptVatRate): NavVatCategory {
  if (typeof vat === 'number') return NUMERIC_CATEGORIES.get(vat) ?? 'Egyéb'
  if (vat === 'AAM') return 'Alanyi adómentes'
  return 'Egyéb'
}

export function isNavVatCategory(value: string): value is NavVatCategory {
  return (NAV_VAT_CATEGORIES as readonly string[]).includes(value)
}
