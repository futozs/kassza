import { describe, expect, test } from 'vitest'
import { FAKE_PDF_BYTES } from '../../tests/helpers'
import { StorageError } from './errors'
import { s3Storage } from './s3'

interface PutObjectCommandInput {
  Bucket: string | undefined
  Key: string | undefined
  Body?: string | Uint8Array | Blob | ReadableStream
  ContentType?: string
  ContentLength?: number
  CacheControl?: string
}

interface ObjectCommandInput {
  Bucket: string | undefined
  Key: string | undefined
}

abstract class FakeCommand<Input> {
  constructor(readonly input: Input) {}
  resolveMiddleware(): void {}
}

class PutObjectCommand extends FakeCommand<PutObjectCommandInput> {}
class GetObjectCommand extends FakeCommand<ObjectCommandInput> {}
class DeleteObjectCommand extends FakeCommand<ObjectCommandInput> {}

class FakeS3ServiceException extends Error {
  constructor(
    override readonly name: string,
    readonly $metadata: { httpStatusCode?: number },
  ) {
    super(name)
  }
}

class FakeS3Client {
  readonly sent: FakeCommand<unknown>[] = []
  readonly objects = new Map<string, Uint8Array>()
  failWith: unknown

  send<InputType extends object, OutputType>(
    command: FakeCommand<InputType>,
    options?: { abortSignal?: AbortSignal },
  ): Promise<OutputType>
  async send(command: FakeCommand<unknown>): Promise<unknown> {
    this.sent.push(command)
    if (this.failWith) throw this.failWith
    if (command instanceof PutObjectCommand) {
      this.objects.set(String(command.input.Key), command.input.Body as Uint8Array)
      return { ETag: '"etag"', $metadata: { httpStatusCode: 200 } }
    }
    if (command instanceof GetObjectCommand) {
      const body = this.objects.get(String(command.input.Key))
      if (!body) throw new FakeS3ServiceException('NoSuchKey', { httpStatusCode: 404 })
      return { Body: { transformToByteArray: async () => body }, $metadata: {} }
    }
    this.objects.delete(String((command.input as ObjectCommandInput).Key))
    return { $metadata: { httpStatusCode: 204 } }
  }
}

const getSignedUrl = async (
  client: FakeS3Client,
  command: FakeCommand<ObjectCommandInput>,
  options?: { expiresIn?: number; signableHeaders?: Set<string> },
): Promise<string> =>
  `https://signed.example/${command.input.Key}?expires=${options?.expiresIn}&n=${client.sent.length}`

const commands = { PutObjectCommand, GetObjectCommand, DeleteObjectCommand }

