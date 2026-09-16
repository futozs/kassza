export interface XmlElement {
  readonly name: string
  readonly attributes: Readonly<Record<string, string>>
  readonly children: readonly XmlElement[]
  readonly text: string
}

export class XmlParseError extends Error {
  override readonly name: string = 'XmlParseError'
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
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
    return NAMED_ENTITIES[entity] ?? match
  })
}

function localName(qualifiedName: string): string {
  const colon = qualifiedName.indexOf(':')
  return colon === -1 ? qualifiedName : qualifiedName.slice(colon + 1)
}

interface MutableElement {
  name: string
  attributes: Record<string, string>
  children: MutableElement[]
  text: string
}

const ATTRIBUTE_PATTERN = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g

function parseAttributes(source: string): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const match of source.matchAll(ATTRIBUTE_PATTERN)) {
    const [, name, , doubleQuoted, singleQuoted] = match
    if (name === undefined) continue
    attributes[name] = decodeEntities(doubleQuoted ?? singleQuoted ?? '')
  }
  return attributes
}

function skipUntil(xml: string, from: number, terminator: string): number {
  const end = xml.indexOf(terminator, from)
  if (end === -1) throw new XmlParseError(`Lezáratlan szerkezet, hiányzik: ${terminator}`)
  return end + terminator.length
}

export function parseXml(xml: string): XmlElement {
  const stack: MutableElement[] = []
  let root: MutableElement | undefined
  let position = xml.charCodeAt(0) === 0xfeff ? 1 : 0

  const appendText = (value: string): void => {
    const current = stack.at(-1)
    if (current) current.text += value
  }

  while (position < xml.length) {
    const tagStart = xml.indexOf('<', position)
    if (tagStart === -1) {
      appendText(decodeEntities(xml.slice(position)))
      break
    }
    if (tagStart > position) appendText(decodeEntities(xml.slice(position, tagStart)))

    if (xml.startsWith('<!--', tagStart)) {
      position = skipUntil(xml, tagStart + 4, '-->')
      continue
    }
    if (xml.startsWith('<![CDATA[', tagStart)) {
      const end = xml.indexOf(']]>', tagStart + 9)
      if (end === -1) throw new XmlParseError('Lezáratlan CDATA szakasz')
      appendText(xml.slice(tagStart + 9, end))
      position = end + 3
      continue
    }
    if (xml.startsWith('<?', tagStart)) {
      position = skipUntil(xml, tagStart + 2, '?>')
      continue
    }
    if (xml.startsWith('<!', tagStart)) {
      position = skipUntil(xml, tagStart + 2, '>')
      continue
    }

    const tagEnd = xml.indexOf('>', tagStart)
    if (tagEnd === -1) throw new XmlParseError('Lezáratlan XML tag')
    const rawTag = xml.slice(tagStart + 1, tagEnd)
    position = tagEnd + 1

    if (rawTag.startsWith('/')) {
      const closingName = localName(rawTag.slice(1).trim())
      const current = stack.pop()
      if (!current || current.name !== closingName) {
        throw new XmlParseError(`Váratlan záró tag: ${closingName}`)
      }
      continue
    }

    const selfClosing = rawTag.endsWith('/')
    const tagBody = selfClosing ? rawTag.slice(0, -1) : rawTag
    const nameMatch = /^\s*([^\s/>]+)/.exec(tagBody)
    if (!nameMatch?.[1]) throw new XmlParseError('Érvénytelen XML tag')
    const element: MutableElement = {
      name: localName(nameMatch[1]),
      attributes: parseAttributes(tagBody.slice(nameMatch[0].length)),
      children: [],
      text: '',
    }

    const parent = stack.at(-1)
    if (parent) {
      parent.children.push(element)
    } else if (root) {
      throw new XmlParseError('Az XML-nek csak egy gyökéreleme lehet')
    } else {
      root = element
    }
    if (!selfClosing) stack.push(element)
  }

  if (stack.length > 0) throw new XmlParseError(`Lezáratlan elem: ${stack.at(-1)?.name}`)
  if (!root) throw new XmlParseError('Üres XML dokumentum')
  return root
}

export function findChild(element: XmlElement | undefined, name: string): XmlElement | undefined {
  return element?.children.find((child) => child.name === name)
}

export function findChildren(element: XmlElement | undefined, name: string): XmlElement[] {
  return element?.children.filter((child) => child.name === name) ?? []
}

export function findPath(
  element: XmlElement | undefined,
  ...path: string[]
): XmlElement | undefined {
  let current = element
  for (const name of path) current = findChild(current, name)
  return current
}

export function childText(element: XmlElement | undefined, name: string): string | undefined {
  const child = findChild(element, name)
  if (!child) return undefined
  const value = child.text.trim()
  return value === '' ? undefined : value
}

export function childNumber(element: XmlElement | undefined, name: string): number | undefined {
  const value = childText(element, name)
  if (value === undefined) return undefined
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : undefined
}

export function childBoolean(element: XmlElement | undefined, name: string): boolean | undefined {
  const value = childText(element, name)?.toLowerCase()
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  return undefined
}
