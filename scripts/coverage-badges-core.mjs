export const COVERAGE_METRICS = [
  { key: 'lines', file: 'coverage-lines.json', label: 'sor-lefedettség' },
  { key: 'branches', file: 'coverage-branches.json', label: 'ág-lefedettség' },
  { key: 'functions', file: 'coverage-functions.json', label: 'függvény-lefedettség' },
  { key: 'statements', file: 'coverage-statements.json', label: 'utasítás-lefedettség' },
]

export function coverageColor(percent) {
  if (percent >= 95) return 'brightgreen'
  if (percent >= 90) return 'green'
  if (percent >= 80) return 'yellowgreen'
  return 'red'
}

function percentOf(summary, key) {
  const value = summary?.total?.[key]?.pct
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`A lefedettségi összesítőből hiányzik vagy hibás a(z) ${key} érték.`)
  }
  return value
}

export function coverageBadges(summary) {
  return COVERAGE_METRICS.map(({ key, file, label }) => {
    const percent = percentOf(summary, key)
    return {
      file,
      badge: {
        schemaVersion: 1,
        label,
        message: `${percent.toFixed(1)}%`,
        color: coverageColor(percent),
      },
    }
  })
}
