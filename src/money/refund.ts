import { SzamlazzError } from '../core/errors'
import { decimalPlaces } from './rounding'
import type { VatRate } from './vat'

export type RefundVat = string | number

export interface RefundableItem<V extends RefundVat = VatRate> {
  readonly name: string
  readonly vat: V
  readonly grossAmount: number
  readonly unit?: string | undefined
  readonly identifier?: string | undefined
}

export interface RefundAllocation<V extends RefundVat = VatRate> {
  readonly index: number
  readonly name: string
  readonly vat: V
  readonly grossAmount: number
  readonly unit?: string | undefined
  readonly identifier?: string | undefined
}

export interface AllocateRefundOptions {
  readonly decimals?: number | undefined
  readonly refundedBefore?: number | undefined
}

function invalid(message: string): SzamlazzError {
  return new SzamlazzError(message, { category: 'validation' })
}

function toMinor(value: number, decimals: number, field: string): bigint {
  if (!Number.isFinite(value)) throw invalid(`A(z) ${field} nem véges szám: ${value}`)
  if (decimalPlaces(value) > decimals) {
    throw invalid(
      `A(z) ${field} (${value}) több tizedesjegyet tartalmaz, mint amennyit a bizonylat pénzneme enged (${decimals}).`,
    )
  }
  return BigInt(Math.round(Number((value * 10 ** decimals).toPrecision(15))))
}

function fromMinor(value: bigint, decimals: number): number {
  return Number(value) / 10 ** decimals
}

function resolveDecimals(value: number | undefined): number {
  if (value === undefined) return 0
  if (!Number.isInteger(value) || value < 0 || value > 6) {
    throw invalid(`A decimals értéke 0 és 6 közötti egész legyen, kapott: ${value}`)
  }
  return value
}

function proportional(weights: readonly bigint[], amount: bigint): bigint[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0n)
  if (total === 0n || amount === 0n) return weights.map(() => 0n)
  const shares = weights.map((weight) => (amount * weight) / total)
  const remainders = weights.map((weight, index) => ({
    index,
    weight,
    remainder: (amount * weight) % total,
  }))
  let left = amount - shares.reduce((sum, share) => sum + share, 0n)
  remainders.sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1
    if (a.weight !== b.weight) return a.weight > b.weight ? -1 : 1
    return a.index - b.index
  })
  for (const entry of remainders) {
    if (left === 0n) break
    if (entry.remainder === 0n) continue
    shares[entry.index] = (shares[entry.index] ?? 0n) + 1n
    left -= 1n
  }
  return shares
}

export function allocateRefund<V extends RefundVat = VatRate>(
  items: readonly RefundableItem<V>[],
  refundGross: number,
  options: AllocateRefundOptions = {},
): RefundAllocation<V>[] {
  const decimals = resolveDecimals(options.decimals)
  if (items.length === 0) throw invalid('A visszatérítés szétosztásához legalább egy tétel kell.')
  const gross = items.map((item, index) => {
    const minor = toMinor(item.grossAmount, decimals, `${index + 1}. tétel bruttó összege`)
    if (minor < 0n) throw invalid(`A(z) ${index + 1}. tétel bruttó összege negatív.`)
    return minor
  })
  const total = gross.reduce((sum, value) => sum + value, 0n)
  const refund = toMinor(refundGross, decimals, 'visszatérített összeg')
  const before = toMinor(options.refundedBefore ?? 0, decimals, 'korábban visszatérített összeg')
  if (refund <= 0n) throw invalid('A visszatérített összeg legyen pozitív.')
  if (before < 0n) throw invalid('A korábban visszatérített összeg nem lehet negatív.')
  if (before + refund > total) {
    throw invalid(
      `A visszatérítések összege (${fromMinor(before + refund, decimals)}) nagyobb, mint az eredeti bizonylat bruttó összege (${fromMinor(total, decimals)}).`,
    )
  }
  const earlier = proportional(gross, before)
  const remaining = gross.map((value, index) => value - (earlier[index] ?? 0n))
  const shares = proportional(remaining, refund)
  return items.flatMap((item, index) => {
    const share = shares[index] ?? 0n
    if (share === 0n) return []
    const allocation: RefundAllocation<V> = {
      index,
      name: item.name,
      vat: item.vat,
      grossAmount: fromMinor(share, decimals),
      ...(item.unit === undefined ? {} : { unit: item.unit }),
      ...(item.identifier === undefined ? {} : { identifier: item.identifier }),
    }
    return [allocation]
  })
}
