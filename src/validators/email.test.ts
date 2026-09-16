import { describe, expect, test } from 'vitest'
import { isValidEmail, normalizeEmail } from './email'

describe('email', () => {
  test('normalizeEmail levágja a szóközöket és kisbetűsít', () => {
    expect(normalizeEmail('  Vevo@Example.HU ')).toBe('vevo@example.hu')
  })

  test.each(['vevo@example.hu', 'a.b+c@sub.example.co.uk', ' vevo@example.hu '])(
    'érvényes: %s',
    (value) => {
      expect(isValidEmail(value)).toBe(true)
    },
  )

  test.each(['vevo', 'vevo@', '@example.hu', 'vevo@example', 've vo@example.hu', 'a@b..hu'])(
    'érvénytelen: %s',
    (value) => {
      expect(isValidEmail(value)).toBe(false)
    },
  )

  test('a túl hosszú és a nem szöveg értéket elutasítja', () => {
    expect(isValidEmail(`${'a'.repeat(250)}@example.hu`)).toBe(false)
    expect(isValidEmail(1 as unknown as string)).toBe(false)
  })
})
