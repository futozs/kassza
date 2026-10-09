import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const FETCH_TIMEOUT_MS = 15_000
const FLAT_RATIO = 1.25
const FLAT_MIN_DOWNLOADS = 50

function readJson(path) {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'))
}

export function parseDependentsCount(html) {
  const match = /(\d[\d,]*)\s+Repositories\b/.exec(html)
  return match ? Number(match[1].replaceAll(',', '')) : null
}

export function sumDownloads(range) {
  return (range?.downloads ?? []).reduce((total, day) => total + day.downloads, 0)
}

export function analyzeVersions(downloads) {
  const entries = Object.entries(downloads ?? {})
    .map(([version, count]) => ({ version, count }))
    .sort((a, b) => b.count - a.count)
  const max = entries[0]?.count ?? 0
  const cluster = entries.filter(
    (entry) => entry.count >= FLAT_MIN_DOWNLOADS && entry.count * FLAT_RATIO >= max,
  )
  const total = entries.reduce((sum, entry) => sum + entry.count, 0)
  const flat = cluster.length >= 3
  const flatShare = flat ? cluster.reduce((sum, entry) => sum + entry.count, 0) / total : 0
  return { entries, total, flat, flatVersions: flat ? cluster.length : 0, flatShare }
}

export function cleanedEstimate(versions) {
  if (!versions) return null
  const counts = versions.entries
    .map((entry) => entry.count)
    .filter((count) => count >= FLAT_MIN_DOWNLOADS)
    .sort((a, b) => a - b)
  let best = []
  for (let start = 0; start < counts.length; start++) {
    let end = start
    while (end + 1 < counts.length && (counts[end + 1] ?? 0) <= (counts[start] ?? 0) * FLAT_RATIO)
      end++
    if (end - start + 1 > best.length) best = counts.slice(start, end + 1)
  }
  if (best.length < 3) return { estimate: versions.total, baseline: 0, cleaned: false }
  const baseline = best[Math.floor(best.length / 2)] ?? 0
  const estimate = versions.entries.reduce(
    (sum, entry) => sum + Math.max(0, entry.count - baseline),
    0,
  )
  return { estimate, baseline, cleaned: true }
}

export const CODE_SEARCH_QUERIES = ['"from \'kassza\'"', '"createKassza("']

async function fetchJson(url, headers = {}) {
  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': 'kassza-stats', ...headers },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    return response.ok ? await response.json() : null
  } catch {
    return null
  }
}

async function fetchText(url) {
  try {
    const response = await fetch(url, {
      headers: { 'user-agent': 'kassza-stats' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    return response.ok ? await response.text() : null
  } catch {
    return null
  }
}

export async function collectStats({ name, repo, version }) {
  const githubHeaders = process.env.GITHUB_TOKEN
    ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {}
  const [week, month, year, versions, github, depsDev, dependentsHtml] = await Promise.all([
    fetchJson(`https://api.npmjs.org/downloads/point/last-week/${name}`),
    fetchJson(`https://api.npmjs.org/downloads/point/last-month/${name}`),
    fetchJson(`https://api.npmjs.org/downloads/range/last-year/${name}`),
    fetchJson(`https://api.npmjs.org/versions/${name}/last-week`),
    fetchJson(`https://api.github.com/repos/${repo}`, githubHeaders),
    fetchJson(
      `https://api.deps.dev/v3alpha/systems/npm/packages/${name}/versions/${version}:dependents`,
    ),
    fetchText(`https://github.com/${repo}/network/dependents`),
  ])
  const codeSearch = process.env.GITHUB_TOKEN
    ? await Promise.all(
        CODE_SEARCH_QUERIES.map(async (query) => {
          const result = await fetchJson(
            `https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=1`,
            githubHeaders,
          )
          return { query, total: result?.total_count ?? null }
        }),
      )
    : null
  return {
    npm: {
      lastWeek: week?.downloads ?? null,
      lastMonth: month?.downloads ?? null,
      lastYear: year ? sumDownloads(year) : null,
      versions: versions ? analyzeVersions(versions.downloads) : null,
    },
    github: github
      ? {
          stars: github.stargazers_count,
          forks: github.forks_count,
          watchers: github.subscribers_count,
          openIssues: github.open_issues_count,
        }
      : null,
    dependents: {
      githubRepositories: dependentsHtml ? parseDependentsCount(dependentsHtml) : null,
      npmPackagesDepsDev: depsDev ? depsDev.dependentCount : null,
      npmDirectDepsDev: depsDev ? depsDev.directDependentCount : null,
    },
    codeSearch,
  }
}

function show(value) {
  return value === null || value === undefined ? 'nem elérhető' : String(value)
}

export function formatReport(name, version, stats) {
  const lines = [`${name}@${version} statisztika`, '']
  const cleaned = cleanedEstimate(stats.npm.versions)
  if (cleaned) {
    lines.push(
      cleaned.cleaned
        ? `Tisztított becslés (7 nap): ${cleaned.estimate} letöltés a tükrök verziónkénti ~${cleaned.baseline} letöltésén felül (nyers: ${show(stats.npm.lastWeek)})`
        : `Tisztított becslés (7 nap): ${cleaned.estimate} (nem látszik tükör-minta)`,
      '',
    )
  }
  lines.push('Letöltések (npm, a robotokat és tükröket is tartalmazza)')
  lines.push(`  elmúlt 7 nap:   ${show(stats.npm.lastWeek)}`)
  lines.push(`  elmúlt 30 nap:  ${show(stats.npm.lastMonth)}`)
  lines.push(`  elmúlt 12 hó:   ${show(stats.npm.lastYear)}`)
  const versions = stats.npm.versions
  if (versions) {
    lines.push('', 'Verziónkénti letöltés (elmúlt 7 nap)')
    for (const entry of versions.entries.slice(0, 8)) {
      lines.push(`  ${entry.version.padEnd(10)} ${entry.count}`)
    }
    if (versions.flat) {
      const percent = Math.round(versions.flatShare * 100)
      lines.push(
        `  Figyelem: ${versions.flatVersions} verzió letöltése szinte azonos, ez a forgalom ${percent}%-a.`,
        '  Ez tükrök, scannerek és robotok jele, nem valódi használóké.',
      )
    }
  }
  lines.push('', 'Valódi használók (botok nem tudják hamisítani)')
  lines.push(`  GitHub dependents (repók): ${show(stats.dependents.githubRepositories)}`)
  lines.push(`  deps.dev függő csomagok:   ${show(stats.dependents.npmPackagesDepsDev)}`)
  if (stats.github) {
    lines.push(
      `  GitHub csillagok:          ${stats.github.stars}`,
      `  Forkok:                    ${stats.github.forks}`,
    )
  }
  if (stats.codeSearch) {
    lines.push('', 'GitHub kódkeresés (nyilvános repók)')
    for (const entry of stats.codeSearch)
      lines.push(`  ${entry.query}: ${show(entry.total)} találat`)
  } else {
    lines.push(
      '',
      'GitHub kódkeresés (GITHUB_TOKEN kell hozzá, vagy böngészőben): ',
      `  https://github.com/search?type=code&q=${encodeURIComponent(`"${name}" path:package.json`)}`,
    )
  }
  return lines.join('\n')
}

async function main() {
  const manifest = readJson('../package.json')
  const config = readJson('../readme/config.json')
  const stats = await collectStats({
    name: manifest.name,
    repo: config.repo,
    version: manifest.version,
  })
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(stats, null, 2)}\n`)
    return
  }
  process.stdout.write(`${formatReport(manifest.name, manifest.version, stats)}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
