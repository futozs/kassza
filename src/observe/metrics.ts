export type MetricLabels = Readonly<Record<string, string>>

export interface Metrics {
  counter(name: string, labels?: MetricLabels, value?: number): void
  histogram(name: string, value: number, labels?: MetricLabels): void
}

export interface MetricsRegistry extends Metrics {
  renderPrometheus(): string
  reset(): void
}

export const DEFAULT_DURATION_BUCKETS_MS: readonly number[] = [
  50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 30_000, 60_000,
]

export const METRIC_HELP: Readonly<Record<string, string>> = {
  kassza_requests_total: 'Számla Agent próbálkozások száma kimenet szerint',
  kassza_request_duration_ms: 'Számla Agent próbálkozások időtartama ezredmásodpercben',
  kassza_retries_total: 'Automatikus újrapróbálások száma',
  kassza_maintenance_total: 'Karbantartás (1-es hiba) miatt elbukott kérések',
  kassza_unexpected_response_total: 'Ismeretlen formátumú Számlázz.hu válaszok',
  kassza_store_errors_total: 'Tároló (session, napló, zár, gyorsítótár) hibái',
  kassza_warnings_total: 'Figyelmeztetések fajta szerint',
  kassza_documents_total: 'Kiállított bizonylatok fajta és művelet szerint',
}

interface Histogram {
  readonly buckets: number[]
  sum: number
  count: number
}

const NAME_PATTERN = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/
const LABEL_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/

function escapeLabel(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"')
}

function labelKey(labels: MetricLabels | undefined): string {
  const entries = Object.entries(labels ?? {}).sort(([a], [b]) => a.localeCompare(b))
  for (const [name] of entries) {
    if (!LABEL_PATTERN.test(name)) throw new TypeError(`Érvénytelen metrika-címke: ${name}`)
  }
  return entries.map(([name, value]) => `${name}="${escapeLabel(value)}"`).join(',')
}

function assertName(name: string): void {
  if (!NAME_PATTERN.test(name)) throw new TypeError(`Érvénytelen metrikanév: ${name}`)
}

function series(name: string, key: string, extra?: string): string {
  const labels = [key, extra].filter(Boolean).join(',')
  return labels ? `${name}{${labels}}` : name
}

function formatNumber(value: number): string {
  if (value === Number.POSITIVE_INFINITY) return '+Inf'
  return String(value)
}

export function createMetricsRegistry(
  buckets: readonly number[] = DEFAULT_DURATION_BUCKETS_MS,
): MetricsRegistry {
  const sorted = [...buckets].sort((a, b) => a - b)
  if (sorted.some((bucket) => !Number.isFinite(bucket))) {
    throw new TypeError('A hisztogram határai véges számok legyenek.')
  }
  const counters = new Map<string, Map<string, number>>()
  const histograms = new Map<string, Map<string, Histogram>>()

  return {
    counter(name, labels, value = 1) {
      assertName(name)
      if (!Number.isFinite(value) || value < 0) {
        throw new TypeError(`A számláló csak nemnegatív értékkel nőhet, kapott: ${value}`)
      }
      const byLabels = counters.get(name) ?? new Map<string, number>()
      const key = labelKey(labels)
      byLabels.set(key, (byLabels.get(key) ?? 0) + value)
      counters.set(name, byLabels)
    },
    histogram(name, value, labels) {
      assertName(name)
      if (!Number.isFinite(value)) throw new TypeError(`A hisztogram értéke véges szám legyen.`)
      const byLabels = histograms.get(name) ?? new Map<string, Histogram>()
      const key = labelKey(labels)
      const histogram = byLabels.get(key) ?? {
        buckets: sorted.map(() => 0),
        sum: 0,
        count: 0,
      }
      sorted.forEach((bound, index) => {
        if (value <= bound) histogram.buckets[index] = (histogram.buckets[index] ?? 0) + 1
      })
      histogram.sum += value
      histogram.count += 1
      byLabels.set(key, histogram)
      histograms.set(name, byLabels)
    },
    renderPrometheus() {
      const lines: string[] = []
      for (const name of [...counters.keys()].sort()) {
        const help = METRIC_HELP[name]
        if (help) lines.push(`# HELP ${name} ${help}`)
        lines.push(`# TYPE ${name} counter`)
        for (const [key, value] of [...(counters.get(name) ?? [])].sort()) {
          lines.push(`${series(name, key)} ${formatNumber(value)}`)
        }
      }
      for (const name of [...histograms.keys()].sort()) {
        const help = METRIC_HELP[name]
        if (help) lines.push(`# HELP ${name} ${help}`)
        lines.push(`# TYPE ${name} histogram`)
        for (const [key, histogram] of [...(histograms.get(name) ?? [])].sort()) {
          sorted.forEach((bound, index) => {
            lines.push(
              `${series(`${name}_bucket`, key, `le="${formatNumber(bound)}"`)} ${histogram.buckets[index] ?? 0}`,
            )
          })
          lines.push(`${series(`${name}_bucket`, key, 'le="+Inf"')} ${histogram.count}`)
          lines.push(`${series(`${name}_sum`, key)} ${formatNumber(histogram.sum)}`)
          lines.push(`${series(`${name}_count`, key)} ${histogram.count}`)
        }
      }
      return lines.length > 0 ? `${lines.join('\n')}\n` : ''
    },
    reset() {
      counters.clear()
      histograms.clear()
    },
  }
}
