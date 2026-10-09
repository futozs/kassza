import { createHash } from 'node:crypto'

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? Number.parseInt(entity.slice(2), 16)
          : Number(entity.slice(1))
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return ENTITIES[entity.toLowerCase()] ?? match
  })
}

export function mainText(html) {
  const withoutCode = html.replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' ')
  const article =
    /<article\b[\s\S]*?<\/article>/i.exec(withoutCode)?.[0] ??
    /<main\b[\s\S]*?<\/main>/i.exec(withoutCode)?.[0] ??
    withoutCode
  return decodeEntities(article.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

export function sha256(content) {
  return createHash('sha256').update(content).digest('hex')
}

export function tableCodes(html) {
  const cells = [...html.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((match) =>
    decodeEntities(match[1].replace(/<[^>]+>/g, '')).trim(),
  )
  return [...new Set(cells.filter((cell) => /^\d{1,4}$/.test(cell)).map(Number))].sort(
    (a, b) => a - b,
  )
}

export function ipv4Addresses(text) {
  return [...new Set(text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? [])]
    .filter((ip) => ip.split('.').every((part) => Number(part) <= 255))
    .sort()
}

export function sourceErrorCodes(errorsSource) {
  const table = errorsSource.slice(errorsSource.indexOf('AGENT_ERROR_CODES'))
  return [...table.matchAll(/^\s{2}(\d+): \{/gm)].map((match) => Number(match[1]))
}

export function sourceIps(ipSource) {
  return ipv4Addresses(/SZAMLAZZ_OUTBOUND_IPS[^=]*=\s*\[([\s\S]*?)\]/.exec(ipSource)?.[1] ?? '')
}

function same(a, b) {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function compareSnapshots(locked, current) {
  const changes = []
  for (const [name, value] of Object.entries(current)) {
    const before = locked[name]
    if (before === undefined) {
      changes.push({ name, kind: 'new', detail: 'Új figyelt forrás, nincs zárolt értéke.' })
      continue
    }
    if (same(before, value)) continue
    if (Array.isArray(before) && Array.isArray(value)) {
      const added = value.filter((item) => !before.includes(item))
      const removed = before.filter((item) => !value.includes(item))
      changes.push({
        name,
        kind: 'changed',
        detail: [
          added.length > 0 ? `új: ${added.join(', ')}` : '',
          removed.length > 0 ? `eltűnt: ${removed.join(', ')}` : '',
        ]
          .filter(Boolean)
          .join('; '),
      })
    } else {
      changes.push({ name, kind: 'changed', detail: 'A tartalom ujjlenyomata megváltozott.' })
    }
  }
  for (const name of Object.keys(locked)) {
    if (!(name in current))
      changes.push({ name, kind: 'missing', detail: 'A forrás nem volt elérhető.' })
  }
  return changes
}

export function consistencyProblems({ documentedCodes, knownCodes, pageIps, knownIps }) {
  const problems = []
  const missingCodes = documentedCodes.filter((code) => !knownCodes.includes(code))
  if (missingCodes.length > 0) {
    problems.push(`A docs hibakódjai közül ezeket a kassza nem ismeri: ${missingCodes.join(', ')}.`)
  }
  const missingIps = knownIps.filter((ip) => !pageIps.includes(ip))
  if (missingIps.length > 0) {
    problems.push(
      `A kassza IPN IP-címei közül ezek már nem szerepelnek a docsban: ${missingIps.join(', ')}.`,
    )
  }
  return problems
}

export function renderReport(changes, problems) {
  const lines = ['## Számlázz.hu / NAV változásfigyelő', '']
  if (changes.length === 0 && problems.length === 0) return `${lines.join('\n')}Nincs eltérés.\n`
  if (changes.length > 0) {
    lines.push('### Változott források', '')
    for (const change of changes)
      lines.push(`- **${change.name}** (${change.kind}): ${change.detail}`)
    lines.push('')
  }
  if (problems.length > 0) {
    lines.push('### Eltérés a kassza kódjától', '')
    for (const problem of problems) lines.push(`- ${problem}`)
    lines.push('')
  }
  lines.push(
    'Teendő: nézd át a forrást, igazítsd a kasszát (hibakód-tábla, XSD contract tesztek, IP-lista), majd futtasd: `npm run drift -- --update`.',
    '',
  )
  return lines.join('\n')
}
