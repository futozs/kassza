import { SzamlazzError } from '../core/errors'
import { describeError, StorageError, type StorageOperation } from './errors'
import {
  assertExpires,
  DEFAULT_URL_EXPIRES_SECONDS,
  encodeKeyPath,
  joinPublicUrl,
  normalizePrefix,
  resolveKey,
  S3_MAX_PRESIGN_SECONDS,
  toArrayBuffer,
} from './shared'
import { type AwsCredentials, presignAwsUrl, sha256Hex, signAwsRequest } from './sigv4'
import type { CompleteStorageAdapter, StoragePutOptions, StoredFile } from './types'

export interface S3FetchStorageOptions {
  readonly bucket: string
  readonly region: string
  readonly accessKeyId: string
  readonly secretAccessKey: string
  readonly sessionToken?: string | undefined
  readonly endpoint?: string | undefined
  readonly forcePathStyle?: boolean | undefined
  readonly publicBaseUrl?: string | undefined
  readonly prefix?: string | undefined
  readonly fetch?: typeof globalThis.fetch | undefined
}

function requireOption(value: string | undefined, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SzamlazzError(`Az s3FetchStorage ${name} opciója kötelező.`, {
      category: 'configuration',
    })
  }
  return value
}

function bucketBaseUrl(options: S3FetchStorageOptions): string {
  const bucket = options.bucket
  if (options.endpoint === undefined) {
    const pathStyle = options.forcePathStyle ?? bucket.includes('.')
    return pathStyle
      ? `https://s3.${options.region}.amazonaws.com/${bucket}`
      : `https://${bucket}.s3.${options.region}.amazonaws.com`
  }
  let endpoint: URL
  try {
    endpoint = new URL(options.endpoint)
  } catch (error) {
    throw new SzamlazzError(`Érvénytelen S3 endpoint: ${options.endpoint}`, {
      category: 'configuration',
      cause: error,
    })
  }
  const basePath = endpoint.pathname.replace(/\/+$/, '')
  if (options.forcePathStyle ?? true) return `${endpoint.origin}${basePath}/${bucket}`
  return `${endpoint.protocol}//${bucket}.${endpoint.host}${basePath}`
}

function readS3ErrorCode(body: string): string | undefined {
  const code = /<Code>([^<]*)<\/Code>/.exec(body)?.[1]
  const message = /<Message>([^<]*)<\/Message>/.exec(body)?.[1]
  if (!code) return undefined
  return message ? `${code}: ${message}` : code
}

export function s3FetchStorage(options: S3FetchStorageOptions): CompleteStorageAdapter {
  requireOption(options.bucket, 'bucket')
  requireOption(options.region, 'region')
  const credentials: AwsCredentials = {
    accessKeyId: requireOption(options.accessKeyId, 'accessKeyId'),
    secretAccessKey: requireOption(options.secretAccessKey, 'secretAccessKey'),
    sessionToken: options.sessionToken,
  }
  const baseUrl = bucketBaseUrl(options)
  const prefix = normalizePrefix(options.prefix)
  const scope = { credentials, region: options.region, service: 's3' }

  const objectUrl = (fullKey: string): string => `${baseUrl}/${encodeKeyPath(fullKey)}`

  async function send(
    operation: StorageOperation,
    key: string,
    init: { method: string; url: string; headers: Record<string, string>; body?: ArrayBuffer },
  ): Promise<Response> {
    const doFetch = options.fetch ?? globalThis.fetch
    try {
      return await doFetch(init.url, {
        method: init.method,
        headers: init.headers,
        ...(init.body === undefined ? {} : { body: init.body }),
      })
    } catch (error) {
      throw new StorageError(`S3 hálózati hiba (${operation}): ${describeError(error)}`, {
        operation,
        key,
        cause: error,
      })
    }
  }

  async function failure(
    operation: StorageOperation,
    key: string,
    response: Response,
  ): Promise<StorageError> {
    const body = await response.text().catch(() => '')
    const detail = readS3ErrorCode(body) ?? response.statusText
    return new StorageError(
      `S3 hiba (${operation}, HTTP ${response.status})${detail ? `: ${detail}` : ''}`,
      { operation, key, status: response.status },
    )
  }

  return {
    async put(key: string, body: Uint8Array, putOptions: StoragePutOptions): Promise<StoredFile> {
      const fullKey = resolveKey(prefix, key)
      const url = objectUrl(fullKey)
      const headers = await signAwsRequest({
        ...scope,
        method: 'PUT',
        url,
        headers: { 'content-type': putOptions.contentType },
        payloadHash: await sha256Hex(body),
      })
      const response = await send('put', key, {
        method: 'PUT',
        url,
        headers,
        body: toArrayBuffer(body),
      })
      if (!response.ok) throw await failure('put', key, response)
      return {
        key,
        url: options.publicBaseUrl ? joinPublicUrl(options.publicBaseUrl, fullKey) : undefined,
        size: body.byteLength,
        contentType: putOptions.contentType,
      }
    },
    async get(key) {
      const url = objectUrl(resolveKey(prefix, key))
      const headers = await signAwsRequest({ ...scope, method: 'GET', url })
      const response = await send('get', key, { method: 'GET', url, headers })
      if (response.status === 404) return undefined
      if (!response.ok) throw await failure('get', key, response)
      return new Uint8Array(await response.arrayBuffer())
    },
    async delete(key) {
      const url = objectUrl(resolveKey(prefix, key))
      const headers = await signAwsRequest({ ...scope, method: 'DELETE', url })
      const response = await send('delete', key, { method: 'DELETE', url, headers })
      if (!response.ok && response.status !== 404) throw await failure('delete', key, response)
    },
    async getUrl(key, urlOptions = {}) {
      const fullKey = resolveKey(prefix, key)
      if (urlOptions.expiresInSeconds === undefined && options.publicBaseUrl) {
        return joinPublicUrl(options.publicBaseUrl, fullKey)
      }
      return presignAwsUrl({
        ...scope,
        method: 'GET',
        url: objectUrl(fullKey),
        expiresInSeconds: assertExpires(
          urlOptions.expiresInSeconds ?? DEFAULT_URL_EXPIRES_SECONDS,
          S3_MAX_PRESIGN_SECONDS,
          key,
        ),
      })
    },
  }
}
