import { encodeRfc3986, toArrayBuffer } from './shared'

export interface AwsCredentials {
  readonly accessKeyId: string
  readonly secretAccessKey: string
  readonly sessionToken?: string | undefined
}

export interface AwsSigningScope {
  readonly credentials: AwsCredentials
  readonly region: string
  readonly service: string
  readonly date?: Date | undefined
}

export interface SignAwsRequestInput extends AwsSigningScope {
  readonly method: string
  readonly url: string | URL
  readonly headers?: Readonly<Record<string, string>> | undefined
  readonly body?: Uint8Array | string | undefined
  readonly payloadHash?: string | undefined
}

export interface PresignAwsUrlInput extends AwsSigningScope {
  readonly method: string
  readonly url: string | URL
  readonly expiresInSeconds: number
}

export const AWS_SIGV4_ALGORITHM = 'AWS4-HMAC-SHA256'
export const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD'

const encoder = new TextEncoder()

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function toBuffer(data: Uint8Array | string): ArrayBuffer {
  return typeof data === 'string' ? toArrayBuffer(encoder.encode(data)) : toArrayBuffer(data)
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', toBuffer(data)))
}

async function hmac(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return crypto.subtle.sign('HMAC', cryptoKey, toBuffer(data))
}

export function toAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '')
}

function canonicalPath(url: URL): string {
  return url.pathname
    .split('/')
    .map((segment) => encodeRfc3986(decodeURIComponent(segment)))
    .join('/')
}

function canonicalQuery(params: URLSearchParams): string {
  return [...params]
    .map(([name, value]) => [encodeRfc3986(name), encodeRfc3986(value)] as const)
    .sort(([nameA, valueA], [nameB, valueB]) =>
      nameA === nameB ? (valueA < valueB ? -1 : 1) : nameA < nameB ? -1 : 1,
    )
    .map(([name, value]) => `${name}=${value}`)
    .join('&')
}

function normalizeHeaders(headers: Readonly<Record<string, string>>): Map<string, string> {
  const normalized = new Map<string, string>()
  for (const [name, value] of Object.entries(headers)) {
    normalized.set(name.toLowerCase(), value.trim().replace(/\s+/g, ' '))
  }
  return new Map([...normalized].sort(([a], [b]) => (a < b ? -1 : 1)))
}

interface CanonicalInput {
  readonly method: string
  readonly url: URL
  readonly headers: Map<string, string>
  readonly payloadHash: string
}

function canonicalRequest(input: CanonicalInput): { request: string; signedHeaders: string } {
  const signedHeaders = [...input.headers.keys()].join(';')
  const headerLines = [...input.headers].map(([name, value]) => `${name}:${value}\n`).join('')
  const request = [
    input.method.toUpperCase(),
    canonicalPath(input.url),
    canonicalQuery(input.url.searchParams),
    headerLines,
    signedHeaders,
    input.payloadHash,
  ].join('\n')
  return { request, signedHeaders }
}

async function signCanonical(
  scope: AwsSigningScope,
  amzDate: string,
  request: string,
): Promise<{ signature: string; credentialScope: string }> {
  const day = amzDate.slice(0, 8)
  const credentialScope = `${day}/${scope.region}/${scope.service}/aws4_request`
  const stringToSign = [
    AWS_SIGV4_ALGORITHM,
    amzDate,
    credentialScope,
    await sha256Hex(request),
  ].join('\n')
  const dateKey = await hmac(toBuffer(`AWS4${scope.credentials.secretAccessKey}`), day)
  const regionKey = await hmac(dateKey, scope.region)
  const serviceKey = await hmac(regionKey, scope.service)
  const signingKey = await hmac(serviceKey, 'aws4_request')
  return { signature: toHex(await hmac(signingKey, stringToSign)), credentialScope }
}

export async function signAwsRequest(input: SignAwsRequestInput): Promise<Record<string, string>> {
  const url = new URL(input.url)
  const amzDate = toAmzDate(input.date ?? new Date())
  const payloadHash = input.payloadHash ?? (await sha256Hex(input.body ?? ''))
  const extra: Record<string, string> = { host: url.host, 'x-amz-date': amzDate }
  if (input.service === 's3') extra['x-amz-content-sha256'] = payloadHash
  if (input.credentials.sessionToken) extra['x-amz-security-token'] = input.credentials.sessionToken
  const headers = normalizeHeaders({ ...input.headers, ...extra })
  const { request, signedHeaders } = canonicalRequest({
    method: input.method,
    url,
    headers,
    payloadHash,
  })
  const { signature, credentialScope } = await signCanonical(input, amzDate, request)
  const result: Record<string, string> = {}
  for (const [name, value] of headers) {
    if (name !== 'host') result[name] = value
  }
  result.authorization = `${AWS_SIGV4_ALGORITHM} Credential=${input.credentials.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
  return result
}

export async function presignAwsUrl(input: PresignAwsUrlInput): Promise<string> {
  const url = new URL(input.url)
  const amzDate = toAmzDate(input.date ?? new Date())
  const credentialScope = `${amzDate.slice(0, 8)}/${input.region}/${input.service}/aws4_request`
  url.searchParams.set('X-Amz-Algorithm', AWS_SIGV4_ALGORITHM)
  url.searchParams.set('X-Amz-Credential', `${input.credentials.accessKeyId}/${credentialScope}`)
  url.searchParams.set('X-Amz-Date', amzDate)
  url.searchParams.set('X-Amz-Expires', String(input.expiresInSeconds))
  if (input.credentials.sessionToken) {
    url.searchParams.set('X-Amz-Security-Token', input.credentials.sessionToken)
  }
  url.searchParams.set('X-Amz-SignedHeaders', 'host')
  const { request } = canonicalRequest({
    method: input.method,
    url,
    headers: new Map([['host', url.host]]),
    payloadHash: UNSIGNED_PAYLOAD,
  })
  const { signature } = await signCanonical(input, amzDate, request)
  const query = `${canonicalQuery(url.searchParams)}&X-Amz-Signature=${signature}`
  return `${url.origin}${canonicalPath(url)}?${query}`
}