describe('s3Storage (AWS SDK v3)', () => {
  test('PutObjectCommand-ot küld a pontos inputtal, prefixszel', async () => {
    const client = new FakeS3Client()
    const storage = s3Storage({ client, bucket: 'szamlak', commands, prefix: 'ceg/' })

    const stored = await storage.put('E-1.pdf', FAKE_PDF_BYTES, { contentType: 'application/pdf' })

    expect(client.sent[0]).toBeInstanceOf(PutObjectCommand)
    expect(client.sent[0]?.input).toEqual({
      Bucket: 'szamlak',
      Key: 'ceg/E-1.pdf',
      Body: FAKE_PDF_BYTES,
      ContentType: 'application/pdf',
      ContentLength: FAKE_PDF_BYTES.byteLength,
    })
    expect(stored).toEqual({
      key: 'E-1.pdf',
      url: undefined,
      size: FAKE_PDF_BYTES.byteLength,
      contentType: 'application/pdf',
    })
  })

  test('get: transformToByteArray-jel olvas, NoSuchKey esetén undefined', async () => {
    const client = new FakeS3Client()
    const storage = s3Storage({ client, bucket: 'b', commands })
    await storage.put('a.pdf', FAKE_PDF_BYTES, { contentType: 'application/pdf' })

    expect(await storage.get('a.pdf')).toEqual(FAKE_PDF_BYTES)
    expect(await storage.get('nincs.pdf')).toBeUndefined()
    expect(client.sent[1]?.input).toEqual({ Bucket: 'b', Key: 'a.pdf' })
  })

  test('get: 404 státuszú, más nevű hiba is undefined, Body nélküli válasz hiba', async () => {
    const client = new FakeS3Client()
    const storage = s3Storage({ client, bucket: 'b', commands })

    client.failWith = new FakeS3ServiceException('NotFound', { httpStatusCode: 404 })
    expect(await storage.get('a.pdf')).toBeUndefined()
    client.failWith = new FakeS3ServiceException('Unknown', { httpStatusCode: 404 })
    expect(await storage.get('a.pdf')).toBeUndefined()

    client.failWith = undefined
    const noBody = s3Storage({
      client: { send: async () => ({ $metadata: {} }) },
      bucket: 'b',
      commands,
    })
    await expect(noBody.get('a.pdf')).rejects.toThrow('nem tartalmaz olvasható Body-t')
  })

  test('SDK hibát StorageError-rá csomagol a HTTP státusszal', async () => {
    const client = new FakeS3Client()
    client.failWith = new FakeS3ServiceException('AccessDenied', { httpStatusCode: 403 })
    const storage = s3Storage({ client, bucket: 'b', commands })

    await expect(
      storage.put('a.pdf', FAKE_PDF_BYTES, { contentType: 'application/pdf' }),
    ).rejects.toMatchObject({ name: 'StorageError', status: 403, operation: 'put' })
    await expect(storage.get('a.pdf')).rejects.toMatchObject({ status: 403, operation: 'get' })
    await expect(storage.delete('a.pdf')).rejects.toMatchObject({ operation: 'delete' })

    client.failWith = 'nem Error'
    await expect(storage.delete('a.pdf')).rejects.toMatchObject({ status: undefined })
  })

  test('delete: DeleteObjectCommand-ot küld', async () => {
    const client = new FakeS3Client()
    const storage = s3Storage({ client, bucket: 'b', commands })
    await storage.put('a.pdf', FAKE_PDF_BYTES, { contentType: 'application/pdf' })

    await storage.delete('a.pdf')

    expect(client.sent[1]).toBeInstanceOf(DeleteObjectCommand)
    expect(client.objects.size).toBe(0)
  })

  test('hiányzó Get/Delete command esetén érthető hiba', async () => {
    const storage = s3Storage({
      client: new FakeS3Client(),
      bucket: 'b',
      commands: { PutObjectCommand },
    })

    await expect(storage.get('a.pdf')).rejects.toThrow('commands.GetObjectCommand')
    await expect(storage.delete('a.pdf')).rejects.toThrow('commands.DeleteObjectCommand')
    await expect(storage.getUrl('a.pdf')).rejects.toThrow('publicBaseUrl')
  })

  test('getUrl: publikus URL, vagy getSignedUrl-lel aláírt URL', async () => {
    const client = new FakeS3Client()
    const storage = s3Storage({
      client,
      bucket: 'b',
      commands,
      getSignedUrl,
      publicBaseUrl: 'https://cdn.example.hu',
    })

    expect(await storage.getUrl('a b.pdf')).toBe('https://cdn.example.hu/a%20b.pdf')
    expect(await storage.getUrl('a.pdf', { expiresInSeconds: 120 })).toBe(
      'https://signed.example/a.pdf?expires=120&n=0',
    )
    await expect(storage.getUrl('a.pdf', { expiresInSeconds: 0 })).rejects.toThrow(StorageError)

    const privateStorage = s3Storage({ client, bucket: 'b', commands, getSignedUrl })
    expect(await privateStorage.getUrl('a.pdf')).toContain('expires=3600')

    const failing = s3Storage({
      client,
      bucket: 'b',
      commands,
      getSignedUrl: () => Promise.reject(new Error('no creds')),
    })
    await expect(failing.getUrl('a.pdf')).rejects.toMatchObject({
      operation: 'getUrl',
      message: 'S3 hiba (getUrl): no creds',
    })
  })
})
