import { describe, expect, test } from 'vitest'
import { trimSlashes, trimTrailingSlashes } from './url'

describe('trimTrailingSlashes', () => {
  test('levágja a záró perjeleket, a többit nem bántja', () => {
    expect(trimTrailingSlashes('https://api.example.com///')).toBe('https://api.example.com')
    expect(trimTrailingSlashes('https://api.example.com/v1')).toBe('https://api.example.com/v1')
    expect(trimTrailingSlashes('//')).toBe('')
    expect(trimTrailingSlashes('')).toBe('')
  })

  test('hosszú perjelsorozaton is lineáris marad', () => {
    const input = `${'/'.repeat(200_000)}x`
    const start = performance.now()
    expect(trimTrailingSlashes(input)).toBe(input)
    expect(performance.now() - start).toBeLessThan(100)
  })
})

describe('trimSlashes', () => {
  test('mindkét végéről levágja a perjeleket', () => {
    expect(trimSlashes('//szamlak/2026//')).toBe('szamlak/2026')
    expect(trimSlashes('szamlak')).toBe('szamlak')
    expect(trimSlashes('///')).toBe('')
  })
})
