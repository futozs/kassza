export type Preview =
  | { readonly t: 'string'; readonly v: string }
  | { readonly t: 'number'; readonly v: number }
  | { readonly t: 'boolean'; readonly v: boolean }
  | { readonly t: 'null' }
  | { readonly t: 'undefined' }
  | { readonly t: 'bigint'; readonly v: string }
  | { readonly t: 'symbol'; readonly v: string }
  | { readonly t: 'date'; readonly v: string }
  | { readonly t: 'function'; readonly name: string }
  | { readonly t: 'bytes'; readonly length: number; readonly pdf: boolean; readonly ref?: string }
  | {
      readonly t: 'error'
      readonly name: string
      readonly message: string
      readonly props: readonly (readonly [string, Preview])[]
    }
  | { readonly t: 'array'; readonly items: readonly Preview[]; readonly length: number }
  | {
      readonly t: 'object'
      readonly ctor?: string
      readonly entries: readonly (readonly [string, Preview])[]
    }
  | { readonly t: 'map'; readonly entries: readonly (readonly [Preview, Preview])[] }
  | { readonly t: 'set'; readonly items: readonly Preview[] }
  | { readonly t: 'circular' }
  | { readonly t: 'more'; readonly count: number }

export interface SerializeContext {
  readonly onBytes?: ((bytes: Uint8Array) => string | undefined) | undefined
}

const MAX_DEPTH = 7
const MAX_ITEMS = 100

function isPdfBytes(bytes: Uint8Array): boolean {
  return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46
}

const ERROR_KEYS = ['code', 'category', 'hint', 'action', 'httpStatus', 'retryable'] as const

export function serialize(value: unknown, context: SerializeContext = {}): Preview {
  const ancestors = new WeakSet<object>()

  function walk(input: unknown, depth: number): Preview {
    switch (typeof input) {
      case 'string':
        return { t: 'string', v: input }
      case 'number':
        return { t: 'number', v: input }
      case 'boolean':
        return { t: 'boolean', v: input }
      case 'undefined':
        return { t: 'undefined' }
      case 'bigint':
        return { t: 'bigint', v: input.toString() }
      case 'symbol':
        return { t: 'symbol', v: input.toString() }
      case 'function':
        return { t: 'function', name: input.name || 'névtelen' }
    }
    if (input === null) return { t: 'null' }
    const object = input as object
    if (object instanceof Date) {
      return {
        t: 'date',
        v: Number.isNaN(object.getTime()) ? 'Invalid Date' : object.toISOString(),
      }
    }
    if (object instanceof Uint8Array || object instanceof ArrayBuffer) {
      const bytes = object instanceof Uint8Array ? object : new Uint8Array(object)
      const pdf = isPdfBytes(bytes)
      const ref = pdf ? context.onBytes?.(bytes) : undefined
      return ref
        ? { t: 'bytes', length: bytes.byteLength, pdf, ref }
        : { t: 'bytes', length: bytes.byteLength, pdf }
    }
    if (ancestors.has(object)) return { t: 'circular' }
    if (depth > MAX_DEPTH) return { t: 'more', count: 1 }
    ancestors.add(object)
    try {
      return walkObject(object, depth)
    } finally {
      ancestors.delete(object)
    }
  }

  function walkObject(object: object, depth: number): Preview {
    if (object instanceof Error) {
      const record = object as unknown as Record<string, unknown>
      const props: (readonly [string, Preview])[] = ERROR_KEYS.filter(
        (key) => record[key] !== undefined,
      ).map((key) => [key, walk(record[key], depth + 1)] as const)
      if (object.cause !== undefined) props.push(['cause', walk(object.cause, depth + 1)] as const)
      return { t: 'error', name: object.name, message: object.message, props }
    }
    if (Array.isArray(object)) {
      const items = object.slice(0, MAX_ITEMS).map((item) => walk(item, depth + 1))
      if (object.length > MAX_ITEMS) items.push({ t: 'more', count: object.length - MAX_ITEMS })
      return { t: 'array', items, length: object.length }
    }
    if (object instanceof Map) {
      return {
        t: 'map',
        entries: [...object.entries()]
          .slice(0, MAX_ITEMS)
          .map(([key, item]) => [walk(key, depth + 1), walk(item, depth + 1)] as const),
      }
    }
    if (object instanceof Set) {
      return {
        t: 'set',
        items: [...object].slice(0, MAX_ITEMS).map((item) => walk(item, depth + 1)),
      }
    }
    const prototype = Object.getPrototypeOf(object)
    const ctor =
      prototype && prototype !== Object.prototype ? prototype.constructor?.name : undefined
    const entries = Object.entries(object)
      .slice(0, MAX_ITEMS)
      .map(([key, item]) => [key, walk(item, depth + 1)] as const)
    return ctor ? { t: 'object', ctor, entries } : { t: 'object', entries }
  }

  return walk(value, 0)
}

function quote(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`
}

export function formatPreview(preview: Preview, indent = 0, topLevel = true): string {
  const pad = '  '.repeat(indent + 1)
  const closePad = '  '.repeat(indent)
  switch (preview.t) {
    case 'string':
      return topLevel ? preview.v : quote(preview.v)
    case 'number':
      return Object.is(preview.v, -0) ? '-0' : String(preview.v)
    case 'boolean':
      return String(preview.v)
    case 'null':
      return 'null'
    case 'undefined':
      return 'undefined'
    case 'bigint':
      return `${preview.v}n`
    case 'symbol':
      return preview.v
    case 'date':
      return preview.v
    case 'function':
      return `[Function ${preview.name}]`
    case 'bytes':
      return `Uint8Array(${preview.length})${preview.pdf ? ' [PDF]' : ''}`
    case 'circular':
      return '[Körkörös]'
    case 'more':
      return `… még ${preview.count}`
    case 'error': {
      const head = `${preview.name}: ${preview.message}`
      if (preview.props.length === 0) return head
      return `${head} {\n${preview.props.map(([key, value]) => `${pad}${key}: ${formatPreview(value, indent + 1, false)}`).join(',\n')}\n${closePad}}`
    }
    case 'array': {
      if (preview.items.length === 0) return '[]'
      const inline = preview.items.map((item) => formatPreview(item, indent + 1, false))
      const joined = inline.join(', ')
      if (joined.length < 60 && !joined.includes('\n')) return `[ ${joined} ]`
      return `[\n${inline.map((item) => `${pad}${item}`).join(',\n')}\n${closePad}]`
    }
    case 'map':
      return `Map(${preview.entries.length}) {${preview.entries.map(([key, value]) => ` ${formatPreview(key, indent + 1, false)} => ${formatPreview(value, indent + 1, false)}`).join(',')} }`
    case 'set':
      return `Set(${preview.items.length}) { ${preview.items.map((item) => formatPreview(item, indent + 1, false)).join(', ')} }`
    case 'object': {
      const prefix = preview.ctor ? `${preview.ctor} ` : ''
      if (preview.entries.length === 0) return `${prefix}{}`
      const parts = preview.entries.map(([key, value]) => {
        const safeKey = /^[A-Za-z_$][\w$]*$/.test(key) ? key : quote(key)
        return `${safeKey}: ${formatPreview(value, indent + 1, false)}`
      })
      const joined = parts.join(', ')
      if (joined.length < 60 && !joined.includes('\n')) return `${prefix}{ ${joined} }`
      return `${prefix}{\n${parts.map((part) => `${pad}${part}`).join(',\n')}\n${closePad}}`
    }
  }
}
