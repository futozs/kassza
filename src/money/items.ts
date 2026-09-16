import { SzamlazzError } from '../core/errors'
import { roundMoney } from './rounding'
import { isHuf, isVatRate, type VatRate, vatPercentage } from './vat'

export interface ItemPriceInput {
  readonly quantity?: number
  readonly vat: VatRate
  readonly netUnitPrice?: number
  readonly grossUnitPrice?: number
  readonly netAmount?: number
  readonly vatAmount?: number
  readonly grossAmount?: number
}

export interface ItemAmounts {
  readonly quantity: number
  readonly vat: VatRate
  readonly netUnitPrice: number
  readonly netAmount: number
  readonly vatAmount: number
  readonly grossAmount: number
}

export type DocumentKind = 'invoice' | 'receipt'

const FOREIGN_CURRENCY_DECIMALS = 2
const RECEIPT_HUF_DECIMALS = 2
const MAX_UNIT_PRICE_DECIMALS = 6

function validationError(message: string): SzamlazzError {
  return new SzamlazzError(message, { category: 'validation' })
}

function assertFiniteNumber(value: number | undefined, field: string): void {
  if (value !== undefined && !Number.isFinite(value)) {
    throw validationError(`A(z) ${field} mező értéke nem érvényes szám: ${value}`)
  }
}

function unitPriceFor(amount: number, quantity: number, decimals: number): number {
  const exact = amount / quantity
  for (let precision = 2; precision <= MAX_UNIT_PRICE_DECIMALS; precision++) {
    const candidate = roundMoney(exact, precision)
    if (roundMoney(candidate * quantity, decimals) === amount) return candidate
  }
  return roundMoney(exact, MAX_UNIT_PRICE_DECIMALS)
}

interface RoundingRule {
  readonly netDecimals: number
  readonly vatDecimals: number
  readonly grossDecimals: number
}

function roundingRuleFor(kind: DocumentKind, currency: string | undefined): RoundingRule {
  if (!isHuf(currency)) {
    return {
      netDecimals: FOREIGN_CURRENCY_DECIMALS,
      vatDecimals: FOREIGN_CURRENCY_DECIMALS,
      grossDecimals: FOREIGN_CURRENCY_DECIMALS,
    }
  }
  if (kind === 'receipt') {
    return {
      netDecimals: RECEIPT_HUF_DECIMALS,
      vatDecimals: RECEIPT_HUF_DECIMALS,
      grossDecimals: 0,
    }
  }
  return { netDecimals: 0, vatDecimals: 0, grossDecimals: 0 }
}

function fromNet(
  input: ItemPriceInput & { netUnitPrice: number },
  quantity: number,
  rule: RoundingRule,
): ItemAmounts {
  const percentage = vatPercentage(input.vat)
  const netAmount = roundMoney(input.netUnitPrice * quantity, rule.netDecimals)
  if (rule.grossDecimals < rule.netDecimals) {
    const grossAmount = roundMoney(netAmount * (1 + percentage / 100), rule.grossDecimals)
    const vatAmount = roundMoney(grossAmount - netAmount, rule.vatDecimals)
    return {
      quantity,
      vat: input.vat,
      netUnitPrice: input.netUnitPrice,
      netAmount,
      vatAmount,
      grossAmount,
    }
  }
  const vatAmount = roundMoney((netAmount * percentage) / 100, rule.vatDecimals)
  const grossAmount = roundMoney(netAmount + vatAmount, rule.grossDecimals)
  return {
    quantity,
    vat: input.vat,
    netUnitPrice: input.netUnitPrice,
    netAmount,
    vatAmount,
    grossAmount,
  }
}

function fromGross(
  input: ItemPriceInput & { grossUnitPrice: number },
  quantity: number,
  rule: RoundingRule,
): ItemAmounts {
  const percentage = vatPercentage(input.vat)
  const grossAmount = roundMoney(input.grossUnitPrice * quantity, rule.grossDecimals)
  const vatAmount = roundMoney((grossAmount * percentage) / (100 + percentage), rule.vatDecimals)
  const netAmount = roundMoney(grossAmount - vatAmount, rule.netDecimals)
  return {
    quantity,
    vat: input.vat,
    netUnitPrice: unitPriceFor(netAmount, quantity, rule.netDecimals),
    netAmount,
    vatAmount,
    grossAmount,
  }
}

