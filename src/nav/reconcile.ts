import { roundMoney } from '../money/rounding'
import type { NavReceiptData, NavReportListItem } from './types'

const AMOUNT_TOLERANCE = 0.005

export interface NavReconciledPair {
  readonly local: NavReceiptData
  readonly remote: NavReportListItem
}

export interface NavMismatch extends NavReconciledPair {
  readonly differences: readonly string[]
}

export interface NavReconciliation {
  readonly matched: readonly NavReconciledPair[]
  readonly mismatched: readonly NavMismatch[]
  readonly missing: readonly NavReceiptData[]
  readonly unexpected: readonly NavReportListItem[]
}

function keyOf(applicableDate: string, serialNumber: string): string {
  return JSON.stringify([applicableDate, serialNumber])
}

function differences(local: NavReceiptData, remote: NavReportListItem): string[] {
  const found: string[] = []
  if (Math.abs(roundMoney(local.total, 2) - remote.totalAmount) > AMOUNT_TOLERANCE) {
    found.push(`végösszeg: helyi ${local.total}, NAV ${remote.totalAmount}`)
  }
  if (local.numberOfSaleDocument !== remote.numberOfSaleDocument) {
    found.push(
      `nyugták száma: helyi ${local.numberOfSaleDocument}, NAV ${remote.numberOfSaleDocument}`,
    )
  }
  if (local.numberOfModifyingDocument !== remote.numberOfModifyingDocument) {
    found.push(
      `módosító bizonylatok száma: helyi ${local.numberOfModifyingDocument}, NAV ${remote.numberOfModifyingDocument}`,
    )
  }
  return found
}

export function reconcileNavReports(
  local: readonly NavReceiptData[],
  remote: readonly NavReportListItem[],
): NavReconciliation {
  const recorded = new Map<string, NavReportListItem[]>()
  for (const item of remote) {
    if (item.status !== 'RECORDED') continue
    const key = keyOf(item.applicableDate, item.serialNumber)
    recorded.set(key, [...(recorded.get(key) ?? []), item])
  }
  const matched: NavReconciledPair[] = []
  const mismatched: NavMismatch[] = []
  const missing: NavReceiptData[] = []
  for (const report of local) {
    const key = keyOf(report.applicableDate, report.serialNumber)
    const candidates = recorded.get(key)
    const counterpart = candidates?.shift()
    if (!counterpart) {
      missing.push(report)
      continue
    }
    const found = differences(report, counterpart)
    if (found.length === 0) matched.push({ local: report, remote: counterpart })
    else mismatched.push({ local: report, remote: counterpart, differences: found })
  }
  const unexpected = [...recorded.values()].flat()
  return { matched, mismatched, missing, unexpected }
}
