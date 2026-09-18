import type { ReactNode } from 'react'

const TOKEN =
  /(<\?[\s\S]*?\?>)|(<!--[\s\S]*?-->)|(<!\[CDATA\[[\s\S]*?\]\]>)|(<\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?>)|([^<]+)|(<)/g

const ATTRIBUTE = /([\w:.-]+)(\s*=\s*)("[^"]*"|'[^']*')/g

function renderAttributes(source: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = []
  let cursor = 0
  for (const match of source.matchAll(ATTRIBUTE)) {
    const start = match.index ?? 0
    if (start > cursor) nodes.push(source.slice(cursor, start))
    nodes.push(
      <span key={`${keyPrefix}a${start}`} className="text-[var(--code-token-function)]">
        {match[1]}
      </span>,
      <span key={`${keyPrefix}e${start}`} className="text-[var(--code-token-punctuation)]">
        {match[2]}
      </span>,
      <span key={`${keyPrefix}v${start}`} className="text-[var(--code-token-string)]">
        {match[3]}
      </span>,
    )
    cursor = start + match[0].length
  }
  if (cursor < source.length) nodes.push(source.slice(cursor))
  return nodes
}

export function XmlCode({ code }: { code: string }) {
  const nodes: ReactNode[] = []
  for (const match of code.matchAll(TOKEN)) {
    const offset = match.index ?? 0
    const key = `t${offset}`
    if (match[1] || match[2] || match[3]) {
      nodes.push(
        <span key={key} className="text-[var(--code-token-comment)]">
          {match[0]}
        </span>,
      )
    } else if (match[5]) {
      nodes.push(
        <span key={key}>
          <span className="text-[var(--code-token-punctuation)]">{match[4]}</span>
          <span className="text-[var(--code-token-keyword)]">{match[5]}</span>
          {renderAttributes(match[6] ?? '', key)}
          <span className="text-[var(--code-token-punctuation)]">{match[7]}</span>
        </span>,
      )
    } else {
      nodes.push(match[0])
    }
  }
  return (
    <code className="block min-w-max font-mono text-[0.78rem] leading-[1.65] text-[var(--code-foreground)]">
      {nodes}
    </code>
  )
}
