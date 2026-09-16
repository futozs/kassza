import { describe, expect, test } from 'vitest'
import { FAKE_PDF_BYTES } from '../../tests/helpers'
import { StorageError } from './errors'
import { r2BindingStorage } from './r2-binding'

interface R2HTTPMetadata {
  contentType?: string
  cacheControl?: string
}

class FakeR2Object {
  readonly version = 'v1'
  readonly etag = 'etag'
  constructor(
    readonly key: string,
    readonly size: number,
    readonly httpMetadata?: R2HTTPMetadata,
  ) {}
}

class FakeR2ObjectBody extends FakeR2Object {
  constructor(
    key: string,
    private readonly bytes: Uint8Array,
  ) {
    super(key, bytes.byteLength)
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    return this.bytes.slice().buffer
  }
}

class FakeR2Bucket {
  readonly objects = new Map<string, Uint8Array>()
  readonly calls: unknown[][] = []
  putReturnsNull = false

  async put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob,
    options?: { httpMetadata?: R2HTTPMetadata | Headers; customMetadata?: Record<string, string> },
  ): Promise<FakeR2Object | null> {
    this.calls.push(['put', key, value, options])
    if (this.putReturnsNull) return null
    const bytes = value as Uint8Array
    this.objects.set(key, bytes)
    return new FakeR2Object(key, bytes.byteLength)
  }

  async get(key: string, options?: { range?: unknown }): Promise<FakeR2ObjectBody | null> {
    this.calls.push(['get', key, options])
    const bytes = this.objects.get(key)
    return bytes ? new FakeR2ObjectBody(key, bytes) : null
  }

  async delete(keys: string | string[]): Promise<void> {
    this.calls.push(['delete', keys])
    for (const key of [keys].flat()) this.objects.delete(key)
  }
}

describe('r2BindingStorage', () => {
  test('put(key, bytes, { httpMetadata: { contentType } }) hívással ment', async () => {
    const bucket = new FakeR2Bucket()
    const storage = r2BindingStorage(bucket, {
      prefix: 'szamlak',
      publicBaseUrl: 'https://pdf.example.hu',
    })

    const stored = await storage.put('E-1.pdf', FAKE_PDF_BYTES, { contentType: 'application/pdf' })

    expect(bucket.calls[0]).toEqual([
      'put',
      'szamlak/E-1.pdf',
      FAKE_PDF_BYTES,
      { httpMetadata: { contentType: 'application/pdf' } },
    ])
    expect(stored).toEqual({
      key: 'E-1.pdf',
      url: 'https://pdf.example.hu/szamlak/E-1.pdf',
      size: FAKE_PDF_BYTES.byteLength,
      contentType: 'application/pdf',
    })
  })

  test('get arrayBuffer()-rel olvas, hiányzó objektumnál undefined, delete töröl', async () => {
    const bucket = new FakeR2Bucket()
    const storage = r2BindingStorage(bucket)
    await storage.put('a.pdf', FAKE_PDF_BYTES, { contentType: 'application/pdf' })

    expect(await storage.get('a.pdf')).toEqual(FAKE_PDF_BYTES)
    await storage.delete('a.pdf')
    expect(await storage.get('a.pdf')).toBeUndefined()
    expect(bucket.calls[2]).toEqual(['delete', 'a.pdf'])
  })

  test('null put eredmény és dobott hiba StorageError', async () => {
    const bucket = new FakeR2Bucket()
    bucket.putReturnsNull = true
    const storage = r2BindingStorage(bucket)

    await expect(
      storage.put('a.pdf', FAKE_PDF_BYTES, { contentType: 'application/pdf' }),
    ).rejects.toThrow('null-t adott vissza')

    const broken = r2BindingStorage({
      put: () => Promise.reject(new Error('R2 limit')),
      get: () => Promise.reject(new Error('R2 limit')),
      delete: () => Promise.reject(new Error('R2 limit')),
    })
    await expect(broken.get('a.pdf')).rejects.toMatchObject({
      name: 'StorageError',
      message: 'R2 hiba (get): R2 limit',
    })
  })

  test('getUrl: publikus URL, aláírt URL-t nem tud', async () => {
    const withUrl = r2BindingStorage(new FakeR2Bucket(), { publicBaseUrl: 'https://x.r2.dev' })
    const withoutUrl = r2BindingStorage(new FakeR2Bucket())

    expect(await withUrl.getUrl('a.pdf')).toBe('https://x.r2.dev/a.pdf')
    await expect(withUrl.getUrl('a.pdf', { expiresInSeconds: 60 })).rejects.toThrow('aláírt')
    await expect(withoutUrl.getUrl('a.pdf')).rejects.toThrow(StorageError)
    await expect(withoutUrl.getUrl('../a.pdf')).rejects.toThrow('Érvénytelen tárhelykulcs')
  })
})
