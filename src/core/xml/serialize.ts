export type XmlScalar = string | number | boolean

export type XmlContent = XmlScalar | null | undefined | readonly XmlChild[]

export type XmlChild = XmlNode | false | null | undefined

export type XmlAttributes = Readonly<Record<string, string>>

export interface XmlNode {
  readonly name: string
  readonly content: XmlContent
  readonly attributes?: XmlAttributes | undefined
}

export function el(name: string, content: XmlContent, attributes?: XmlAttributes): XmlNode {
  return attributes === undefined ? { name, content } : { name, content, attributes }
}

export function optionalEl(name: string, content: XmlContent): XmlNode | undefined {
  if (content === undefined || content === null) return undefined
  if (Array.isArray(content) && !content.some(Boolean)) return undefined
  return { name, content }
}

function isAllowedXmlChar(codePoint: number): boolean {
  if (codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d) return true
  if (codePoint < 0x20) return false
  if (codePoint >= 0xd800 && codePoint <= 0xdfff) return false
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
  if (Math.abs(value) > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(
      `Az XML-be írható szám abszolút értéke legfeljebb 2^53 - 1 lehet, kapott: ${value}`,
    )
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

function renderAttributes(attributes: XmlAttributes | undefined): string {
  if (attributes === undefined) return ''
  return Object.entries(attributes)
    .map(([key, value]) => ` ${key}="${escapeXml(value)}"`)
    .join('')
}

function renderNode(node: XmlNode, depth: number): string {
  const indent = '  '.repeat(depth)
  const { name, content } = node
  const open = `${name}${renderAttributes(node.attributes)}`
  if (content === undefined || content === null) return `${indent}<${open}></${name}>`
  if (!Array.isArray(content)) {
    return `${indent}<${open}>${formatScalar(content as XmlScalar)}</${name}>`
  }
  const children = (content as readonly XmlChild[]).filter(isPresent)
  if (children.length === 0) return `${indent}<${open}></${name}>`
  const inner = children.map((child) => renderNode(child, depth + 1)).join('\n')
  return `${indent}<${open}>\n${inner}\n${indent}</${name}>`
}

export const XSI_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance'

export interface XmlDocumentOptions {
  readonly root: string
  readonly namespace: string
  readonly namespaces?: Readonly<Record<string, string>> | undefined
  readonly schemaLocation?: string
  readonly children: readonly XmlChild[]
}

export function buildXmlDocument(options: XmlDocumentOptions): string {
  const declarations = new Map<string, string>([['xmlns', options.namespace]])
  for (const [prefix, uri] of Object.entries(options.namespaces ?? {})) {
    declarations.set(`xmlns:${prefix}`, uri)
  }
  if (options.schemaLocation !== undefined) declarations.set('xmlns:xsi', XSI_NAMESPACE)
  const attributes = [...declarations].map(([name, value]) => `${name}="${escapeXml(value)}"`)
  if (options.schemaLocation !== undefined) {
    attributes.push(`xsi:schemaLocation="${options.namespace} ${options.schemaLocation}"`)
  }
  const body = options.children
    .filter(isPresent)
    .map((child) => renderNode(child, 1))
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${options.root} ${attributes.join(' ')}>\n${body}\n</${options.root}>\n`
}
