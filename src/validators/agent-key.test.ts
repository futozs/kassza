import { describe, expect, test } from 'vitest'
import { isValidAgentKey } from './agent-key'

describe('isValidAgentKey', () => {
  test('kisbetűs, számjegyes és kötőjeles kulcsot elfogad', () => {
    expect(isValidAgentKey('tesztkulcs0123456789abcdef')).toBe(true)
    expect(isValidAgentKey(' abc-123 ')).toBe(true)
  })

  test('nagybetűs, üres, szóközt tartalmazó és nem szöveg kulcsot elutasít', () => {
    expect(isValidAgentKey('Abc123')).toBe(false)
    expect(isValidAgentKey('   ')).toBe(false)
    expect(isValidAgentKey('abc 123')).toBe(false)
    expect(isValidAgentKey(null as unknown as string)).toBe(false)
  })
})
