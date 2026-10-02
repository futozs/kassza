import { roundMoney } from '../money/rounding'
import type { Receipt, ReceiptVatRate } from '../receipts/types'
import { compareReceiptNumbers, navCurrencyCode } from './nav'

export interface DailyClosePaymentTotal {
  readonly method: string
  readonly amount: number
}

export interface DailyCloseVatTotal {
  readonly vat: ReceiptVatRate
  readonly netAmount: number
  readonly vatAmount: number
  readonly grossAmount: number
}

export interface DailyCloseSummary {
  readonly date: string
  readonly currency: string
  readonly receiptCount: number
  readonly reversalCount: number
  readonly salesGross: number
  readonly reversalsGross: number
  readonly grossTotal: number
  readonly byPaymentMethod: readonly DailyClosePaymentTotal[]
  readonly byVat: readonly DailyCloseVatTotal[]
  readonly receiptNumbers: readonly string[]
}

export interface DailyCloseOptions {
  readonly includeTest?: boolean | undefined
}

interface CloseBucket {
  readonly date: string
  readonly currency: string
  receiptCount: number
  reversalCount: number
  salesGross: number
  reversalsGross: number
  readonly payments: Map<string, number>
  readonly vats: Map<string, { vat: ReceiptVatRate; net: number; vatAmount: number; gross: number }>
  readonly numbers: string[]
}

function sign(receipt: Receipt, amount: number): number {
  return receipt.type === 'reversal' ? -Math.abs(amount) : amount
}

function addPayments(bucket: CloseBucket, receipt: Receipt): void {
  const entries =
    receipt.payments.length > 0
      ? receipt.payments.map((payment) => ({ method: payment.method, amount: payment.amount }))
      : [{ method: receipt.paymentMethod, amount: receipt.totals.grossAmount }]
  for (const entry of entries) {
    const method = entry.method.trim() || 'ismeretlen'
    bucket.payments.set(method, (bucket.payments.get(method) ?? 0) + sign(receipt, entry.amount))
  }
}

function addVats(bucket: CloseBucket, receipt: Receipt): void {
  for (const item of receipt.items) {
    const key = String(item.vat)
    const totals = bucket.vats.get(key) ?? { vat: item.vat, net: 0, vatAmount: 0, gross: 0 }
    totals.net += sign(receipt, item.netAmount)
    totals.vatAmount += sign(receipt, item.vatAmount)
    totals.gross += sign(receipt, item.grossAmount)
    bucket.vats.set(key, totals)
  }
}

function toSummary(bucket: CloseBucket): DailyCloseSummary {
  const salesGross = roundMoney(bucket.salesGross, 2)
  const reversalsGross = roundMoney(bucket.reversalsGross, 2)
  return {
    date: bucket.date,
    currency: bucket.currency,
    receiptCount: bucket.receiptCount,
    reversalCount: bucket.reversalCount,
    salesGross,
    reversalsGross,
    grossTotal: roundMoney(salesGross + reversalsGross, 2),
    byPaymentMethod: [...bucket.payments.entries()]
      .map(([method, amount]) => ({ method, amount: roundMoney(amount, 2) }))
      .sort((a, b) => a.method.localeCompare(b.method, 'hu')),
    byVat: [...bucket.vats.values()]
      .map((totals) => ({
        vat: totals.vat,
        netAmount: roundMoney(totals.net, 2),
        vatAmount: roundMoney(totals.vatAmount, 2),
        grossAmount: roundMoney(totals.gross, 2),
      }))
      .sort((a, b) => String(a.vat).localeCompare(String(b.vat), 'hu', { numeric: true })),
    receiptNumbers: [...bucket.numbers].sort(compareReceiptNumbers),
  }
}

export function dailyClose(
  receipts: readonly Receipt[],
  options: DailyCloseOptions = {},
): DailyCloseSummary[] {
  const buckets = new Map<string, CloseBucket>()
  const seen = new Set<string>()
  for (const receipt of receipts) {
    if (receipt.isTest && options.includeTest !== true) continue
    if (seen.has(receipt.number)) continue
    seen.add(receipt.number)
    const currency = navCurrencyCode(receipt.currency)
    const key = `${receipt.issueDate}|${currency}`
    const bucket: CloseBucket = buckets.get(key) ?? {
      date: receipt.issueDate,
      currency,
      receiptCount: 0,
      reversalCount: 0,
      salesGross: 0,
      reversalsGross: 0,
      payments: new Map(),
      vats: new Map(),
      numbers: [],
    }
    buckets.set(key, bucket)
    bucket.numbers.push(receipt.number)
    if (receipt.type === 'reversal') {
      bucket.reversalCount += 1
      bucket.reversalsGross += sign(receipt, receipt.totals.grossAmount)
    } else {
      bucket.receiptCount += 1
      bucket.salesGross += receipt.totals.grossAmount
    }
    addPayments(bucket, receipt)
    addVats(bucket, receipt)
  }
  return [...buckets.values()]
    .map(toSummary)
    .sort((a, b) => a.date.localeCompare(b.date) || a.currency.localeCompare(b.currency))
}
