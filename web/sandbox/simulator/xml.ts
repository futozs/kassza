export interface XmlElement {
  readonly name: string
  readonly children: readonly XmlElement[]
  readonly text: string
}

interface MutableElement {
  name: string
  children: MutableElement[]
  text: string
}

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16))
    if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10))
    return ENTITIES[entity] ?? match
  })
}

function localName(name: string): string {
  const colon = name.indexOf(':')
  return colon === -1 ? name : name.slice(colon + 1)
}

export function parseXml(xml: string): XmlElement {
  const stack: MutableElement[] = []
  let root: MutableElement | undefined
  let position = xml.charCodeAt(0) === 0xfeff ? 1 : 0

  while (position < xml.length) {
    const tagStart = xml.indexOf('<', position)
    const current = stack.at(-1)
    if (tagStart === -1) {
      if (current) current.text += decodeEntities(xml.slice(position))
      break
    }
    if (tagStart > position && current)
      current.text += decodeEntities(xml.slice(position, tagStart))
    if (xml.startsWith('<!--', tagStart)) {
      position = xml.indexOf('-->', tagStart) + 3
      continue
    }
    if (xml.startsWith('<![CDATA[', tagStart)) {
      const end = xml.indexOf(']]>', tagStart)
      if (current) current.text += xml.slice(tagStart + 9, end)
      position = end + 3
      continue
    }
    if (xml.startsWith('<?', tagStart) || xml.startsWith('<!', tagStart)) {
      position = xml.indexOf('>', tagStart) + 1
      continue
    }
    const tagEnd = xml.indexOf('>', tagStart)
    if (tagEnd === -1) throw new Error('Lezáratlan XML tag')
    const raw = xml.slice(tagStart + 1, tagEnd)
    position = tagEnd + 1
    if (raw.startsWith('/')) {
      stack.pop()
      continue
    }
    const selfClosing = raw.endsWith('/')
    const name = localName(/^\s*([^\s/>]+)/.exec(raw)?.[1] ?? '')
    const element: MutableElement = { name, children: [], text: '' }
    if (current) current.children.push(element)
    else root ??= element
    if (!selfClosing) stack.push(element)
  }

  if (!root) throw new Error('Üres XML dokumentum')
  return root
}

export function child(element: XmlElement | undefined, name: string): XmlElement | undefined {
  return element?.children.find((item) => item.name === name)
}

export function children(element: XmlElement | undefined, name: string): XmlElement[] {
  return element?.children.filter((item) => item.name === name) ?? []
}

export function text(element: XmlElement | undefined, name: string): string | undefined {
  const value = child(element, name)?.text.trim()
  return value ? value : undefined
}

export function number(element: XmlElement | undefined, name: string): number | undefined {
  const value = text(element, name)
  if (value === undefined) return undefined
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : undefined
}

export function bool(element: XmlElement | undefined, name: string): boolean | undefined {
  const value = text(element, name)?.toLowerCase()
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  return undefined
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export type XmlValue = string | number | boolean | null | undefined

export type XmlTree = readonly [string, XmlValue | readonly (XmlTree | false | undefined)[]]

function formatValue(value: XmlValue): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number')
    return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)))
  return escapeXml(value)
}

function renderTree(node: XmlTree, depth: number): string {
  const indent = '  '.repeat(depth)
  const [name, content] = node
  if (!Array.isArray(content))
    return `${indent}<${name}>${formatValue(content as XmlValue)}</${name}>`
  const items = (content as readonly (XmlTree | false | undefined)[]).filter(
    (item): item is XmlTree => Boolean(item),
  )
  if (items.length === 0) return `${indent}<${name}></${name}>`
  return `${indent}<${name}>\n${items.map((item) => renderTree(item, depth + 1)).join('\n')}\n${indent}</${name}>`
}

export function renderDocument(
  root: string,
  namespace: string,
  content: readonly (XmlTree | false | undefined)[],
  extraAttributes = '',
): string {
  const body = content
    .filter((item): item is XmlTree => Boolean(item))
    .map((item) => renderTree(item, 1))
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${root} xmlns="${namespace}"${extraAttributes}>\n${body}\n</${root}>\n`
}
