const TS_KEYWORDS = new Set([
  'import',
  'from',
  'export',
  'const',
  'let',
  'await',
  'async',
  'function',
  'return',
  'if',
  'new',
  'true',
  'false',
  'null',
  'throw',
])

const TS_TOKEN =
  /(\/\/.*$)|('(?:[^'\\]|\\.)*')|(\b\d[\d_]*(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|(.)/g

function mergeRuns(runs) {
  const merged = []
  for (const run of runs) {
    const last = merged.at(-1)
    if (last && last.fill === run.fill) last.text += run.text
    else merged.push({ ...run })
  }
  return merged
}

function nextSignificant(line, index) {
  return line.slice(index).trimStart()[0]
}

function wordColor(word, next, colors) {
  if (TS_KEYWORDS.has(word)) return colors.keyword
  if (next === '(') return colors.function
  if (next === ':') return colors.property
  return colors.foreground
}

export function highlightTs(line, colors) {
  const runs = []
  for (const match of line.matchAll(TS_TOKEN)) {
    const [text, comment, string, number, word] = match
    const end = match.index + text.length
    let fill = colors.punctuation
    if (comment) fill = colors.comment
    else if (string) fill = colors.string
    else if (number) fill = colors.constant
    else if (word) fill = wordColor(word, nextSignificant(line, end), colors)
    else if (/^\s+$/.test(text)) fill = colors.foreground
    runs.push({ text, fill })
  }
  return mergeRuns(runs)
}

function highlightTag(tag, colors) {
  const runs = []
  const pattern = /(<\/?|\?>|\/?>|<\?)|([\w:.-]+)(?==)|(=)|("[^"]*"?)|([\w:.-]+)|(\s+)|(.)/g
  let first = true
  for (const match of tag.matchAll(pattern)) {
    const [text, bracket, attribute, equals, string, name, , other] = match
    let fill = colors.foreground
    if (bracket || equals) fill = colors.punctuation
    else if (other) fill = colors.foreground
    else if (attribute) fill = colors.property
    else if (string) fill = colors.string
    else if (name) {
      fill = first ? colors.tag : colors.property
      first = false
    }
    runs.push({ text, fill })
  }
  return runs
}

export function highlightXml(line, colors) {
  const runs = []
  let rest = line
  while (rest.length > 0) {
    const start = rest.indexOf('<')
    if (start !== 0) {
      const text = start === -1 ? rest : rest.slice(0, start)
      runs.push({ text, fill: colors.foreground })
      rest = start === -1 ? '' : rest.slice(start)
      continue
    }
    const end = rest.indexOf('>')
    const tag = end === -1 ? rest : rest.slice(0, end + 1)
    runs.push(...highlightTag(tag, colors))
    rest = rest.slice(tag.length)
  }
  return mergeRuns(runs)
}