function fromExplicit(input: ItemPriceInput, quantity: number): ItemAmounts {
  const { netAmount, vatAmount, grossAmount } = input
  if (netAmount === undefined || vatAmount === undefined || grossAmount === undefined) {
    throw validationError(
      'Explicit összegeknél a netAmount, vatAmount és grossAmount mezőt is meg kell adni.',
    )
  }
  return {
    quantity,
    vat: input.vat,
    netUnitPrice:
      input.netUnitPrice ?? unitPriceFor(netAmount, quantity, FOREIGN_CURRENCY_DECIMALS),
    netAmount,
    vatAmount,
    grossAmount,
  }
}

export function calculateItemAmounts(
  input: ItemPriceInput,
  options: { readonly kind: DocumentKind; readonly currency?: string | undefined },
): ItemAmounts {
  const quantity = input.quantity ?? 1
  assertFiniteNumber(quantity, 'quantity')
  assertFiniteNumber(input.netUnitPrice, 'netUnitPrice')
  assertFiniteNumber(input.grossUnitPrice, 'grossUnitPrice')
  assertFiniteNumber(input.netAmount, 'netAmount')
  assertFiniteNumber(input.vatAmount, 'vatAmount')
  assertFiniteNumber(input.grossAmount, 'grossAmount')
  if (quantity === 0) throw validationError('A tétel mennyisége nem lehet 0.')
  if (!isVatRate(input.vat)) throw validationError(`Ismeretlen áfakulcs: ${String(input.vat)}`)

  const hasExplicit =
    input.netAmount !== undefined ||
    input.vatAmount !== undefined ||
    input.grossAmount !== undefined
  if (hasExplicit) return fromExplicit(input, quantity)

  if (input.netUnitPrice !== undefined && input.grossUnitPrice !== undefined) {
    throw validationError('A netUnitPrice és a grossUnitPrice közül csak az egyiket add meg.')
  }
  const rule = roundingRuleFor(options.kind, options.currency)
  if (input.netUnitPrice !== undefined) {
    return fromNet({ ...input, netUnitPrice: input.netUnitPrice }, quantity, rule)
  }
  if (input.grossUnitPrice !== undefined) {
    return fromGross({ ...input, grossUnitPrice: input.grossUnitPrice }, quantity, rule)
  }
  throw validationError('A tételnél add meg a netUnitPrice vagy a grossUnitPrice mezőt.')
}

export function calculateInvoiceItem(input: ItemPriceInput, currency?: string): ItemAmounts {
  return calculateItemAmounts(input, { kind: 'invoice', currency })
}

export function calculateReceiptItem(input: ItemPriceInput, currency?: string): ItemAmounts {
  return calculateItemAmounts(input, { kind: 'receipt', currency })
}

export interface VatBreakdown {
  readonly vat: VatRate
  readonly netAmount: number
  readonly vatAmount: number
  readonly grossAmount: number
}

export interface DocumentTotals {
  readonly netAmount: number
  readonly vatAmount: number
  readonly grossAmount: number
  readonly byVat: readonly VatBreakdown[]
}

export function summarizeItems(items: readonly ItemAmounts[]): DocumentTotals {
  const byVat = new Map<
    string,
    { vat: VatRate; netAmount: number; vatAmount: number; grossAmount: number }
  >()
  let netAmount = 0
  let vatAmount = 0
  let grossAmount = 0
  for (const item of items) {
    netAmount += item.netAmount
    vatAmount += item.vatAmount
    grossAmount += item.grossAmount
    const key = String(item.vat)
    const bucket = byVat.get(key) ?? { vat: item.vat, netAmount: 0, vatAmount: 0, grossAmount: 0 }
    bucket.netAmount += item.netAmount
    bucket.vatAmount += item.vatAmount
    bucket.grossAmount += item.grossAmount
    byVat.set(key, bucket)
  }
  const round = (value: number): number => roundMoney(value, 6)
  return {
    netAmount: round(netAmount),
    vatAmount: round(vatAmount),
    grossAmount: round(grossAmount),
    byVat: [...byVat.values()].map((bucket) => ({
      vat: bucket.vat,
      netAmount: round(bucket.netAmount),
      vatAmount: round(bucket.vatAmount),
      grossAmount: round(bucket.grossAmount),
    })),
  }
}
