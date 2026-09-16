import { describe, expect, test } from 'vitest'
import { AGENT_ACTIONS, SZAMLAZZ_AGENT_URL } from './actions'

describe('AGENT_ACTIONS', () => {
  test('mind a 11 dokumentált Számla Agent műveletet lefedi', () => {
    expect(Object.keys(AGENT_ACTIONS)).toHaveLength(11)
  })

  test('minden form mező egyedi és action- előtagú', () => {
    const fields = Object.values(AGENT_ACTIONS)

    expect(new Set(fields).size).toBe(fields.length)
    for (const field of fields) expect(field).toMatch(/^action-/)
  })

  test('a végpont HTTPS és perjelre végződik', () => {
    expect(SZAMLAZZ_AGENT_URL).toBe('https://www.szamlazz.hu/szamla/')
  })
})
