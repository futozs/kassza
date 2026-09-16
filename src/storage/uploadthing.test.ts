import { describe, expect, test } from 'vitest'
import { FAKE_PDF_BYTES } from '../../tests/helpers'
import { StorageError } from './errors'
import { UPLOADTHING_MAX_CUSTOM_ID_LENGTH, uploadthingStorage } from './uploadthing'

interface FileEsque extends Blob {
  name: string
  lastModified?: number
  customId?: string | null
}

interface UploadFilesOptions {
  metadata?: unknown
  contentDisposition?: 'inline' | 'attachment'
  acl?: 'public-read' | 'private'
  concurrency?: number
}

interface UploadedFileData {
  key: string
  url: string
  appUrl: string
  ufsUrl: string
  name: string
  size: number
  customId: string | null
  type: string
  fileHash: string
}

type UploadFileResult =
  | { data: UploadedFileData; error: null }
  | { data: null; error: { code: string; message: string; data: unknown } }

class FakeUTApi {
  readonly calls: unknown[][] = []
  nextError: string | undefined

  uploadFiles(files: FileEsque, opts?: UploadFilesOptions): Promise<UploadFileResult>
  uploadFiles(files: FileEsque[], opts?: UploadFilesOptions): Promise<UploadFileResult[]>
  async uploadFiles(
    files: FileEsque | FileEsque[],
    opts?: UploadFilesOptions,
  ): Promise<UploadFileResult | UploadFileResult[]> {
    this.calls.push(['uploadFiles', files, opts])
    if (this.nextError) {
      return { data: null, error: { code: 'BAD_REQUEST', message: this.nextError, data: null } }
    }
    const file = files as FileEsque
    return {
      data: {
        key: 'utkey123',
        url: 'https://utfs.io/f/utkey123',
        appUrl: 'https://utfs.io/a/app/utkey123',
        ufsUrl: 'https://app.ufs.sh/f/utkey123',
        name: file.name,
        size: file.size,
        customId: file.customId ?? null,
        type: file.type,
        fileHash: 'hash',
      },
      error: null,
    }
  }

  deleteFiles = async (
    keys: string[] | string,
    opts?: { keyType?: 'fileKey' | 'customId' },
  ): Promise<{ readonly success: boolean; readonly deletedCount: number }> => {
    this.calls.push(['deleteFiles', keys, opts])
    return { success: true, deletedCount: 1 }
  }

  generateSignedURL = async (
    key: string,
    opts?: { expiresIn?: number | string; keyType?: 'fileKey' | 'customId' },
  ): Promise<{ ufsUrl: string }> => {
    this.calls.push(['generateSignedURL', key, opts])
    return { ufsUrl: `https://app.ufs.sh/f/${key}?signature=x` }
  }
}

describe('uploadthingStorage', () => {
  test('uploadFiles(File) customId-val, a fájlnév a kulcs utolsó szakasza', async () => {
    const utapi = new FakeUTApi()
    const storage = uploadthingStorage({ utapi, acl: 'private', prefix: 'szamlak' })

    const stored = await storage.put('2026/E-1.pdf', FAKE_PDF_BYTES, {
      contentType: 'application/pdf',
    })

    const [, file, options] = utapi.calls[0] ?? []
    expect(file).toBeInstanceOf(File)
    expect((file as FileEsque).name).toBe('E-1.pdf')
    expect((file as FileEsque).customId).toBe('szamlak/2026/E-1.pdf')
    expect((file as FileEsque).type).toBe('application/pdf')
    expect(new Uint8Array(await (file as File).arrayBuffer())).toEqual(FAKE_PDF_BYTES)
    expect(options).toEqual({ acl: 'private' })
    expect(stored).toEqual({
      key: '2026/E-1.pdf',
      url: 'https://app.ufs.sh/f/utkey123',
      size: FAKE_PDF_BYTES.byteLength,
      contentType: 'application/pdf',
    })
  })

  test('régi válasznál a url mezőre esik vissza, contentDisposition továbbítva', async () => {
    const utapi = {
      uploadFiles: async () => ({
        data: { key: 'k', size: 3, url: 'https://utfs.io/f/k' },
        error: null,
      }),
      deleteFiles: async () => ({ success: true }),
    }
    const storage = uploadthingStorage({ utapi, contentDisposition: 'attachment' })

    const stored = await storage.put('a.pdf', FAKE_PDF_BYTES, { contentType: 'application/pdf' })

    expect(stored.url).toBe('https://utfs.io/f/k')
    await expect(storage.getUrl?.('a.pdf')).rejects.toThrow('generateSignedURL')
  })

  test('hibás feltöltés és túl hosszú customId StorageError', async () => {
    const utapi = new FakeUTApi()
    utapi.nextError = 'File already exists'
    const storage = uploadthingStorage({ utapi })

    await expect(
      storage.put('a.pdf', FAKE_PDF_BYTES, { contentType: 'application/pdf' }),
    ).rejects.toThrow('UploadThing hiba (put): File already exists')

    const longKey = `${'a'.repeat(UPLOADTHING_MAX_CUSTOM_ID_LENGTH)}.pdf`
    await expect(
      storage.put(longKey, FAKE_PDF_BYTES, { contentType: 'application/pdf' }),
    ).rejects.toThrow(StorageError)
    expect(utapi.calls).toHaveLength(1)

    const nullError = uploadthingStorage({
      utapi: { uploadFiles: async () => ({ data: null, error: null }), deleteFiles: async () => 0 },
    })
    await expect(
      nullError.put('a.pdf', FAKE_PDF_BYTES, { contentType: 'application/pdf' }),
    ).rejects.toThrow('ismeretlen hiba')
  })

  test('delete customId alapján, getUrl generateSignedURL-lel', async () => {
    const utapi = new FakeUTApi()
    const storage = uploadthingStorage({ utapi, prefix: 'p' })

    await storage.delete?.('a.pdf')
    const url = await storage.getUrl?.('a.pdf', { expiresInSeconds: 300 })
    const defaultUrl = await storage.getUrl?.('a.pdf')

    expect(utapi.calls).toEqual([
      ['deleteFiles', 'p/a.pdf', { keyType: 'customId' }],
      ['generateSignedURL', 'p/a.pdf', { expiresIn: 300 }],
      ['generateSignedURL', 'p/a.pdf', { expiresIn: 3600 }],
    ])
    expect(url).toBe('https://app.ufs.sh/f/p/a.pdf?signature=x')
    expect(defaultUrl).toBeDefined()
    await expect(storage.getUrl?.('a.pdf', { expiresInSeconds: 604_801 })).rejects.toThrow(
      StorageError,
    )
  })
})
