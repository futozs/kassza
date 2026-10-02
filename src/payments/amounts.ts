import { roundMoney } from '../money/rounding'

const ISO_ZERO_DECIMAL: ReadonlySet<string> = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'ISK',
  'JPY',
  'KMF',
  'KRW',
  'PYG',
  'RWF',
  'UGX',
  'UYI',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
])

const ISO_THREE_DECIMAL: ReadonlySet<string> = new Set([
  'BHD',
  'IQD',
  'JOD',
  'KWD',
  'LYD',
  'OMR',
  'TND',
])

const ISO_FOUR_DECIMAL: ReadonlySet<string> = new Set(['CLF', 'UYW'])

const STRIPE_ZERO_DECIMAL: ReadonlySet<string> = new Set([
  'BIF',
  'CLP',
  'DJF',
  'GNF',
  'JPY',
  'KMF',
  'KRW',
  'MGA',
  'PYG',
  'RWF',
  'VND',
  'VUV',
  'XAF',
  'XOF',
  'XPF',
])

const STRIPE_THREE_DECIMAL: ReadonlySet<string> = new Set(['BHD', 'JOD', 'KWD', 'OMR', 'TND'])

export type MinorUnitConvention = 'iso4217' | 'stripe'

export function currencyExponent(currency: string, convention: MinorUnitConvention): number {
  const code = currency.trim().toUpperCase()
  if (convention === 'stripe') {
    if (STRIPE_ZERO_DECIMAL.has(code)) return 0
    if (STRIPE_THREE_DECIMAL.has(code)) return 3
    return 2
  }
  if (ISO_ZERO_DECIMAL.has(code)) return 0
  if (ISO_THREE_DECIMAL.has(code)) return 3
  if (ISO_FOUR_DECIMAL.has(code)) return 4
  return 2
}

export function fromMinorUnits(
  amount: number,
  currency: string,
  convention: MinorUnitConvention,
): number {
  if (!Number.isFinite(amount)) {
    throw new RangeError(`Érvénytelen összeg (minor unit): ${amount}`)
  }
  const exponent = currencyExponent(currency, convention)
  return roundMoney(amount / 10 ** exponent, exponent)
}

export function parseDecimalAmount(value: string): number {
  const trimmed = value.trim()
  if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/.test(trimmed)) {
    throw new RangeError(`Érvénytelen decimális összeg: "${value}"`)
  }
  return Number(trimmed)
}

export function normalizeCurrency(currency: string): string {
  return currency.trim().toUpperCase()
}
