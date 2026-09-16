import { isDigits, stripSeparators, weightedDigitSum } from './digits'

export interface HungarianBankAccount {
  readonly digits: string
  readonly bankCode: string
  readonly branchCode: string
  readonly formatted: string
}

const GIRO_WEIGHTS = [9, 7, 3, 1] as const
const HU_IBAN_LENGTH = 28

function hasValidCheckDigit(block: string): boolean {
  return weightedDigitSum(block, GIRO_WEIGHTS) % 10 === 0
}

function groupsOfEight(digits: string): string {
  return digits.match(/\d{8}/g)?.join('-') ?? digits
}

export function parseHungarianBankAccount(value: string): HungarianBankAccount | undefined {
  if (typeof value !== 'string') return undefined
  const digits = stripSeparators(value)
  if (!isDigits(digits, 16) && !isDigits(digits, 24)) return undefined
  if (!hasValidCheckDigit(digits.slice(0, 8)) || !hasValidCheckDigit(digits.slice(8))) {
    return undefined
  }
  return {
    digits,
    bankCode: digits.slice(0, 3),
    branchCode: digits.slice(3, 7),
    formatted: groupsOfEight(digits),
  }
}

export function isValidHungarianBankAccount(value: string): boolean {
  return parseHungarianBankAccount(value) !== undefined
}

export function formatHungarianBankAccount(value: string): string | undefined {
  return parseHungarianBankAccount(value)?.formatted
}

function ibanMod97(iban: string): number {
  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`
  let remainder = 0
  for (const char of rearranged) {
    const code = char.charCodeAt(0)
    const chunk = code >= 65 ? String(code - 55) : char
    for (const digit of chunk) remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder
}

export function isValidHungarianIban(value: string): boolean {
  if (typeof value !== 'string') return false
  const iban = stripSeparators(value).toUpperCase()
  if (iban.length !== HU_IBAN_LENGTH || !iban.startsWith('HU')) return false
  if (!isDigits(iban.slice(2), HU_IBAN_LENGTH - 2)) return false
  return ibanMod97(iban) === 1
}
