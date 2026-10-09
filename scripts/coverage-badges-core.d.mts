export interface CoverageMetric {
  readonly key: 'lines' | 'branches' | 'functions' | 'statements'
  readonly file: string
  readonly label: string
}
export interface ShieldsEndpointBadge {
  readonly schemaVersion: 1
  readonly label: string
  readonly message: string
  readonly color: string
}
export declare const COVERAGE_METRICS: readonly CoverageMetric[]
export declare function coverageColor(percent: number): string
export declare function coverageBadges(
  summary: unknown,
): readonly { readonly file: string; readonly badge: ShieldsEndpointBadge }[]
