import { StorageError } from './errors'
import { joinPublicUrl, normalizePrefix, resolveKey } from './shared'
import type { StorageAdapter, StoragePutOptions, StorageUrlOptions, StoredFile } from './types'

export interface MemoryStoredObject {
  readonly body: Uint8Array
  readonly contentType: string
}

export interface MemoryStorageOptions {
  readonly publicBaseUrl?: string | undefined
  readonly prefix?: string | undefined
}

export interface MemoryStorage extends StorageAdapter {
  readonly files: ReadonlyMap<string, MemoryStoredObject>
  get(key: string): Promise<Uint8Array | undefined>
  delete(key: string): Promise<void>
  getUrl(key: string, options?: StorageUrlOptions): Promise<string>
  clear(): void
}

const MEMORY_BASE_URL = 'memory://storage'

export function memoryStorage(options: MemoryStorageOptions = {}): MemoryStorage {
  const prefix = normalizePrefix(options.prefix)
  const files = new Map<string, MemoryStoredObject>()
  const urlFor = (fullKey: string): string =>
    joinPublicUrl(options.publicBaseUrl ?? MEMORY_BASE_URL, fullKey)

  return {
    files,
    async put(key: string, body: Uint8Array, putOptions: StoragePutOptions): Promise<StoredFile> {
      const fullKey = resolveKey(prefix, key)
      files.set(fullKey, { body: body.slice(), contentType: putOptions.contentType })
      return {
        key,
        url: urlFor(fullKey),
        size: body.byteLength,
        contentType: putOptions.contentType,
      }
    },
    async get(key) {
      return files.get(resolveKey(prefix, key))?.body.slice()
    },
    async delete(key) {
      files.delete(resolveKey(prefix, key))
    },
    async getUrl(key) {
      const fullKey = resolveKey(prefix, key)
      if (!files.has(fullKey)) {
        throw new StorageError(`Nincs ilyen fájl: ${key}`, {
          operation: 'getUrl',
          key,
          status: 404,
        })
      }
      return urlFor(fullKey)
    },
    clear() {
      files.clear()
    },
  }
}
