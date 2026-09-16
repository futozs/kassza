import { guardStorageCall, StorageError } from './errors'
import {
  assertExpires,
  basename,
  DEFAULT_URL_EXPIRES_SECONDS,
  normalizePrefix,
  resolveKey,
  toArrayBuffer,
} from './shared'
import type { StorageAdapter, StoragePutOptions, StoredFile } from './types'

export const UPLOADTHING_MAX_CUSTOM_ID_LENGTH = 128
export const UPLOADTHING_MAX_SIGNED_URL_SECONDS = 604_800

export type UploadThingAcl = 'public-read' | 'private'

export interface UploadThingFileLike extends Blob {
  readonly name: string
  readonly customId: string
}

export interface UploadThingUploadOptions {
  readonly acl?: UploadThingAcl
  readonly contentDisposition?: 'inline' | 'attachment'
}

export interface UploadThingUploadedFile {
  readonly key: string
  readonly size: number
  readonly ufsUrl?: string
  readonly url?: string
}

export interface UploadThingUploadResult {
  readonly data: UploadThingUploadedFile | null
  readonly error: { readonly message: string } | null
}

export interface UploadThingApiLike {
  uploadFiles(
    file: UploadThingFileLike,
    options?: UploadThingUploadOptions,
  ): Promise<UploadThingUploadResult>
  deleteFiles(keys: string, options: { readonly keyType: 'customId' }): Promise<unknown>
  generateSignedURL?(
    key: string,
    options: { readonly expiresIn: number },
  ): Promise<{ readonly ufsUrl: string }>
}

export interface UploadThingStorageOptions {
  readonly utapi: UploadThingApiLike
  readonly acl?: UploadThingAcl | undefined
  readonly contentDisposition?: 'inline' | 'attachment' | undefined
  readonly prefix?: string | undefined
}

export function uploadthingStorage(options: UploadThingStorageOptions): StorageAdapter {
  const { utapi } = options
  const prefix = normalizePrefix(options.prefix)
  const uploadOptions: UploadThingUploadOptions = {
    ...(options.acl === undefined ? {} : { acl: options.acl }),
    ...(options.contentDisposition === undefined
      ? {}
      : { contentDisposition: options.contentDisposition }),
  }

  return {
    async put(key: string, body: Uint8Array, putOptions: StoragePutOptions): Promise<StoredFile> {
      const customId = resolveKey(prefix, key)
      if (customId.length > UPLOADTHING_MAX_CUSTOM_ID_LENGTH) {
        throw new StorageError(
          `Az UploadThing customId legfeljebb ${UPLOADTHING_MAX_CUSTOM_ID_LENGTH} karakter lehet, a kulcs ${customId.length} karakteres.`,
          { operation: 'key', key },
        )
      }
      const file = Object.assign(
        new File([toArrayBuffer(body)], basename(customId), { type: putOptions.contentType }),
        { customId },
      )
      const result = await guardStorageCall('UploadThing', 'put', key, () =>
        utapi.uploadFiles(file, uploadOptions),
      )
      if (!result.data) {
        throw new StorageError(
          `UploadThing hiba (put): ${result.error?.message ?? 'ismeretlen hiba'}`,
          { operation: 'put', key, cause: result.error },
        )
      }
      return {
        key,
        url: result.data.ufsUrl ?? result.data.url,
        size: result.data.size,
        contentType: putOptions.contentType,
      }
    },
    async delete(key: string): Promise<void> {
      const customId = resolveKey(prefix, key)
      await guardStorageCall('UploadThing', 'delete', key, () =>
        utapi.deleteFiles(customId, { keyType: 'customId' }),
      )
    },
    async getUrl(key: string, urlOptions = {}): Promise<string> {
      const customId = resolveKey(prefix, key)
      const generate = utapi.generateSignedURL
      if (!generate) {
        throw new StorageError(
          'Ez az UploadThing verzió nem támogatja a generateSignedURL-t, frissíts uploadthing v7-re.',
          { operation: 'getUrl', key },
        )
      }
      const expiresIn = assertExpires(
        urlOptions.expiresInSeconds ?? DEFAULT_URL_EXPIRES_SECONDS,
        UPLOADTHING_MAX_SIGNED_URL_SECONDS,
        key,
      )
      const result = await guardStorageCall('UploadThing', 'getUrl', key, () =>
        generate.call(utapi, customId, { expiresIn }),
      )
      return result.ufsUrl
    },
  }
}
