import { describe, expect, test } from 'vitest'
import { AGENT_ERROR_CODES, createAgentError, SzamlazzError, suggestedPrefix } from './errors'

const DOCUMENTED_DELEGATION_AND_RECEIPT_CODES = [
  8, 17, 68, 101, 137, 167, 200, 309, 353, 354, 356, 357, 358, 359, 360, 362, 489, 491, 493, 494,
  506, 507, 524,
]

describe('AGENT_ERROR_CODES', () => {
  test('a docs megbízotti, előtag-, KATA- és nyugta-hibakódjait is ismeri', () => {
    for (const code of DOCUMENTED_DELEGATION_AND_RECEIPT_CODES) {
      expect(AGENT_ERROR_CODES[code], `hiányzik: ${code}`).toBeDefined()
    }
  })

  test('minden kódhoz van üzenet és ismert kategória', () => {
    for (const [code, info] of Object.entries(AGENT_ERROR_CODES)) {
      expect(info.message.trim(), `üres üzenet: ${code}`).not.toBe('')
      expect(info.category).not.toBe('unknown')
    }
  })

  test('a tesztfiók darabszám-limitje rate_limit, és nem próbálkozik újra magától', () => {
    const error = createAgentError({ code: 167 })

    expect(error).toMatchObject({ category: 'rate_limit', retryable: false })
    expect(error.hint).toContain('10 percenként')
  })

  test('a KATA-védelem és a letiltott nyugta-előtag fiók-szintű hiba', () => {
    expect(createAgentError({ code: 491 })).toMatchObject({ category: 'account', code: 491 })
    expect(createAgentError({ code: 524 })).toMatchObject({ category: 'account', code: 524 })
  })
})

describe('SzamlazzError details', () => {
  test('a részleteket megőrzi, alapból undefined', () => {
    expect(new SzamlazzError('x', { category: 'validation' }).details).toBeUndefined()
    expect(
      new SzamlazzError('x', { category: 'attempt_limit', details: { attemptKey: 'k' } }).details,
    ).toEqual({ attemptKey: 'k' })
    expect(new SzamlazzError('x', { category: 'attempt_limit' }).retryable).toBe(false)
  })
})

describe('suggestedPrefix', () => {
  test('a 356-os hibaüzenetből kiolvassa a javasolt előtagot', () => {
    const plain = createAgentError({
      code: 356,
      message: 'A megadott számlaszám előtag helyett használd ezt: MBSZ.',
    })
    const bracketed = createAgentError({
      code: 356,
      message: 'A megadott számlaszám előtag helyett használd ezt: (KFOD)',
    })
    const lowercase = createAgentError({
      code: 356,
      message: 'A megadott számlaszám előtag helyett használd ezt: mbab',
    })

    expect(suggestedPrefix(plain)).toBe('MBSZ')
    expect(suggestedPrefix(bracketed)).toBe('KFOD')
    expect(suggestedPrefix(lowercase)).toBe('MBAB')
  })

  test('más hibánál és nem SzamlazzError értéknél undefined', () => {
    expect(suggestedPrefix(createAgentError({ code: 357 }))).toBeUndefined()
    expect(
      suggestedPrefix(createAgentError({ code: 356, message: 'Nincs előtag' })),
    ).toBeUndefined()
    expect(suggestedPrefix(new Error('használd ezt: ABC'))).toBeUndefined()
    expect(suggestedPrefix(undefined)).toBeUndefined()
  })
})
