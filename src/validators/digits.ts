const SEPARATORS = /[\s-]+/g

export function stripSeparators(value: string): string {
  return value.replace(SEPARATORS, '')
}

export function isDigits(value: string, length?: number): boolean {
  if (!/^\d+$/.test(value)) return false
  return length === undefined || value.length === length
}

export function weightedDigitSum(digits: string, weights: readonly number[]): number {
  let sum = 0
  for (let index = 0; index < digits.length; index++) {
    sum += Number(digits[index]) * (weights[index % weights.length] ?? 0)
  }
  return sum
}
