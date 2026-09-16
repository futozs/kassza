import { guardStorageCall, StorageError, type StorageOperation } from './errors'
import { assertExpires, DEFAULT_URL_EXPIRES_SECONDS, normalizePrefix, resolveKey } from './shared'
import type { CompleteStorageAdapter, StoragePutOptions, StoredFile } from './types'

export const SUPABASE_MAX_SIGNED_URL_SECONDS = 31_536_000

export interface SupabaseStorageErrorLike {
  readonly message: string
  readonly status?: number | undefined
  readonly statusCode?: string | undefined
}

export interface SupabaseResultLike<T> {
  readonly data: T | null
  readonly error: SupabaseStorageErrorLike | null
}

export interface SupabaseUploadOptions {
  readonly contentType: string
  readonly upsert: boolean
  readonly cacheControl?: string
}

export interface SupabaseBucketApiLike {
  upload(
    path: string,
    body: Uint8Array,
    options: SupabaseUploadOptions,
  ): PromiseLike<SupabaseResultLike<{ readonly path: string }>>
  download(path: string): PromiseLike<SupabaseResultLike<Blob>>
  remove(paths: string[]): PromiseLike<SupabaseResultLike<unknown>>
  createSignedUrl(
    path: string,
    expiresIn: number,
  ): PromiseLike<SupabaseResultLike<{ readonly signedUrl: string }>>
  getPublicUrl(path: string): { readonly data: { readonly publicUrl: string } }
}

export interface SupabaseClientLike {
  readonly storage: {
    from(bucket: string): SupabaseBucketApiLike
  }
}

export interface SupabaseStorageOptions {
  readonly client: SupabaseClientLike
  readonly bucket: string
  readonly public?: boolean | undefined
  readonly upsert?: boolean | undefined
  readonly cacheControl?: string | undefined
  readonly prefix?: string | undefined
}

function isNotFound(error: SupabaseStorageErrorLike): boolean {
  return (
    error.status === 404 || error.statusCode === '404' || /not[\s_-]?found/i.test(error.message)
  )
}

const run = <T>(
  operation: StorageOperation,
  key: string,
  call: () => PromiseLike<SupabaseResultLike<T>>,
): Promise<SupabaseResultLike<T>> => guardStorageCall('Supabase Storage', operation, key, call)

function failure(
  operation: StorageOperation,
  key: string,
  error: SupabaseStorageErrorLike | null,
): StorageError {
  return new StorageError(
    `Supabase Storage hiba (${operation}): ${error?.message ?? 'üres válasz'}`,
    { operation, key, status: error?.status, cause: error ?? undefined },
  )
}

export function supabaseStorage(options: SupabaseStorageOptions): CompleteStorageAdapter {
  const prefix = normalizePrefix(options.prefix)
  const bucket = (): SupabaseBucketApiLike => options.client.storage.from(options.bucket)

  return {
    async put(key: string, body: Uint8Array, putOptions: StoragePutOptions): Promise<StoredFile> {
      const path = resolveKey(prefix, key)
      const uploadOptions: SupabaseUploadOptions = {
        contentType: putOptions.contentType,
        upsert: options.upsert ?? true,
        ...(options.cacheControl === undefined ? {} : { cacheControl: options.cacheControl }),
      }
      const result = await run('put', key, () => bucket().upload(path, body, uploadOptions))
      if (!result.data) throw failure('put', key, result.error)
      return {
        key,
        url: options.public ? bucket().getPublicUrl(path).data.publicUrl : undefined,
        size: body.byteLength,
        contentType: putOptions.contentType,
      }
    },
    async get(key) {
      const path = resolveKey(prefix, key)
      const result = await run('get', key, () => bucket().download(path))
      if (!result.data) {
        if (result.error && isNotFound(result.error)) return undefined
        throw failure('get', key, result.error)
      }
      const blob = result.data
      return new Uint8Array(await blob.arrayBuffer())
    },
    async delete(key) {
      const path = resolveKey(prefix, key)
      const result = await run('delete', key, () => bucket().remove([path]))
      if (result.error) throw failure('delete', key, result.error)
    },
    async getUrl(key, urlOptions = {}) {
      const path = resolveKey(prefix, key)
      if (options.public && urlOptions.expiresInSeconds === undefined) {
        return bucket().getPublicUrl(path).data.publicUrl
      }
      const expiresIn = assertExpires(
        urlOptions.expiresInSeconds ?? DEFAULT_URL_EXPIRES_SECONDS,
        SUPABASE_MAX_SIGNED_URL_SECONDS,
        key,
      )
      const result = await run('getUrl', key, () => bucket().createSignedUrl(path, expiresIn))
      if (!result.data) throw failure('getUrl', key, result.error)
      return result.data.signedUrl
    },
  }
}
