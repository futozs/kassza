import { describe, expect, test } from 'vitest'
import { FAKE_PDF_BYTES, mockAgent, textErrorResponse } from '../../tests/helpers'
import { DELEGATION_PROBE_INVOICE_NUMBER, probeDelegation } from './probe'

const DELEGATE = { username: 'megbizott.mbsz@pelda.hu', password: 'As6dezh7*K#' }

describe('probeDelegation', () => {
  test('a not found válasz élő kapcsolatot jelent, és a dedikált felhasználóval lép be', async () => {
    const agent = mockAgent(textErrorResponse('Hiányzó adat: ismeretlen számlaszám.', 7))
    const result = await probeDelegation({ ...DELEGATE, fetch: agent.fetch })
    expect(result).toEqual({ state: 'active', message: expect.stringContaining('él') })
    const xml = agent.calls[0]?.xml ?? ''
    expect(agent.calls[0]?.field).toBe('action-szamla_agent_pdf')
    expect(xml).toContain('<felhasznalo>megbizott.mbsz@pelda.hu</felhasznalo>')
    expect(xml).toContain(DELEGATION_PROBE_INVOICE_NUMBER)
  })

  test('sikeres PDF-válasz esetén is élőnek jelzi', async () => {
    const agent = mockAgent({
      headers: { 'content-type': 'application/pdf' },
      body: FAKE_PDF_BYTES,
    })
    await expect(probeDelegation({ ...DELEGATE, fetch: agent.fetch })).resolves.toMatchObject({
      state: 'active',
    })
  })

  test.each([
    [3, 'Sikertelen bejelentkezés.', 'awaiting-approval'],
    [
      250,
      'Ez a fiók nem használható, mert a fiókgazda még nem regisztrált.',
      'awaiting-owner-registration',
    ],
    [164, 'Ez a felhasználó több számlázási fiókhoz is hozzáfér.', 'multi-account-user'],
  ] as const)('a(z) %i hibakódot %s állapotra fordítja', async (code, message, state) => {
    const agent = mockAgent(textErrorResponse(message, code))
    const result = await probeDelegation({ ...DELEGATE, fetch: agent.fetch })
    expect(result).toMatchObject({ state, error: expect.objectContaining({ code }) })
    expect(agent.calls).toHaveLength(1)
  })

  test('a 250-es állapot üzenete figyelmeztet, hogy ne hívják ciklusban', async () => {
    const agent = mockAgent(textErrorResponse('A fiókgazda még nem regisztrált.', 250))
    const result = await probeDelegation({ ...DELEGATE, fetch: agent.fetch })
    expect(result.message).toContain('ne ellenőrizd ciklusban')
  })

  test('a nem kapcsolati hibát továbbdobja', async () => {
    const agent = mockAgent(textErrorResponse('Rendszerkarbantartás.', 1))
    await expect(
      probeDelegation({ ...DELEGATE, fetch: agent.fetch, retryDelayMs: 0, maxAttempts: 1 }),
    ).rejects.toMatchObject({ code: 1 })
  })

  test('Agent kulccsal vagy hiányos felhasználói adatokkal konfigurációs hibát dob', async () => {
    await expect(probeDelegation({ agentKey: 'kulcs', ...DELEGATE })).rejects.toMatchObject({
      category: 'configuration',
    })
    await expect(probeDelegation({ username: 'x@pelda.hu', password: '' })).rejects.toMatchObject({
      category: 'configuration',
    })
    await expect(probeDelegation({ username: ' ', password: 'jelszo123' })).rejects.toMatchObject({
      category: 'configuration',
    })
  })

  test('a hálózati hibát network kategóriájú hibaként adja tovább', async () => {
    const failing = (async () => {
      throw new RangeError('váratlan')
    }) as unknown as typeof globalThis.fetch
    await expect(
      probeDelegation({ ...DELEGATE, fetch: failing, retryDelayMs: 0 }),
    ).rejects.toMatchObject({ category: 'network' })
  })
})
