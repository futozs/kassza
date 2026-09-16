export type XmlScalar = string | number | boolean

export type XmlContent = XmlScalar | null | undefined | readonly XmlChild[]

export type XmlChild = XmlNode | false | null | undefined

export interface XmlNode {
  readonly name: string
  readonly content: XmlContent
}

export function el(name: string, content: XmlContent): XmlNode {
  return { name, content }
}

export function optionalEl(name: string, content: XmlContent): XmlNode | undefined {
  if (content === undefined || content === null) return undefined
  if (Array.isArray(content) && !content.some(Boolean)) return undefined
  return { name, content }
}

function isAllowedXmlChar(codePoint: number): boolean {
  if (codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d) return true
  if (codePoint < 0x20) return false
  return codePoint !== 0xfffe && codePoint !== 0xffff
}

function stripInvalidXmlChars(value: string): string {
  let result = ''
  for (const char of value) {
    if (isAllowedXmlChar(char.codePointAt(0) ?? 0)) result += char
  }
  return result
}

export function escapeXml(value: string): string {
  return stripInvalidXmlChars(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function formatXmlNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Az XML-be csak véges szám írható, kapott: ${value}`)
  }
  if (Number.isInteger(value)) return value.toString()
  const fixed = value.toFixed(10).replace(/0+$/, '').replace(/\.$/, '')
  return fixed === '-0' ? '0' : fixed
}

function formatScalar(value: XmlScalar): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return formatXmlNumber(value)
  return escapeXml(value)
}

function isPresent(child: XmlChild): child is XmlNode {
  return Boolean(child)
}

function renderNode(node: XmlNode, depth: number): string {
  const indent = '  '.repeat(depth)
  const { name, content } = node
  if (content === undefined || content === null) return `${indent}<${name}></${name}>`
  if (!Array.isArray(content)) {
    return `${indent}<${name}>${formatScalar(content as XmlScalar)}</${name}>`
  }
  const children = (content as readonly XmlChild[]).filter(isPresent)
  if (children.length === 0) return `${indent}<${name}></${name}>`
  const inner = children.map((child) => renderNode(child, depth + 1)).join('\n')
  return `${indent}<${name}>\n${inner}\n${indent}</${name}>`
}

export interface XmlDocumentOptions {
  readonly root: string
  readonly namespace: string
  readonly schemaLocation?: string
  readonly children: readonly XmlChild[]
}

export function buildXmlDocument(options: XmlDocumentOptions): string {
  const attributes = [`xmlns="${options.namespace}"`]
  if (options.schemaLocation !== undefined) {
    attributes.push(
      'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
      `xsi:schemaLocation="${options.namespace} ${options.schemaLocation}"`,
    )
  }
  const body = options.children
    .filter(isPresent)
    .map((child) => renderNode(child, 1))
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${options.root} ${attributes.join(' ')}>\n${body}\n</${options.root}>\n`
}
