import { describe, expect, test, vi } from 'vitest'
import { mockAgent } from '../../tests/helpers'
import { RECEIPT_WITH_PDF_RESPONSE } from '../receipts/test-fixtures'
import { createDelegateKassza, createKasszaPool, DEFAULT_POOL_SIZE } from './pool'

const CREDENTIALS = {
  username: 'megbizott.mbsz@pelda.hu',
  password: 'As6dezh7*K#',
  invoicePrefix: 'MBSZ',
}

const INVOICE_RESPONSE = {
  headers: {
    szlahu_szamlaszam: 'MBSZ-2026-1',
    szlahu_nettovegosszeg: '1000',
    szlahu_bruttovegosszeg: '1270',
  },
  body: 'xmlagentresponse=DONE;MBSZ-2026-1',
}

const BUYER = { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' }

describe('createDelegateKassza', () => {
  test('a dedikált felhasználóval és az egyeztetett előtaggal számláz', async () => {
    const agent = mockAgent(INVOICE_RESPONSE)
    const kassza = createDelegateKassza({ ...CREDENTIALS, fetch: agent.fetch })

    await kassza.invoices.create({
      buyer: BUYER,
      items: [{ name: 'Szolgáltatás', netUnitPrice: 1000, vat: 27 }],
      downloadPdf: false,
    })

    const xml = agent.calls[0]?.xml ?? ''
    expect(xml).toContain('<felhasznalo>megbizott.mbsz@pelda.hu</felhasznalo>')
    expect(xml).toContain('<jelszo>As6dezh7*K#</jelszo>')
    expect(xml).not.toContain('szamlaagentkulcs')
    expect(xml).toContain('<szamlaszamElotag>MBSZ</szamlaszamElotag>')
  })

  test('a nyugtaelőtagot is alapértelmezésnek veszi, a többi alapbeállítást megtartja', async () => {
    const agent = mockAgent(RECEIPT_WITH_PDF_RESPONSE)
    const kassza = createDelegateKassza({
      ...CREDENTIALS,
      receiptPrefix: 'MBNY',
      defaults: { receipt: { paymentMethod: 'bankkártya', prefix: 'FELULIRVA' } },
      fetch: agent.fetch,
    })
    await kassza.receipts.create({ items: [{ name: 'Kávé', grossUnitPrice: 890, vat: 27 }] })
    const xml = agent.calls[0]?.xml ?? ''
    expect(xml).toContain('<elotag>MBNY</elotag>')
    expect(xml).toContain('<fizmod>bankkártya</fizmod>')
  })

  test('a defaults számla-előtagját az egyeztetett előtag írja felül', async () => {
    const agent = mockAgent(INVOICE_RESPONSE)
    const kassza = createDelegateKassza({
      ...CREDENTIALS,
      defaults: { invoice: { prefix: 'ROSSZ', paymentMethod: 'átutalás' } },
      fetch: agent.fetch,
    })
    await kassza.invoices.create({
      buyer: BUYER,
      items: [{ name: 'Szolgáltatás', netUnitPrice: 1000, vat: 27 }],
      downloadPdf: false,
    })
    expect(agent.calls[0]?.xml).toContain('<szamlaszamElotag>MBSZ</szamlaszamElotag>')
  })

  test('Agent kulcsot nem fogad el, mert az nem hordozza a megbízotti kapcsolatot', () => {
    expect(() =>
      createDelegateKassza({ ...CREDENTIALS, agentKey: 'kulcs' } as Parameters<
        typeof createDelegateKassza
      >[0]),
    ).toThrow(expect.objectContaining({ category: 'configuration' }))
  })

  test.each([
    ['hiányzó felhasználónév', { ...CREDENTIALS, username: ' ' }],
    ['hiányzó jelszó', { ...CREDENTIALS, password: '' }],
    ['kisbetűs előtag', { ...CREDENTIALS, invoicePrefix: 'mbsz' }],
    ['túl hosszú előtag', { ...CREDENTIALS, invoicePrefix: 'ABCDEF' }],
    ['hibás nyugtaelőtag', { ...CREDENTIALS, receiptPrefix: 'mb-1' }],
  ])('%s esetén konfigurációs hibát dob', (_label, options) => {
    expect(() => createDelegateKassza(options)).toThrow(
      expect.objectContaining({ category: 'configuration' }),
    )
  })
})

describe('createKasszaPool', () => {
  test('megbízónként egy klienst hoz létre, és párhuzamos kérésnél is egyszer old fel', async () => {
    const resolve = vi.fn(async (principalId: string) => ({
      ...CREDENTIALS,
      username: `${principalId}@pelda.hu`,
    }))
    const pool = createKasszaPool({ resolve, fetch: mockAgent(INVOICE_RESPONSE).fetch })

    const [first, second] = await Promise.all([pool.get('12345676'), pool.get(' 12345676 ')])
    const other = await pool.get('11111111')

    expect(first).toBe(second)
    expect(other).not.toBe(first)
    expect(resolve).toHaveBeenCalledTimes(2)
    expect(pool.size).toBe(2)
  })

  test('a közös beállításokat (fetch) minden kliens megkapja', async () => {
    const agent = mockAgent(INVOICE_RESPONSE)
    const pool = createKasszaPool({ resolve: () => CREDENTIALS, fetch: agent.fetch })
    const kassza = await pool.get('A')
    await kassza.invoices.create({
      buyer: BUYER,
      items: [{ name: 'Szolgáltatás', netUnitPrice: 1000, vat: 27 }],
      downloadPdf: false,
    })
    expect(agent.calls).toHaveLength(1)
  })

  test('ismeretlen megbízónál hibát dob, és a hibát nem tárolja', async () => {
    let known = false
    const pool = createKasszaPool({ resolve: () => (known ? CREDENTIALS : undefined) })
    await expect(pool.get('A')).rejects.toMatchObject({ category: 'configuration' })
    expect(pool.size).toBe(0)
    known = true
    await expect(pool.get('A')).resolves.toBeDefined()
  })

  test('a feloldó hibáját továbbadja, és nem tárolja', async () => {
    const pool = createKasszaPool({
      resolve: async () => {
        throw new Error('adatbázis hiba')
      },
    })
    await expect(pool.get('A')).rejects.toThrow('adatbázis hiba')
    expect(pool.size).toBe(0)
  })

  test('a legrégebben használt klienst dobja el a méretkorlát felett', async () => {
    const resolve = vi.fn(() => CREDENTIALS)
    const pool = createKasszaPool({ resolve, maxClients: 2 })
    const a = await pool.get('A')
    await pool.get('B')
    await pool.get('A')
    await pool.get('C')
    expect(pool.size).toBe(2)
    expect(await pool.get('A')).toBe(a)
    await pool.get('B')
    expect(resolve).toHaveBeenCalledTimes(4)
  })

  test('a forget és a clear eltávolítja a klienseket', async () => {
    const pool = createKasszaPool({ resolve: () => CREDENTIALS })
    await pool.get('A')
    await pool.get('B')
    pool.forget(' A ')
    expect(pool.size).toBe(1)
    pool.clear()
    expect(pool.size).toBe(0)
  })

  test('üres azonosítóra és hibás beállításra hibát dob', async () => {
    const pool = createKasszaPool({ resolve: () => CREDENTIALS })
    await expect(pool.get(' ')).rejects.toMatchObject({ category: 'configuration' })
    expect(() => createKasszaPool({ resolve: () => CREDENTIALS, maxClients: 0 })).toThrow(
      expect.objectContaining({ category: 'configuration' }),
    )
    expect(() => createKasszaPool({ resolve: undefined as unknown as () => undefined })).toThrow(
      expect.objectContaining({ category: 'configuration' }),
    )
    expect(DEFAULT_POOL_SIZE).toBe(100)
  })
})
