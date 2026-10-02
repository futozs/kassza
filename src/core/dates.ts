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

const budapestTimestampFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUDAPEST_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

const MINUTE_IN_MS = 60_000

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

export function toBudapestTimestamp(date: Date): string {
  const time = date.getTime()
  if (Number.isNaN(time)) {
    throw new RangeError('Érvénytelen dátum')
  }
  const parts = budapestTimestampFormatter.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? Number.NaN)
  const [year, month, day] = [get('year'), get('month'), get('day')]
  const [hour, minute, second] = [get('hour'), get('minute'), get('second')]
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second)
  const offsetMinutes = Math.round((localAsUtc - Math.floor(time / 1000) * 1000) / MINUTE_IN_MS)
  const sign = offsetMinutes < 0 ? '-' : '+'
  const absolute = Math.abs(offsetMinutes)
  const offset = `${sign}${pad2(Math.floor(absolute / 60))}:${pad2(absolute % 60)}`
  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}${offset}`
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
