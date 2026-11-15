import { describe, expect, test } from 'vitest'
import { FAKE_NOW } from '../../tests/fake-agent'
import { canonicalJson, createConfirmations, idempotencyKey } from './confirmation'

describe('megerősítő kódok', () => {
  test('a kanonikus JSON-ban a kulcsok sorrendje nem számít, az undefined mezők kimaradnak', () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { y: 1, x: undefined }], c: null } })).toBe(
      canonicalJson({ a: { c: null, d: [2, { y: 1 }] }, b: 1 }),
    )
    expect(canonicalJson(undefined)).toBe('null')
  })

  test('a kulcsok sorrendjétől független, de az adatokhoz és a művelethez kötött', async () => {
    const confirmations = createConfirmations({ secret: 'titok', now: FAKE_NOW })
    const issued = await confirmations.issue('create_invoice', { b: 2, a: 1 })

    await expect(
      confirmations.verify('create_invoice', { a: 1, b: 2 }, issued.token, 'preview_invoice'),
    ).resolves.toBeUndefined()
    await expect(
      confirmations.verify('create_receipt', { a: 1, b: 2 }, issued.token, 'preview_receipt'),
    ).rejects.toThrow('eltérnek')
    expect(issued.expiresAt).toBe('2026-10-02T10:15:00.000Z')
  })

  test('a kód csak az előnézet budapesti napján érvényes, éjfél után érthető hibát ad', async () => {
    let now = new Date('2026-11-16T22:55:00.000Z')
    const confirmations = createConfirmations({ secret: 'titok', now: () => now })
    const issued = await confirmations.issue('reverse_invoice', { invoiceNumber: 'A-1' })

    now = new Date('2026-11-16T22:59:59.000Z')
    await expect(
      confirmations.verify('reverse_invoice', { invoiceNumber: 'A-1' }, issued.token, 'preview'),
    ).resolves.toBeUndefined()
    now = new Date('2026-11-16T23:00:00.000Z')
    const failure = await confirmations
      .verify('reverse_invoice', { invoiceNumber: 'A-1' }, issued.token, 'preview')
      .catch((error: unknown) => error)

    expect((failure as Error).message).toContain('2026-11-16')
    expect((failure as Error).message).toContain('éjfél')
    await expect(
      confirmations.verify('reverse_invoice', { invoiceNumber: 'A-2' }, issued.token, 'preview'),
    ).rejects.toThrow('eltérnek')
  })

  test('más titokkal készült kódot nem fogad el', async () => {
    const first = createConfirmations({ secret: 'egyik', now: FAKE_NOW })
    const second = createConfirmations({ secret: 'masik', now: FAKE_NOW })
    const issued = await first.issue('reverse_invoice', { invoiceNumber: 'A-1' })

    await expect(
      second.verify('reverse_invoice', { invoiceNumber: 'A-1' }, issued.token, 'preview_reversal'),
    ).rejects.toThrow('eltérnek')
  })

  test('véletlen titokkal is működik, a lejárati idő beállítható', async () => {
    let now = FAKE_NOW()
    const confirmations = createConfirmations({ ttlMs: 1000, now: () => now })
    const issued = await confirmations.issue('create_receipt', {})

    await confirmations.verify('create_receipt', {}, issued.token, 'preview_receipt')
    now = new Date(now.getTime() + 1001)

    await expect(
      confirmations.verify('create_receipt', {}, issued.token, 'preview_receipt'),
    ).rejects.toThrow('lejárt')
  })

  test('nem pozitív egész lejárati időre TypeError-t dob', () => {
    expect(() => createConfirmations({ ttlMs: 0, now: FAKE_NOW })).toThrow(TypeError)
    expect(() => createConfirmations({ ttlMs: 1.5, now: FAKE_NOW })).toThrow(TypeError)
  })

  test('az idempotencia-kulcs a művelettől, a naptól és a tartalomtól függ', async () => {
    const key = await idempotencyKey('create_receipt', '2026-10-02', { a: 1 })

    expect(key).toMatch(/^[0-9A-F]{20}$/)
    expect(await idempotencyKey('create_receipt', '2026-10-02', { a: 1 })).toBe(key)
    expect(await idempotencyKey('create_receipt', '2026-10-03', { a: 1 })).not.toBe(key)
    expect(await idempotencyKey('create_invoice', '2026-10-02', { a: 1 })).not.toBe(key)
    expect(await idempotencyKey('create_receipt', '2026-10-02', { a: 2 })).not.toBe(key)
  })
})
