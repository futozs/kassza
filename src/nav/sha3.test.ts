import { describe, expect, test } from 'vitest'
import { sha3_512, sha3_512Hex } from './sha3'

describe('sha3_512Hex', () => {
  test('a NAV specifikáció requestSignature tesztvektorát adja', () => {
    expect(
      sha3_512Hex('DPrHL3Tr6djsrPt20260824065053ce-8f5e-215119fa7dd621DLMRHRLH2S').toUpperCase(),
    ).toBe(
      '2FD464BE4D01BE6BB72A30E9AD864BB433D3D253BEFA9FA921316075A1341844567CFBC7CBAEB9E20E4723F583DB8962F46054F928FB203EFC6467B77B969625',
    )
  })

  test('a NIST üres és „abc” tesztvektorait adja', () => {
    expect(sha3_512Hex('')).toBe(
      'a69f73cca23a9ac5c8b567dc185a756e97c982164fe25859e0d1dcc1475c80a615b2123af1f5f94c11e3e9402c3ac558f500199d95b6d3e301758586281dcd26',
    )
    expect(sha3_512Hex('abc')).toBe(
      'b751850b1a57168a5693cd924b6b096e08f621827444f70d884f5d0240d2712e10e116e9192af3c91a7ec57647e3934057340b4cf408d5a56592f8274eec53f0',
    )
  })

  test('több blokkos bemenetre a referencia-implementációval egyezik', () => {
    expect(sha3_512Hex('a'.repeat(200))).toBe(
      'eae6c85c6904f11075de9f9d5e1064371d000510fa3d2d79d40cf9be34892fb01859d0a0234e138bcb0ad5c84f6c0dca226a414b0c9a2897cb695f5185fe36ec',
    )
    const bytes = new Uint8Array(768)
    for (let index = 0; index < bytes.length; index++) bytes[index] = index % 256
    expect(sha3_512Hex(bytes)).toBe(
      'ad3a11a3430f0fac234a6c15bff0cb609b3d6fde0eac5873893e2775d15cf47d6791b4db907361c53719da248a7662f759b3f6c7ffb4fe69492a9449728cdad7',
    )
  })

  test('az ékezetes szöveget UTF-8 bájtokként hasheli', () => {
    expect(sha3_512Hex('árvíztűrő tükörfúrógép')).toBe(
      'eee1e8d653c867d84260ca2e682d853e9057ec0d207073d49a702d35b325657f6d18c9b71aa4081ce663de181e9300cec4cb552556251e79c63232a92ecdef8d',
    )
  })

  test.each([
    [71, 'a7ddbe8f2b733937'],
    [72, 'd2a27ee3688f1a09'],
    [73, '61f2e1b50c812534'],
    [143, '938dac393e7381a4'],
    [144, 'db1e0f7f2f4b7007'],
  ])('a(z) %i bájtos bemenetnél a blokkhatáron is a referenciát adja', (length, prefix) => {
    const result = sha3_512Hex('x'.repeat(length))
    expect(result).toMatch(/^[0-9a-f]{128}$/)
    expect(result.slice(0, 16)).toBe(prefix)
  })

  test('nézet (subarray) bemenetre is a tartalmat hasheli, és 64 bájtot ad', () => {
    const view = new TextEncoder().encode('xabcx').subarray(1, 4)
    expect(sha3_512Hex(view)).toBe(sha3_512Hex('abc'))
    expect(sha3_512(new Uint8Array())).toHaveLength(64)
  })
})
