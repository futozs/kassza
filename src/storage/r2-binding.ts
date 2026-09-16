import { guardStorageCall, StorageError } from './errors'
import {
  joinPublicUrl,
  missingPublicBaseUrl,
  normalizePrefix,
  resolveKey,
  unsupportedSignedUrl,
} from './shared'
import type { CompleteStorageAdapter, StoragePutOptions, StoredFile } from './types'

export interface R2ObjectLike {
  readonly key: string
  readonly size: number
}

export interface R2ObjectBodyLike extends R2ObjectLike {
  arrayBuffer(): Promise<ArrayBuffer>
}

export interface R2PutOptionsLike {
  readonly httpMetadata: { readonly contentType: string }
}

export interface R2BucketLike {
  put(key: string, value: Uint8Array, options: R2PutOptionsLike): Promise<R2ObjectLike | null>
  get(key: string): Promise<R2ObjectBodyLike | null>
  delete(key: string): Promise<void>
}

export interface R2BindingStorageOptions {
  readonly publicBaseUrl?: string | undefined
  readonly prefix?: string | undefined
}

export function r2BindingStorage(
  bucket: R2BucketLike,
  options: R2BindingStorageOptions = {},
): CompleteStorageAdapter {
  const prefix = normalizePrefix(options.prefix)

  return {
    async put(key: string, body: Uint8Array, putOptions: StoragePutOptions): Promise<StoredFile> {
      const fullKey = resolveKey(prefix, key)
      const object = await guardStorageCall('R2', 'put', key, () =>
        bucket.put(fullKey, body, { httpMetadata: { contentType: putOptions.contentType } }),
      )
      if (!object) {
        throw new StorageError('Az R2 nem mentette el a fájlt (a put null-t adott vissza).', {
          operation: 'put',
          key,
        })
      }
      return {
        key,
        url: options.publicBaseUrl ? joinPublicUrl(options.publicBaseUrl, fullKey) : undefined,
        size: object.size,
        contentType: putOptions.contentType,
      }
    },
    async get(key) {
      const fullKey = resolveKey(prefix, key)
      const object = await guardStorageCall('R2', 'get', key, () => bucket.get(fullKey))
      if (!object) return undefined
      return new Uint8Array(await guardStorageCall('R2', 'get', key, () => object.arrayBuffer()))
    },
    async delete(key) {
      const fullKey = resolveKey(prefix, key)
      await guardStorageCall('R2', 'delete', key, () => bucket.delete(fullKey))
    },
    async getUrl(key, urlOptions = {}) {
      const fullKey = resolveKey(prefix, key)
      if (urlOptions.expiresInSeconds !== undefined) {
        throw unsupportedSignedUrl('r2BindingStorage', key)
      }
      if (!options.publicBaseUrl) throw missingPublicBaseUrl('r2BindingStorage', key)
      return joinPublicUrl(options.publicBaseUrl, fullKey)
    },
  }
}
