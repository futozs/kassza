import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { FAKE_PDF_BYTES } from '../../tests/helpers'
import { SzamlazzError } from '../core/errors'
import { StorageError } from './errors'
import { type S3FetchStorageOptions, s3FetchStorage } from './s3-fetch'
import { sha256Hex, signAwsRequest } from './sigv4'
import { storePdf } from './store-pdf'

interface Captured {
  readonly url: string
  readonly method: string
  readonly headers: Record<string, string>
  readonly body: Uint8Array | undefined
}

function fakeFetch(...responses: Array<Response | Error>) {
  const calls: Captured[] = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const body = init?.body
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: { ...(init?.headers as Record<string, string>) },
      body: body instanceof ArrayBuffer ? new Uint8Array(body) : undefined,
    })
    const response = responses[Math.min(calls.length - 1, responses.length - 1)]
    if (!response) throw new Error('nincs mock válasz')
    if (response instanceof Error) throw response
    return response
  }
  return { fetch: fetch as typeof globalThis.fetch, calls }
}

const NOW = new Date('2026-09-16T10:00:00Z')
const R2: S3FetchStorageOptions = {
  endpoint: 'https://account.r2.cloudflarestorage.com',
  region: 'auto',
  bucket: 'szamlak',
  accessKeyId: 'AKIDEXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('s3FetchStorage put', () => {
  test('SigV4-gyel aláírt PUT kérést küld path-style URL-re', async () => {
    const { fetch, calls } = fakeFetch(new Response(null, { status: 200 }))
    const storage = s3FetchStorage({ ...R2, prefix: 'ceg', fetch })

    const stored = await storePdf(storage, '2026/09/E 1.pdf', FAKE_PDF_BYTES)

    const call = calls[0]
    expect(call?.method).toBe('PUT')
    expect(call?.url).toBe('https://account.r2.cloudflarestorage.com/szamlak/ceg/2026/09/E%201.pdf')
    expect(call?.body).toEqual(FAKE_PDF_BYTES)
    const expected = await signAwsRequest({
      method: 'PUT',
      url: call?.url ?? '',
      headers: { 'content-type': 'application/pdf' },
      payloadHash: await sha256Hex(FAKE_PDF_BYTES),
      credentials: { accessKeyId: R2.accessKeyId, secretAccessKey: R2.secretAccessKey },
      region: 'auto',
      service: 's3',
      date: NOW,
    })
    expect(call?.headers).toEqual(expected)
    expect(call?.headers.authorization).toContain('Credential=AKIDEXAMPLE/20260916/auto/s3/')
    expect(call?.headers).not.toHaveProperty('host')
    expect(stored).toEqual({
      key: '2026/09/E 1.pdf',
      url: undefined,
      size: FAKE_PDF_BYTES.byteLength,
      contentType: 'application/pdf',
    })
  })

  test('publicBaseUrl esetén publikus URL-t ad, session tokent aláír', async () => {
    const { fetch, calls } = fakeFetch(new Response(null, { status: 200 }))
    const storage = s3FetchStorage({
      ...R2,
      sessionToken: 'sess',
      publicBaseUrl: 'https://pdf.example.hu/',
      fetch,
    })

    const stored = await storage.put('a.pdf', FAKE_PDF_BYTES, { contentType: 'application/pdf' })

    expect(stored.url).toBe('https://pdf.example.hu/a.pdf')
    expect(calls[0]?.headers['x-amz-security-token']).toBe('sess')
  })

  test('S3 XML hibát olvasható StorageError-rá alakít', async () => {
    const xml =
      '<?xml version="1.0"?><Error><Code>AccessDenied</Code><Message>Access Denied</Message></Error>'
    const { fetch } = fakeFetch(new Response(xml, { status: 403, statusText: 'Forbidden' }))
    const storage = s3FetchStorage({ ...R2, fetch })

    await expect(
      storage.put('a.pdf', FAKE_PDF_BYTES, { contentType: 'application/pdf' }),
    ).rejects.toMatchObject({
      name: 'StorageError',
      operation: 'put',
      status: 403,
      message: 'S3 hiba (put, HTTP 403): AccessDenied: Access Denied',
    })
  })

  test('hálózati hibát StorageError-rá csomagol', async () => {
    const { fetch } = fakeFetch(new TypeError('fetch failed'))
    const storage = s3FetchStorage({ ...R2, fetch })

    const error = await storage
      .put('a.pdf', FAKE_PDF_BYTES, { contentType: 'application/pdf' })
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(StorageError)
    expect((error as StorageError).cause).toBeInstanceOf(TypeError)
    expect((error as StorageError).message).toContain('fetch failed')
  })

  test('path traversal kulcsot kérés nélkül elutasít', async () => {
    const { fetch, calls } = fakeFetch(new Response(null))
    const storage = s3FetchStorage({ ...R2, fetch })

    await expect(storage.get('../masik-bucket/x.pdf')).rejects.toThrow(StorageError)
    expect(calls).toHaveLength(0)
  })
})

