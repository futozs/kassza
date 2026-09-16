import { isDigits, stripSeparators, weightedDigitSum } from './digits'

export type HungarianVatCode = '1' | '2' | '3' | '4' | '5'

export interface HungarianTaxNumber {
  readonly taxpayerId: string
  readonly vatCode: HungarianVatCode
  readonly countyCode: string
  readonly formatted: string
}

const TAXPAYER_ID_WEIGHTS = [9, 7, 3, 1, 9, 7, 3] as const

export const HUNGARIAN_TAX_COUNTY_CODES: readonly string[] = [
  ...Array.from({ length: 19 }, (_, index) => String(index + 2).padStart(2, '0')),
  ...Array.from({ length: 23 }, (_, index) => String(index + 22)),
  '51',
]

const COUNTY_CODE_SET: ReadonlySet<string> = new Set(HUNGARIAN_TAX_COUNTY_CODES)

function isVatCode(value: string): value is HungarianVatCode {
  return value >= '1' && value <= '5' && value.length === 1
}

export function isValidHungarianTaxpayerId(value: string): boolean {
  const digits = stripSeparators(value)
  if (!isDigits(digits, 8)) return false
  const checkDigit = (10 - (weightedDigitSum(digits.slice(0, 7), TAXPAYER_ID_WEIGHTS) % 10)) % 10
  return checkDigit === Number(digits[7])
}

export function parseHungarianTaxNumber(value: string): HungarianTaxNumber | undefined {
  if (typeof value !== 'string') return undefined
  const digits = stripSeparators(value)
  if (!isDigits(digits, 11)) return undefined
  const taxpayerId = digits.slice(0, 8)
  const vatCode = digits.slice(8, 9)
  const countyCode = digits.slice(9, 11)
  if (!isValidHungarianTaxpayerId(taxpayerId)) return undefined
  if (!isVatCode(vatCode) || !COUNTY_CODE_SET.has(countyCode)) return undefined
  return { taxpayerId, vatCode, countyCode, formatted: `${taxpayerId}-${vatCode}-${countyCode}` }
}

export function isValidHungarianTaxNumber(value: string): boolean {
  return parseHungarianTaxNumber(value) !== undefined
}

export function isValidHungarianGroupTaxNumber(value: string): boolean {
  return parseHungarianTaxNumber(value)?.vatCode === '5'
}

export function isHungarianVatGroupMemberTaxNumber(value: string): boolean {
  return parseHungarianTaxNumber(value)?.vatCode === '4'
}
