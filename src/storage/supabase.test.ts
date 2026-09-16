import { describe, expect, test } from 'vitest'
import { FAKE_PDF_BYTES } from '../../tests/helpers'
import { StorageError } from './errors'
import { supabaseStorage } from './supabase'

class StorageApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly statusCode: string,
  ) {
    super(message)
  }
}

type Result<T> = { data: T; error: null } | { data: null; error: StorageApiError }

type FileBody = ArrayBuffer | ArrayBufferView | Blob | File | FormData | ReadableStream | string

type BlobDownloadBuilder = Promise<Result<Blob>> & { asStream(): never }

function downloadBuilder(result: Result<Blob>): BlobDownloadBuilder {
  return Object.assign(Promise.resolve(result), {
    asStream(): never {
      throw new Error('nem támogatott')
    },
  })
}

class FakeStorageFileApi {
  constructor(
    private readonly client: FakeSupabaseClient,
    private readonly bucketId: string,
  ) {}

  async upload(
    path: string,
    fileBody: FileBody,
    fileOptions?: { cacheControl?: string; contentType?: string; upsert?: boolean },
  ): Promise<Result<{ id: string; path: string; fullPath: string }>> {
    this.client.calls.push(['upload', this.bucketId, path, fileBody, fileOptions])
    if (this.client.fail) return { data: null, error: this.client.fail }
    this.client.objects.set(path, fileBody as Uint8Array)
    return { data: { id: '1', path, fullPath: `${this.bucketId}/${path}` }, error: null }
  }

  download(path: string, options?: { transform?: unknown }): BlobDownloadBuilder {
    this.client.calls.push(['download', this.bucketId, path, options])
    const bytes = this.client.objects.get(path)
    if (this.client.fail) return downloadBuilder({ data: null, error: this.client.fail })
    if (!bytes) {
      return downloadBuilder({
        data: null,
        error: new StorageApiError('Object not found', 400, '404'),
      })
    }
    return downloadBuilder({ data: new Blob([bytes.slice()]), error: null })
  }

  async remove(paths: string[]): Promise<Result<{ name: string }[]>> {
    this.client.calls.push(['remove', this.bucketId, paths])
    if (this.client.fail) return { data: null, error: this.client.fail }
    for (const path of paths) this.client.objects.delete(path)
    return { data: paths.map((name) => ({ name })), error: null }
  }

  async createSignedUrl(
    path: string,
    expiresIn: number,
    options?: { download?: string | boolean },
  ): Promise<Result<{ signedUrl: string }>> {
    this.client.calls.push(['createSignedUrl', this.bucketId, path, expiresIn, options])
    if (this.client.fail) return { data: null, error: this.client.fail }
    return { data: { signedUrl: `https://x.supabase.co/sign/${path}?e=${expiresIn}` }, error: null }
  }

  getPublicUrl(path: string, options?: { download?: string | boolean }) {
    this.client.calls.push(['getPublicUrl', this.bucketId, path, options])
    return { data: { publicUrl: `https://x.supabase.co/public/${this.bucketId}/${path}` } }
  }
}

class FakeSupabaseClient {
  readonly calls: unknown[][] = []
  readonly objects = new Map<string, Uint8Array>()
  fail: StorageApiError | undefined

  get storage() {
    return { from: (id: string) => new FakeStorageFileApi(this, id) }
  }
}

