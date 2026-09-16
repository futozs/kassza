import { StorageError } from './errors'

export const PDF_CONTENT_TYPE = 'application/pdf'
export const DEFAULT_URL_EXPIRES_SECONDS = 3600
const MAX_KEY_LENGTH = 1024
const CONTROL_CHARACTERS = /[\p{Cc}]/u

export function assertStorageKey(key: string): string {
  const invalid = (reason: string): StorageError =>
    new StorageError(`Érvénytelen tárhelykulcs (${reason}): ${JSON.stringify(key)}`, {
      operation: 'key',
      key,
    })
  if (typeof key !== 'string' || key.length === 0) throw invalid('üres')
  if (key.length > MAX_KEY_LENGTH) throw invalid(`legfeljebb ${MAX_KEY_LENGTH} karakter lehet`)
  if (key.startsWith('/')) throw invalid('nem kezdődhet perjellel')
  if (key.includes('\\')) throw invalid('visszaperjel nem lehet benne')
  if (CONTROL_CHARACTERS.test(key)) throw invalid('vezérlőkaraktert tartalmaz')
  for (const segment of key.split('/')) {
    if (segment === '' || segment === '.' || segment === '..') {
      throw invalid('üres, "." vagy ".." útvonalszakaszt tartalmaz')
    }
  }
  return key
}

export function normalizePrefix(prefix: string | undefined): string {
  if (!prefix) return ''
  const trimmed = prefix.replace(/^\/+|\/+$/g, '')
  if (trimmed === '') return ''
  assertStorageKey(trimmed)
  return `${trimmed}/`
}

export function resolveKey(prefix: string, key: string): string {
  return `${prefix}${assertStorageKey(key)}`
}

export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  )
}

export function encodeKeyPath(key: string): string {
  return key.split('/').map(encodeRfc3986).join('/')
}

export function joinPublicUrl(baseUrl: string, key: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${encodeKeyPath(key)}`
}

export function assertExpires(expiresInSeconds: number, maximum: number, key: string): number {
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > maximum) {
    throw new StorageError(
      `Az expiresInSeconds 1 és ${maximum} közötti egész szám legyen, kapott: ${expiresInSeconds}`,
      { operation: 'getUrl', key },
    )
  }
  return expiresInSeconds
}

export function unsupportedSignedUrl(adapter: string, key: string): StorageError {
  return new StorageError(
    `A(z) ${adapter} adapter nem tud lejáró (aláírt) URL-t készíteni. Hagyd el az expiresInSeconds opciót, vagy használj másik adaptert.`,
    { operation: 'getUrl', key },
  )
}

export function missingPublicBaseUrl(adapter: string, key: string): StorageError {
  return new StorageError(
    `A(z) ${adapter} adapterrel URL készítéséhez add meg a publicBaseUrl opciót.`,
    { operation: 'getUrl', key },
  )
}

export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

export function basename(key: string): string {
  return key.slice(key.lastIndexOf('/') + 1)
}