describe('s3FetchStorage get és delete', () => {
  test('get: 200 esetén a bájtokat, 404 esetén undefined-ot ad', async () => {
    const { fetch, calls } = fakeFetch(
      new Response(FAKE_PDF_BYTES.slice(), { status: 200 }),
      new Response('<Error><Code>NoSuchKey</Code></Error>', { status: 404 }),
    )
    const storage = s3FetchStorage({ ...R2, fetch })

    expect(await storage.get('a.pdf')).toEqual(FAKE_PDF_BYTES)
    expect(await storage.get('nincs.pdf')).toBeUndefined()
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.headers['x-amz-content-sha256']).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
  })

  test('get: egyéb hibánál StorageError, üzenet nélküli válasznál a statusText-tel', async () => {
    const { fetch } = fakeFetch(new Response('', { status: 500, statusText: 'Internal' }))
    const storage = s3FetchStorage({ ...R2, fetch })

    await expect(storage.get('a.pdf')).rejects.toThrow('S3 hiba (get, HTTP 500): Internal')
  })

  test('delete: 204 és 404 rendben, 403 hiba', async () => {
    const { fetch, calls } = fakeFetch(
      new Response(null, { status: 204 }),
      new Response(null, { status: 404 }),
      new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 }),
    )
    const storage = s3FetchStorage({ ...R2, fetch })

    await storage.delete('a.pdf')
    await storage.delete('a.pdf')
    await expect(storage.delete('a.pdf')).rejects.toThrow('AccessDenied')
    expect(calls.map((call) => call.method)).toEqual(['DELETE', 'DELETE', 'DELETE'])
  })
})

describe('s3FetchStorage getUrl', () => {
  test('az AWS dokumentáció presigned URL tesztvektorát reprodukálja', async () => {
    vi.setSystemTime(new Date('2013-05-24T00:00:00Z'))
    const storage = s3FetchStorage({
      endpoint: 'https://s3.amazonaws.com',
      forcePathStyle: false,
      region: 'us-east-1',
      bucket: 'examplebucket',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    })

    expect(await storage.getUrl('test.txt', { expiresInSeconds: 86400 })).toBe(
      'https://examplebucket.s3.amazonaws.com/test.txt?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host&X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404',
    )
  })

  test('publicBaseUrl-lel publikus, lejárattal vagy anélkül aláírt URL', async () => {
    const withPublic = s3FetchStorage({ ...R2, publicBaseUrl: 'https://pdf.example.hu' })
    const privateOnly = s3FetchStorage(R2)

    expect(await withPublic.getUrl('a b.pdf')).toBe('https://pdf.example.hu/a%20b.pdf')
    expect(await withPublic.getUrl('a.pdf', { expiresInSeconds: 60 })).toContain('X-Amz-Expires=60')
    expect(await privateOnly.getUrl('a.pdf')).toContain('X-Amz-Expires=3600')
    await expect(privateOnly.getUrl('a.pdf', { expiresInSeconds: 604_801 })).rejects.toThrow(
      StorageError,
    )
  })
})

describe('s3FetchStorage URL-stílusok és konfiguráció', () => {
  async function putUrl(options: Partial<S3FetchStorageOptions>): Promise<string | undefined> {
    const { fetch, calls } = fakeFetch(new Response(null))
    await s3FetchStorage({ ...R2, ...options, fetch }).put('k.pdf', FAKE_PDF_BYTES, {
      contentType: 'application/pdf',
    })
    return calls[0]?.url
  }

  test('AWS: virtual-hosted alapból, pontos bucketnél és forcePathStyle-lal path-style', async () => {
    const aws = { endpoint: undefined, region: 'eu-central-1' }
    expect(await putUrl(aws)).toBe('https://szamlak.s3.eu-central-1.amazonaws.com/k.pdf')
    expect(await putUrl({ ...aws, bucket: 'szamlak.example.hu' })).toBe(
      'https://s3.eu-central-1.amazonaws.com/szamlak.example.hu/k.pdf',
    )
    expect(await putUrl({ ...aws, forcePathStyle: true })).toBe(
      'https://s3.eu-central-1.amazonaws.com/szamlak/k.pdf',
    )
  })

  test('egyedi endpoint: path-style alapból, virtual-hosted kérésre, alútvonal megmarad', async () => {
    expect(await putUrl({ endpoint: 'http://localhost:9000/' })).toBe(
      'http://localhost:9000/szamlak/k.pdf',
    )
    expect(
      await putUrl({ endpoint: 'https://s3.us-west-004.backblazeb2.com', forcePathStyle: false }),
    ).toBe('https://szamlak.s3.us-west-004.backblazeb2.com/k.pdf')
    expect(await putUrl({ endpoint: 'https://proxy.example.hu/s3/' })).toBe(
      'https://proxy.example.hu/s3/szamlak/k.pdf',
    )
  })

  test('hiányzó kötelező opció vagy hibás endpoint configuration hibát ad', () => {
    for (const missing of ['bucket', 'region', 'accessKeyId', 'secretAccessKey'] as const) {
      const error = (() => {
        try {
          s3FetchStorage({ ...R2, [missing]: ' ' })
        } catch (caught) {
          return caught
        }
      })()
      expect(error).toBeInstanceOf(SzamlazzError)
      expect((error as SzamlazzError).category).toBe('configuration')
      expect((error as SzamlazzError).message).toContain(missing)
    }
    expect(() => s3FetchStorage({ ...R2, endpoint: 'nem url' })).toThrow('Érvénytelen S3 endpoint')
  })

  test('fetch opció nélkül a globális fetch-et használja', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }))
    try {
      expect(await s3FetchStorage(R2).get('a.pdf')).toBeUndefined()
      expect(spy).toHaveBeenCalledOnce()
    } finally {
      spy.mockRestore()
    }
  })
})