describe('supabaseStorage', () => {
  test('upload(path, bytes, { contentType, upsert }) hívással ment', async () => {
    const client = new FakeSupabaseClient()
    const storage = supabaseStorage({
      client,
      bucket: 'szamlak',
      prefix: 'ceg',
      cacheControl: '60',
    })

    const stored = await storage.put('E-1.pdf', FAKE_PDF_BYTES, { contentType: 'application/pdf' })

    expect(client.calls[0]).toEqual([
      'upload',
      'szamlak',
      'ceg/E-1.pdf',
      FAKE_PDF_BYTES,
      { contentType: 'application/pdf', upsert: true, cacheControl: '60' },
    ])
    expect(stored).toEqual({
      key: 'E-1.pdf',
      url: undefined,
      size: FAKE_PDF_BYTES.byteLength,
      contentType: 'application/pdf',
    })
  })

  test('publikus bucketnél a put és a getUrl publikus URL-t ad, upsert kikapcsolható', async () => {
    const client = new FakeSupabaseClient()
    const storage = supabaseStorage({ client, bucket: 'pub', public: true, upsert: false })

    const stored = await storage.put('a.pdf', FAKE_PDF_BYTES, { contentType: 'application/pdf' })

    expect(client.calls[0]?.[4]).toEqual({ contentType: 'application/pdf', upsert: false })
    expect(stored.url).toBe('https://x.supabase.co/public/pub/a.pdf')
    expect(await storage.getUrl('a.pdf')).toBe('https://x.supabase.co/public/pub/a.pdf')
    expect(await storage.getUrl('a.pdf', { expiresInSeconds: 30 })).toBe(
      'https://x.supabase.co/sign/a.pdf?e=30',
    )
  })

  test('get a BlobDownloadBuilder-ből olvas, nem létező fájlnál undefined', async () => {
    const client = new FakeSupabaseClient()
    const storage = supabaseStorage({ client, bucket: 'b' })
    await storage.put('a.pdf', FAKE_PDF_BYTES, { contentType: 'application/pdf' })

    expect(await storage.get('a.pdf')).toEqual(FAKE_PDF_BYTES)
    expect(await storage.get('nincs.pdf')).toBeUndefined()
  })

  test('privát bucketnél aláírt URL alapértelmezett lejárattal', async () => {
    const client = new FakeSupabaseClient()
    const storage = supabaseStorage({ client, bucket: 'b' })

    expect(await storage.getUrl('a.pdf')).toBe('https://x.supabase.co/sign/a.pdf?e=3600')
    await expect(storage.getUrl('a.pdf', { expiresInSeconds: -1 })).rejects.toThrow(StorageError)
  })

  test('delete remove([path]) hívással', async () => {
    const client = new FakeSupabaseClient()
    const storage = supabaseStorage({ client, bucket: 'b', prefix: 'p' })

    await storage.delete('a.pdf')

    expect(client.calls[0]).toEqual(['remove', 'b', ['p/a.pdf']])
  })

  test('a Supabase error mezőt StorageError-rá alakítja', async () => {
    const client = new FakeSupabaseClient()
    client.fail = new StorageApiError('new row violates row-level security policy', 403, '403')
    const storage = supabaseStorage({ client, bucket: 'b' })

    await expect(
      storage.put('a.pdf', FAKE_PDF_BYTES, { contentType: 'application/pdf' }),
    ).rejects.toMatchObject({ name: 'StorageError', operation: 'put', status: 403 })
    await expect(storage.get('a.pdf')).rejects.toThrow('row-level security')
    await expect(storage.delete('a.pdf')).rejects.toMatchObject({ operation: 'delete' })
    await expect(storage.getUrl('a.pdf')).rejects.toMatchObject({ operation: 'getUrl' })
  })

  test('404 státusz vagy üres válasz, illetve dobott hiba kezelése', async () => {
    const notFound = supabaseStorage({
      client: {
        storage: {
          from: () => ({
            upload: async () => ({ data: null, error: null }),
            download: async () => ({ data: null, error: { message: 'x', status: 404 } }),
            remove: () => Promise.reject(new Error('network')),
            createSignedUrl: async () => ({ data: null, error: null }),
            getPublicUrl: () => ({ data: { publicUrl: '' } }),
          }),
        },
      },
      bucket: 'b',
    })

    expect(await notFound.get('a.pdf')).toBeUndefined()
    await expect(
      notFound.put('a.pdf', FAKE_PDF_BYTES, { contentType: 'application/pdf' }),
    ).rejects.toThrow('üres válasz')
    await expect(notFound.delete('a.pdf')).rejects.toThrow(
      'Supabase Storage hiba (delete): network',
    )
    await expect(notFound.getUrl('a.pdf')).rejects.toThrow('üres válasz')
  })
})
