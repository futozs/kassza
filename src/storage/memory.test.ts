import { describe, expect, test } from 'vitest'
import { FAKE_PDF_BYTES } from '../../tests/helpers'
import { StorageError } from './errors'
import { memoryStorage } from './memory'
import { storePdf } from './store-pdf'

describe('memoryStorage', () => {
  test('put, get, getUrl, delete körforgás prefixszel', async () => {
    const storage = memoryStorage({ prefix: 'teszt' })

    const stored = await storePdf(storage, 'szamlak/E-1.pdf', FAKE_PDF_BYTES)

    expect(stored).toEqual({
      key: 'szamlak/E-1.pdf',
      url: 'memory://storage/teszt/szamlak/E-1.pdf',
      size: FAKE_PDF_BYTES.byteLength,
      contentType: 'application/pdf',
    })
    expect(storage.files.get('teszt/szamlak/E-1.pdf')?.contentType).toBe('application/pdf')
    expect(await storage.get('szamlak/E-1.pdf')).toEqual(FAKE_PDF_BYTES)
    expect(await storage.getUrl('szamlak/E-1.pdf')).toBe('memory://storage/teszt/szamlak/E-1.pdf')

    await storage.delete('szamlak/E-1.pdf')
    expect(await storage.get('szamlak/E-1.pdf')).toBeUndefined()
    await expect(storage.getUrl('szamlak/E-1.pdf')).rejects.toBeInstanceOf(StorageError)
  })

  test('másolatot tárol, a hívó későbbi módosítása nem hat rá', async () => {
    const storage = memoryStorage({ publicBaseUrl: 'https://cdn.example.hu' })
    const body = new Uint8Array([1, 2, 3])

    const stored = await storage.put('a.bin', body, { contentType: 'application/octet-stream' })
    body[0] = 9
    const read = await storage.get('a.bin')
    if (read) read[1] = 9

    expect(stored.url).toBe('https://cdn.example.hu/a.bin')
    expect(await storage.get('a.bin')).toEqual(new Uint8Array([1, 2, 3]))
    storage.clear()
    expect(storage.files.size).toBe(0)
  })

  test('path traversal kulcsot elutasít', async () => {
    const storage = memoryStorage()
    await expect(
      storage.put('../kivul.pdf', FAKE_PDF_BYTES, { contentType: 'application/pdf' }),
    ).rejects.toThrow(StorageError)
  })
})

describe('storePdf', () => {
  test('nem PDF tartalmat nem ment el', async () => {
    const storage = memoryStorage()

    await expect(
      storePdf(storage, 'x.pdf', new TextEncoder().encode('[ERR] hiba')),
    ).rejects.toMatchObject({ name: 'StorageError', operation: 'put', key: 'x.pdf' })
    expect(storage.files.size).toBe(0)
  })
})
