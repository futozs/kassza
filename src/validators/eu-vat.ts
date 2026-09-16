export type EuVatCountryPrefix =
  | 'AT'
  | 'BE'
  | 'BG'
  | 'CY'
  | 'CZ'
  | 'DE'
  | 'DK'
  | 'EE'
  | 'EL'
  | 'ES'
  | 'FI'
  | 'FR'
  | 'HR'
  | 'HU'
  | 'IE'
  | 'IT'
  | 'LT'
  | 'LU'
  | 'LV'
  | 'MT'
  | 'NL'
  | 'PL'
  | 'PT'
  | 'RO'
  | 'SE'
  | 'SI'
  | 'SK'
  | 'XI'

export const EU_VAT_NUMBER_PATTERNS: Readonly<Record<EuVatCountryPrefix, RegExp>> = {
  AT: /^U\d{8}$/,
  BE: /^[01]\d{9}$/,
  BG: /^\d{9,10}$/,
  CY: /^\d{8}[A-Z]$/,
  CZ: /^\d{8,10}$/,
  DE: /^\d{9}$/,
  DK: /^\d{8}$/,
  EE: /^\d{9}$/,
  EL: /^\d{9}$/,
  ES: /^[A-Z0-9]\d{7}[A-Z0-9]$/,
  FI: /^\d{8}$/,
  FR: /^[A-HJ-NP-Z0-9]{2}\d{9}$/,
  HR: /^\d{11}$/,
  HU: /^\d{8}$/,
  IE: /^(?:\d{7}[A-W][A-I]?|\d[A-Z+*]\d{5}[A-W])$/,
  IT: /^\d{11}$/,
  LT: /^(?:\d{9}|\d{12})$/,
  LU: /^\d{8}$/,
  LV: /^\d{11}$/,
  MT: /^\d{8}$/,
  NL: /^\d{9}B\d{2}$/,
  PL: /^\d{10}$/,
  PT: /^\d{9}$/,
  RO: /^[1-9]\d{1,9}$/,
  SE: /^\d{10}01$/,
  SI: /^\d{8}$/,
  SK: /^\d{10}$/,
  XI: /^(?:\d{9}|\d{12}|GD[0-4]\d{2}|HA[5-9]\d{2})$/,
}

function isEuVatCountryPrefix(value: string): value is EuVatCountryPrefix {
  return Object.hasOwn(EU_VAT_NUMBER_PATTERNS, value)
}

export function normalizeEuVatNumber(value: string): string {
  return value.replace(/[\s.-]+/g, '').toUpperCase()
}

export function isValidEuVatNumber(value: string): boolean {
  if (typeof value !== 'string') return false
  const normalized = normalizeEuVatNumber(value)
  const prefix = normalized.slice(0, 2)
  if (!isEuVatCountryPrefix(prefix)) return false
  return EU_VAT_NUMBER_PATTERNS[prefix].test(normalized.slice(2))
}
