export const NUMERIC_VAT_RATES = [
  0, 1, 2, 2.1, 3, 4, 4.8, 5, 5.5, 6, 7, 7.7, 8, 8.1, 9, 9.5, 10, 11, 12, 13, 13.5, 14, 15, 16, 17,
  18, 19, 20, 21, 22, 23, 24, 25, 25.5, 26, 27,
] as const

export const SPECIAL_VAT_CODES = [
  'TAHK',
  'TAM',
  'AAM',
  'EUT',
  'EUKT',
  'F.AFA',
  'K.AFA',
  'HO',
  'EUE',
  'EUFADE',
  'EUFAD37',
  'ATK',
  'NAM',
  'EAM',
  'KBAUK',
  'KBAET',
] as const

export type NumericVatRate = (typeof NUMERIC_VAT_RATES)[number]
export type SpecialVatCode = (typeof SPECIAL_VAT_CODES)[number]
export type VatRate = NumericVatRate | SpecialVatCode | (number & {})

const numericRates: ReadonlySet<number> = new Set(NUMERIC_VAT_RATES)
const specialCodes: ReadonlySet<string> = new Set(SPECIAL_VAT_CODES)

export function isVatRate(value: unknown): value is VatRate {
  if (typeof value === 'number') return numericRates.has(value)
  return typeof value === 'string' && specialCodes.has(value)
}

export function vatPercentage(rate: VatRate): number {
  return typeof rate === 'number' ? rate : 0
}

export function formatVatRate(rate: VatRate): string {
  return String(rate)
}

export const HUF_CURRENCIES: ReadonlySet<string> = new Set(['HUF', 'Ft', 'FT', 'huf', 'ft'])

export function isHuf(currency: string | undefined): boolean {
  return currency === undefined || HUF_CURRENCIES.has(currency.trim())
}
