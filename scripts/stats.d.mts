export interface VersionAnalysis {
  readonly entries: readonly { readonly version: string; readonly count: number }[]
  readonly total: number
  readonly flat: boolean
  readonly flatVersions: number
  readonly flatShare: number
}

export interface Stats {
  readonly npm: {
    readonly lastWeek: number | null
    readonly lastMonth: number | null
    readonly lastYear: number | null
    readonly versions: VersionAnalysis | null
  }
  readonly github: {
    readonly stars: number
    readonly forks: number
    readonly watchers: number
    readonly openIssues: number
  } | null
  readonly dependents: {
    readonly githubRepositories: number | null
    readonly npmPackagesDepsDev: number | null
    readonly npmDirectDepsDev: number | null
  }
  readonly codeSearch?: readonly { readonly query: string; readonly total: number | null }[] | null
}

export interface CleanedEstimate {
  readonly estimate: number
  readonly baseline: number
  readonly cleaned: boolean
}

export const CODE_SEARCH_QUERIES: readonly string[]
export function cleanedEstimate(versions: VersionAnalysis | null): CleanedEstimate | null

export function parseDependentsCount(html: string): number | null
export function sumDownloads(
  range: { readonly downloads: readonly { readonly downloads: number }[] } | null,
): number
export function analyzeVersions(downloads: Readonly<Record<string, number>> | null): VersionAnalysis
export function collectStats(input: {
  readonly name: string
  readonly repo: string
  readonly version: string
}): Promise<Stats>
export function formatReport(name: string, version: string, stats: Stats): string
