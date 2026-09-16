import { describeError, StorageError, type StorageOperation } from './errors'
import {
  assertExpires,
  DEFAULT_URL_EXPIRES_SECONDS,
  joinPublicUrl,
  normalizePrefix,
  resolveKey,
  S3_MAX_PRESIGN_SECONDS,
} from './shared'
import type {
  CompleteStorageAdapter,
  StoragePutOptions,
  StorageUrlOptions,
  StoredFile,
} from './types'

export type S3CommandLike = object

export interface S3ClientLike {
  send(command: S3CommandLike): Promise<unknown>
}

export interface S3ObjectInput {
  readonly Bucket: string
  readonly Key: string
}

export interface S3PutObjectInput extends S3ObjectInput {
  readonly Body: Uint8Array
  readonly ContentType: string
  readonly ContentLength: number
}

export interface S3Commands {
  readonly PutObjectCommand: new (input: S3PutObjectInput) => S3CommandLike
  readonly GetObjectCommand?: (new (input: S3ObjectInput) => S3CommandLike) | undefined
  readonly DeleteObjectCommand?: (new (input: S3ObjectInput) => S3CommandLike) | undefined
}

export interface S3PresignOptions {
  readonly expiresIn: number
}

interface S3PresignerMethod {
  presign(client: S3ClientLike, command: S3CommandLike, options: S3PresignOptions): Promise<string>
}

export type S3GetSignedUrl = S3PresignerMethod['presign']

export interface S3StorageOptions {
  readonly client: S3ClientLike
  readonly bucket: string
  readonly commands: S3Commands
  readonly publicBaseUrl?: string | undefined
  readonly prefix?: string | undefined
  readonly getSignedUrl?: S3GetSignedUrl | undefined
}

interface S3ErrorLike {
  readonly name?: unknown
  readonly $metadata?: { readonly httpStatusCode?: unknown }
}

function statusOf(error: unknown): number | undefined {
  const status = (error as S3ErrorLike | null)?.$metadata?.httpStatusCode
  return typeof status === 'number' ? status : undefined
}

function isNotFound(error: unknown): boolean {
  const name = (error as S3ErrorLike | null)?.name
  return name === 'NoSuchKey' || name === 'NotFound' || statusOf(error) === 404
}

function wrap(operation: StorageOperation, key: string, error: unknown): StorageError {
  return new StorageError(`S3 hiba (${operation}): ${describeError(error)}`, {
    operation,
    key,
    status: statusOf(error),
    cause: error,
  })
}

function missingCommand(name: string, key: string, operation: StorageOperation): StorageError {
  return new StorageError(`Ehhez a művelethez add meg a commands.${name} osztályt.`, {
    operation,
    key,
  })
}

async function readBody(output: unknown): Promise<Uint8Array> {
  const body = (output as { Body?: { transformToByteArray?: unknown } } | null)?.Body
  if (!body || typeof body.transformToByteArray !== 'function') {
    throw new Error('A GetObject válasza nem tartalmaz olvasható Body-t.')
  }
  return (await body.transformToByteArray()) as Uint8Array
}

export function s3Storage(options: S3StorageOptions): CompleteStorageAdapter {
  const prefix = normalizePrefix(options.prefix)
  const { client, bucket, commands } = options

  return {
    async put(key: string, body: Uint8Array, putOptions: StoragePutOptions): Promise<StoredFile> {
      const fullKey = resolveKey(prefix, key)
      try {
        await client.send(
          new commands.PutObjectCommand({
            Bucket: bucket,
            Key: fullKey,
            Body: body,
            ContentType: putOptions.contentType,
            ContentLength: body.byteLength,
          }),
        )
      } catch (error) {
        throw wrap('put', key, error)
      }
      return {
        key,
        url: options.publicBaseUrl ? joinPublicUrl(options.publicBaseUrl, fullKey) : undefined,
        size: body.byteLength,
        contentType: putOptions.contentType,
      }
    },
    async get(key: string): Promise<Uint8Array | undefined> {
      const fullKey = resolveKey(prefix, key)
      if (!commands.GetObjectCommand) throw missingCommand('GetObjectCommand', key, 'get')
      try {
        const output = await client.send(
          new commands.GetObjectCommand({ Bucket: bucket, Key: fullKey }),
        )
        return await readBody(output)
      } catch (error) {
        if (isNotFound(error)) return undefined
        throw wrap('get', key, error)
      }
    },
    async delete(key: string): Promise<void> {
      const fullKey = resolveKey(prefix, key)
      if (!commands.DeleteObjectCommand) throw missingCommand('DeleteObjectCommand', key, 'delete')
      try {
        await client.send(new commands.DeleteObjectCommand({ Bucket: bucket, Key: fullKey }))
      } catch (error) {
        throw wrap('delete', key, error)
      }
    },
    async getUrl(key: string, urlOptions: StorageUrlOptions = {}): Promise<string> {
      const fullKey = resolveKey(prefix, key)
      if (urlOptions.expiresInSeconds === undefined && options.publicBaseUrl) {
        return joinPublicUrl(options.publicBaseUrl, fullKey)
      }
      if (!options.getSignedUrl || !commands.GetObjectCommand) {
        throw new StorageError(
          'URL készítéséhez add meg a publicBaseUrl opciót, vagy aláírt URL-hez a getSignedUrl függvényt (@aws-sdk/s3-request-presigner) és a commands.GetObjectCommand osztályt.',
          { operation: 'getUrl', key },
        )
      }
      const expiresIn = assertExpires(
        urlOptions.expiresInSeconds ?? DEFAULT_URL_EXPIRES_SECONDS,
        S3_MAX_PRESIGN_SECONDS,
        key,
      )
      try {
        return await options.getSignedUrl(
          client,
          new commands.GetObjectCommand({ Bucket: bucket, Key: fullKey }),
          { expiresIn },
        )
      } catch (error) {
        throw wrap('getUrl', key, error)
      }
    },
  }
}
