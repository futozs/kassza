import { mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { SzamlazzError } from '../core/errors'
import { guardStorageCall, StorageError, type StorageOperation } from './errors'
import {
  joinPublicUrl,
  missingPublicBaseUrl,
  normalizePrefix,
  resolveKey,
  unsupportedSignedUrl,
} from './shared'
import type { CompleteStorageAdapter, StoragePutOptions, StoredFile } from './types'

export interface FsStorageOptions {
  readonly directory: string
  readonly publicBaseUrl?: string | undefined
  readonly prefix?: string | undefined
}

export interface FsStorage extends CompleteStorageAdapter {
  readonly directory: string
  pathFor(key: string): string
}

function isInside(root: string, target: string): boolean {
  const path = relative(root, target)
  return path !== '' && !path.startsWith('..') && !isAbsolute(path)
}

function hasCode(error: unknown, code: string): boolean {
  return (error as { code?: unknown } | null)?.code === code
}

function traversal(operation: StorageOperation, key: string): StorageError {
  return new StorageError(`A kulcs a tárhely könyvtárán kívülre mutat: ${JSON.stringify(key)}`, {
    operation,
    key,
  })
}

export function fsStorage(options: FsStorageOptions): FsStorage {
  if (typeof options.directory !== 'string' || options.directory.trim() === '') {
    throw new SzamlazzError('Az fsStorage directory opciója kötelező.', {
      category: 'configuration',
    })
  }
  const root = resolve(options.directory)
  const prefix = normalizePrefix(options.prefix)

  function pathFor(key: string, operation: StorageOperation = 'key'): string {
    const target = resolve(root, resolveKey(prefix, key))
    if (!isInside(root, target)) throw traversal(operation, key)
    return target
  }

  async function assertRealPathInside(
    path: string,
    operation: StorageOperation,
    key: string,
  ): Promise<void> {
    const [realRoot, realTarget] = await Promise.all([realpath(root), realpath(path)])
    if (realTarget !== realRoot && !isInside(realRoot, realTarget)) throw traversal(operation, key)
  }

  return {
    directory: root,
    pathFor: (key) => pathFor(key),
    async put(key: string, body: Uint8Array, putOptions: StoragePutOptions): Promise<StoredFile> {
      const target = pathFor(key, 'put')
      const directory = dirname(target)
      await guardStorageCall('Fájlrendszer', 'put', key, () =>
        mkdir(directory, { recursive: true }),
      )
      await assertRealPathInside(directory, 'put', key)
      const temporary = `${target}.${crypto.randomUUID()}.tmp`
      try {
        await writeFile(temporary, body)
        await rename(temporary, target)
      } catch (error) {
        await rm(temporary, { force: true }).catch(() => undefined)
        throw new StorageError(`Fájlrendszer hiba (put): ${String(error)}`, {
          operation: 'put',
          key,
          cause: error,
        })
      }
      return {
        key,
        url: options.publicBaseUrl
          ? joinPublicUrl(options.publicBaseUrl, resolveKey(prefix, key))
          : undefined,
        size: body.byteLength,
        contentType: putOptions.contentType,
      }
    },
    async get(key) {
      const target = pathFor(key, 'get')
      try {
        await assertRealPathInside(target, 'get', key)
        return new Uint8Array(await readFile(target))
      } catch (error) {
        if (hasCode(error, 'ENOENT')) return undefined
        if (error instanceof StorageError) throw error
        throw new StorageError(`Fájlrendszer hiba (get): ${String(error)}`, {
          operation: 'get',
          key,
          cause: error,
        })
      }
    },
    async delete(key) {
      const target = pathFor(key, 'delete')
      await guardStorageCall('Fájlrendszer', 'delete', key, () => rm(target, { force: true }))
    },
    async getUrl(key, urlOptions = {}) {
      const fullKey = resolveKey(prefix, key)
      if (urlOptions.expiresInSeconds !== undefined) throw unsupportedSignedUrl('fsStorage', key)
      if (!options.publicBaseUrl) throw missingPublicBaseUrl('fsStorage', key)
      return joinPublicUrl(options.publicBaseUrl, fullKey)
    },
  }
}
