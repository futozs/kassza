import { mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { FAKE_PDF_BYTES } from '../../tests/helpers'
import { SzamlazzError } from '../core/errors'
import { StorageError } from './errors'
import { fsStorage } from './fs'
import { invoicePdfKey } from './keys'
import { storePdf } from './store-pdf'

let base: string
let root: string
let outside: string

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'szamlazz-fs-'))
  root = join(base, 'root')
  outside = join(base, 'outside')
  await mkdir(outside)
})

afterEach(async () => {
  await rm(base, { recursive: true, force: true })
})

describe('fsStorage', () => {
  test('a könyvtárat létrehozza, és atomikusan írja a fájlt', async () => {
    const storage = fsStorage({ directory: root, publicBaseUrl: 'https://pdf.example.hu' })
    const key = invoicePdfKey({ number: 'E-1', date: '2026-09-16' })

    const stored = await storePdf(storage, key, FAKE_PDF_BYTES)

    expect(new Uint8Array(await readFile(join(root, 'szamlak/2026/09/E-1.pdf')))).toEqual(
      FAKE_PDF_BYTES,
    )
    expect(await readdir(join(root, 'szamlak/2026/09'))).toEqual(['E-1.pdf'])
    expect(stored).toEqual({
      key,
      url: 'https://pdf.example.hu/szamlak/2026/09/E-1.pdf',
      size: FAKE_PDF_BYTES.byteLength,
      contentType: 'application/pdf',
    })
    expect(storage.pathFor(key)).toBe(join(root, key))
    expect(storage.directory).toBe(root)
  })

  test('get, felülírás, delete, és hiányzó fájlnál undefined', async () => {
    const storage = fsStorage({ directory: root, prefix: 'p' })

    const stored = await storage.put('a.bin', new Uint8Array([1]), { contentType: 'x/y' })
    await storage.put('a.bin', new Uint8Array([2, 3]), { contentType: 'x/y' })

    expect(stored.url).toBeUndefined()
    expect(await storage.get('a.bin')).toEqual(new Uint8Array([2, 3]))
    await storage.delete('a.bin')
    await storage.delete('a.bin')
    expect(await storage.get('a.bin')).toBeUndefined()
    expect(await storage.get('soha/nem/volt.pdf')).toBeUndefined()
  })

  test.each(['../outside/x.pdf', 'a/../../x.pdf', '/etc/passwd', 'a\\..\\..\\x.pdf', 'a/./b'])(
    'path traversal kulcsot elutasít: %s',
    async (key) => {
      const storage = fsStorage({ directory: root })

      await expect(storage.put(key, FAKE_PDF_BYTES, { contentType: 'x' })).rejects.toThrow(
        StorageError,
      )
      await expect(storage.get(key)).rejects.toThrow(StorageError)
      await expect(storage.delete(key)).rejects.toThrow(StorageError)
      expect(() => storage.pathFor(key)).toThrow(StorageError)
      expect(await readdir(outside)).toEqual([])
    },
  )

  test('a gyökérből kifelé mutató szimbolikus linken át nem ír és nem olvas', async () => {
    await mkdir(root)
    await symlink(outside, join(root, 'link'))
    await writeFile(join(outside, 'titok.pdf'), 'titok')
    const storage = fsStorage({ directory: root })

    await expect(
      storage.put('link/x.pdf', FAKE_PDF_BYTES, { contentType: 'application/pdf' }),
    ).rejects.toThrow('kívülre mutat')
    await expect(storage.get('link/titok.pdf')).rejects.toThrow('kívülre mutat')
    expect(await readdir(outside)).toEqual(['titok.pdf'])
  })

  test('írási és olvasási hibát StorageError-rá csomagol, a temp fájlt eltakarítja', async () => {
    const storage = fsStorage({ directory: root })
    await mkdir(join(root, 'mappa.pdf'), { recursive: true })
    await writeFile(join(root, 'fajl'), 'x')

    await expect(
      storage.put('mappa.pdf', FAKE_PDF_BYTES, { contentType: 'application/pdf' }),
    ).rejects.toMatchObject({ name: 'StorageError', operation: 'put' })
    expect((await readdir(root)).sort()).toEqual(['fajl', 'mappa.pdf'])
    await expect(storage.get('mappa.pdf')).rejects.toMatchObject({ operation: 'get' })
    await expect(
      storage.put('fajl/alatta.pdf', FAKE_PDF_BYTES, { contentType: 'application/pdf' }),
    ).rejects.toMatchObject({ operation: 'put' })
  })

  test('getUrl publicBaseUrl-lel működik, aláírt URL-t nem tud', async () => {
    const withUrl = fsStorage({ directory: root, publicBaseUrl: 'https://x.hu/pdf/' })
    const withoutUrl = fsStorage({ directory: root })

    expect(await withUrl.getUrl('a b.pdf')).toBe('https://x.hu/pdf/a%20b.pdf')
    await expect(withUrl.getUrl('a.pdf', { expiresInSeconds: 1 })).rejects.toThrow('aláírt')
    await expect(withoutUrl.getUrl('a.pdf')).rejects.toThrow('publicBaseUrl')
  })

  test('üres directory configuration hiba', () => {
    expect(() => fsStorage({ directory: ' ' })).toThrow(SzamlazzError)
  })
})
