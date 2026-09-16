export function roundMoney(value: number, decimals = 0): number {
  if (!Number.isFinite(value)) throw new RangeError(`Nem véges összeg: ${value}`)
  const factor = 10 ** decimals
  const scaled = Number((Math.abs(value) * factor).toPrecision(15))
  const rounded = (Math.sign(value) * Math.round(scaled)) / factor
  return rounded === 0 ? 0 : rounded
}

export function decimalPlaces(value: number): number {
  if (!Number.isFinite(value) || Number.isInteger(value)) return 0
  const normalized = Number(value.toPrecision(15)).toString()
  const exponentMatch = /e-(\d+)$/.exec(normalized)
  if (exponentMatch?.[1]) return Number(exponentMatch[1])
  return normalized.split('.')[1]?.length ?? 0
}

export function addMoney(...values: number[]): number {
  return roundMoney(
    values.reduce((sum, value) => sum + value, 0),
    Math.max(0, ...values.map(decimalPlaces)),
  )
}
