const BUDAPEST_TIME_ZONE = 'Europe/Budapest'

const budapestDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUDAPEST_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function toBudapestDate(date: Date): string {
  if (Number.isNaN(date.getTime())) {
    throw new RangeError('Érvénytelen dátum')
  }
  const parts = budapestDateFormatter.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

const DAY_IN_MS = 86_400_000

export function addBudapestDays(date: Date, days: number): string {
  if (!Number.isInteger(days)) {
    throw new RangeError(`A napok számának egésznek kell lennie, kapott: ${days}`)
  }
  const [year, month, day] = toBudapestDate(date).split('-').map(Number) as [number, number, number]
  const noonUtc = Date.UTC(year, month - 1, day, 12)
  return new Date(noonUtc + days * DAY_IN_MS).toISOString().slice(0, 10)
}

export type DateInput = Date | string

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function toAgentDate(input: DateInput): string {
  if (input instanceof Date) return toBudapestDate(input)
  const match = ISO_DATE.exec(input.trim())
  if (!match) {
    throw new RangeError(
      `A dátumot YYYY-MM-DD formában vagy Date objektumként add meg, kapott: ${input}`,
    )
  }
  const [, year, month, day] = match
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (parsed.toISOString().slice(0, 10) !== match[0]) {
    throw new RangeError(`Nem létező naptári dátum: ${input}`)
  }
  return match[0]
}

export function todayInBudapest(now: Date = new Date()): string {
  return toBudapestDate(now)
}
