import { isVatRate, type VatRate } from '../money/vat'
import { RECEIPT_ONLY_VAT_CODES, type ReceiptVatRate } from '../receipts/types'
import { isJsonObject, type JsonObject } from './protocol'

export class ToolInputError extends Error {
  override readonly name: string = 'ToolInputError'
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const NUMERIC_TEXT = /^-?\d+(?:[.,]\d+)?$/

function field(path: string, key: string): string {
  return path === '' ? key : `${path}.${key}`
}

export function objectArg(value: unknown, path: string): JsonObject {
  if (!isJsonObject(value)) {
    throw new ToolInputError(`A(z) ${path} mezőnek objektumnak kell lennie.`)
  }
  return value
}

export function assertKnownKeys(value: JsonObject, allowed: readonly string[], path: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key))
  if (unknown.length === 0) return
  const where = path === '' ? 'a bemenetben' : `a(z) ${path} objektumban`
  throw new ToolInputError(
    `Ismeretlen mező ${where}: ${unknown.join(', ')}. Megengedett mezők: ${allowed.join(', ')}.`,
  )
}

export function optionalString(value: JsonObject, key: string, path: string): string | undefined {
  const raw = value[key]
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'string') {
    throw new ToolInputError(`A(z) ${field(path, key)} mezőnek szövegnek kell lennie.`)
  }
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

export function requiredString(value: JsonObject, key: string, path: string): string {
  const result = optionalString(value, key, path)
  if (result === undefined) {
    throw new ToolInputError(`A(z) ${field(path, key)} mező kötelező, és nem lehet üres.`)
  }
  return result
}

export function optionalNumber(value: JsonObject, key: string, path: string): number | undefined {
  const raw = value[key]
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new ToolInputError(`A(z) ${field(path, key)} mezőnek véges számnak kell lennie.`)
  }
  return raw
}

export function optionalInteger(value: JsonObject, key: string, path: string): number | undefined {
  const result = optionalNumber(value, key, path)
  if (result !== undefined && !Number.isInteger(result)) {
    throw new ToolInputError(`A(z) ${field(path, key)} mezőnek egész számnak kell lennie.`)
  }
  return result
}

export function optionalBoolean(value: JsonObject, key: string, path: string): boolean | undefined {
  const raw = value[key]
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== 'boolean') {
    throw new ToolInputError(
      `A(z) ${field(path, key)} mezőnek true vagy false értéknek kell lennie.`,
    )
  }
  return raw
}

export function optionalDate(value: JsonObject, key: string, path: string): string | undefined {
  const result = optionalString(value, key, path)
  if (result !== undefined && !DATE_PATTERN.test(result)) {
    throw new ToolInputError(
      `A(z) ${field(path, key)} mezőt ÉÉÉÉ-HH-NN formában add meg (például 2026-10-02).`,
    )
  }
  return result
}

export function optionalEnum<T extends string>(
  value: JsonObject,
  key: string,
  path: string,
  allowed: readonly T[],
): T | undefined {
  const raw = optionalString(value, key, path)
  if (raw === undefined) return undefined
  const match = allowed.find((candidate) => candidate === raw)
  if (match === undefined) {
    throw new ToolInputError(
      `A(z) ${field(path, key)} értéke nem megengedett: ${raw}. Lehetséges értékek: ${allowed.join(', ')}.`,
    )
  }
  return match
}

export function optionalArray(
  value: JsonObject,
  key: string,
  path: string,
): readonly unknown[] | undefined {
  const raw = value[key]
  if (raw === undefined || raw === null) return undefined
  if (!Array.isArray(raw))
    throw new ToolInputError(`A(z) ${field(path, key)} mezőnek tömbnek kell lennie.`)
  return raw
}

export function requiredArray(
  value: JsonObject,
  key: string,
  path: string,
  limits: { readonly min: number; readonly max: number },
): readonly unknown[] {
  const result = optionalArray(value, key, path) ?? []
  if (result.length < limits.min || result.length > limits.max) {
    throw new ToolInputError(
      `A(z) ${field(path, key)} tömbben ${limits.min} és ${limits.max} közötti számú elem lehet, kapott: ${result.length}.`,
    )
  }
  return result
}

function numericFromText(value: unknown): unknown {
  if (typeof value !== 'string' || !NUMERIC_TEXT.test(value.trim())) return value
  return Number(value.trim().replace(',', '.'))
}

function vatFailure(value: unknown, path: string): ToolInputError {
  return new ToolInputError(
    `Ismeretlen áfakulcs a(z) ${path} mezőben: ${JSON.stringify(value)}. Add meg számként (például 27, 18, 5 vagy 0) vagy kódként (például "AAM", "TAM", "EUT", "EUKT", "F.AFA", "K.AFA").`,
  )
}

export function invoiceVat(value: unknown, path: string): VatRate {
  const candidate = numericFromText(value)
  if (isVatRate(candidate)) return candidate
  throw vatFailure(value, path)
}

export function receiptVat(value: unknown, path: string): ReceiptVatRate {
  const candidate = numericFromText(value)
  if (isVatRate(candidate)) return candidate
  const code = RECEIPT_ONLY_VAT_CODES.find((entry) => entry === candidate)
  if (code !== undefined) return code
  throw vatFailure(value, path)
}
