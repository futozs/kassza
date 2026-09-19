import { describe, expect, test } from 'vitest'
import { createKassza, type Kassza } from '../src/index'

const agentKey = process.env.SZAMLAZZ_TEST_AGENT_KEY?.trim()

function liveKassza(): Kassza {
  return createKassza({ ...(agentKey ? { agentKey } : {}), cookieStore: false })
}

describe.skipIf(!agentKey)('élő Számlázz.hu tesztfiók', () => {
  test('az Agent kulcs érvényes', async () => {
    await expect(liveKassza().verifyCredentials()).resolves.toBe(true)
  })

  test('a számlaelőnézet PDF-et és helyes összegeket ad, számla létrehozása nélkül', async () => {
    const preview = await liveKassza().invoices.preview({
      buyer: {
        name: 'Kassza Smoke Teszt Kft.',
        zip: '1111',
        city: 'Budapest',
        address: 'Teszt utca 1.',
      },
      items: [{ name: 'Smoke teszt tétel', quantity: 2, netUnitPrice: 1000, vat: 27 }],
    })

    expect(preview.pdf.byteLength).toBeGreaterThan(1000)
    expect(preview.netTotal).toBe(2000)
    expect(preview.grossTotal).toBe(2540)
  })
})
