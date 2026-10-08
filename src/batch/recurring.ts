import { addBudapestDays, type DateInput, toAgentDate } from '../core/dates'
import { SzamlazzError } from '../core/errors'

export type BillingInterval = 'week' | 'month' | 'quarter' | 'year'

export interface BillingPeriodOptions {
  readonly interval: BillingInterval
  readonly anchor: DateInput
  readonly paymentDueInDays?: number | undefined
}

export interface BillingPeriod {
  readonly index: number
  readonly interval: BillingInterval
  readonly start: string
  readonly end: string
  readonly dueDate?: string | undefined
  readonly key: string
}

const INTERVALS: ReadonlySet<string> = new Set(['week', 'month', 'quarter', 'year'])
const MONTHS: Readonly<Record<Exclude<BillingInterval, 'week'>, number>> = {
  month: 1,
  quarter: 3,
  year: 12,
}

function invalid(message: string): SzamlazzError {
  return new SzamlazzError(message, { category: 'validation' })
}

function parts(day: string): [number, number, number] {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number]
  return [year, month, date]
}

function format(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function addDays(day: string, days: number): string {
  const [year, month, date] = parts(day)
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10)
}

function shift(anchor: string, interval: BillingInterval, count: number): string {
  if (interval === 'week') return addDays(anchor, count * 7)
  const [year, month, day] = parts(anchor)
  const total = year * 12 + (month - 1) + count * MONTHS[interval]
  const targetYear = Math.floor(total / 12)
  const targetMonth = (total % 12) + 1
  return format(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)))
}

function resolve(options: BillingPeriodOptions): { anchor: string; interval: BillingInterval } {
  if (!INTERVALS.has(options.interval)) {
    throw invalid(`Ismeretlen számlázási időszak: ${String(options.interval)}`)
  }
  let anchor: string
  try {
    anchor = toAgentDate(options.anchor)
  } catch (error) {
    throw invalid(error instanceof Error ? error.message : String(error))
  }
  const due = options.paymentDueInDays
  if (due !== undefined && (!Number.isInteger(due) || due < 0)) {
    throw invalid(`A paymentDueInDays nemnegatív egész legyen, kapott: ${due}`)
  }
  return { anchor, interval: options.interval }
}

export function billingPeriod(options: BillingPeriodOptions, index: number): BillingPeriod {
  if (!Number.isInteger(index) || index < 0) {
    throw invalid(`Az időszak sorszáma nemnegatív egész legyen, kapott: ${index}`)
  }
  const { anchor, interval } = resolve(options)
  const start = shift(anchor, interval, index)
  const end = addDays(shift(anchor, interval, index + 1), -1)
  const due = options.paymentDueInDays
  return {
    index,
    interval,
    start,
    end,
    ...(due === undefined ? {} : { dueDate: addDays(start, due) }),
    key: `${interval}:${start}`,
  }
}

export function billingPeriodAt(options: BillingPeriodOptions, date: DateInput): BillingPeriod {
  const { anchor, interval } = resolve(options)
  let day: string
  try {
    day = toAgentDate(date)
  } catch (error) {
    throw invalid(error instanceof Error ? error.message : String(error))
  }
  if (day < anchor)
    throw invalid(`A(z) ${day} dátum korábbi, mint az első időszak kezdete (${anchor}).`)
  const [anchorYear, anchorMonth] = parts(anchor)
  const [year, month] = parts(day)
  let index =
    interval === 'week'
      ? Math.floor(
          (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${anchor}T00:00:00Z`)) / (7 * 86_400_000),
        )
      : Math.floor(((year - anchorYear) * 12 + (month - anchorMonth)) / MONTHS[interval])
  while (index > 0 && shift(anchor, interval, index) > day) index -= 1
  while (shift(anchor, interval, index + 1) <= day) index += 1
  return billingPeriod(options, index)
}

export function billingPeriodsBetween(
  options: BillingPeriodOptions,
  from: DateInput,
  to: DateInput,
): BillingPeriod[] {
  const first = billingPeriodAt(options, from)
  const last = billingPeriodAt(options, to)
  const periods: BillingPeriod[] = []
  for (let index = first.index; index <= last.index; index++) {
    periods.push(billingPeriod(options, index))
  }
  return periods
}

export function todayPeriod(options: BillingPeriodOptions, now: Date = new Date()): BillingPeriod {
  return billingPeriodAt(options, addBudapestDays(now, 0))
}
