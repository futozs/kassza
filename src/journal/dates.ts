import { addBudapestDays, toAgentDate } from '../core/dates'
import { SzamlazzError } from '../core/errors'
import type { JournalRange } from './types'

export const MAX_JOURNAL_RANGE_DAYS = 366

const DAY_IN_MS = 86_400_000

function invalid(message: string): SzamlazzError {
  return new SzamlazzError(message, { category: 'validation' })
}

function parseDay(value: string, field: string): string {
  try {
    return toAgentDate(value)
  } catch {
    throw invalid(`A napló ${field} dátuma YYYY-MM-DD formájú legyen, kapott: ${value}`)
  }
}

function dayNumber(day: string): number {
  return Date.parse(`${day}T00:00:00Z`) / DAY_IN_MS
}

export function normalizeRange(range: JournalRange): JournalRange {
  const from = parseDay(range.from, 'from')
  const to = parseDay(range.to, 'to')
  const span = dayNumber(to) - dayNumber(from) + 1
  if (span < 1)
    throw invalid(`A napló időszakának kezdete (${from}) később van, mint a vége (${to}).`)
  if (span > MAX_JOURNAL_RANGE_DAYS) {
    throw invalid(
      `A napló egyszerre legfeljebb ${MAX_JOURNAL_RANGE_DAYS} napot kérdez le, kapott: ${span} nap.`,
    )
  }
  return { from, to }
}

export function daysOf(range: JournalRange): string[] {
  const { from, to } = normalizeRange(range)
  const days: string[] = []
  const last = dayNumber(to)
  for (let day = dayNumber(from); day <= last; day++) {
    days.push(new Date(day * DAY_IN_MS).toISOString().slice(0, 10))
  }
  return days
}

export function inRange(day: string, range: JournalRange): boolean {
  return day >= range.from && day <= range.to
}

export function recentRange(now: Date, days: number): JournalRange {
  return { from: addBudapestDays(now, -(days - 1)), to: toAgentDate(now) }
}
