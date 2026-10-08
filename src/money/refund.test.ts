import { describe, expect, test } from 'vitest'
import { SzamlazzError } from '../core/errors'
import { allocateRefund, type RefundableItem } from './refund'

const ITEMS: readonly RefundableItem[] = [
  { name: 'Könyv', vat: 5, grossAmount: 4_990, unit: 'db' },
  { name: 'Póló', vat: 27, grossAmount: 6_990, identifier: 'SKU-1' },
  { name: 'Szállítás', vat: 27, grossAmount: 1_490 },
]

function total(allocations: readonly { grossAmount: number }[]): number {
  return allocations.reduce((sum, allocation) => sum + allocation.grossAmount, 0)
}

describe('allocateRefund', () => {
  test('a visszatérítést pontosan, arányosan osztja szét, a tétel áfakulcsán', () => {
    const allocations = allocateRefund(ITEMS, 5_000)

    expect(total(allocations)).toBe(5_000)
    expect(allocations).toEqual([
      { index: 0, name: 'Könyv', vat: 5, grossAmount: 1_852, unit: 'db' },
      { index: 1, name: 'Póló', vat: 27, grossAmount: 2_595, identifier: 'SKU-1' },
      { index: 2, name: 'Szállítás', vat: 27, grossAmount: 553 },
    ])
  })

  test('teljes összegnél pontosan az eredeti tételeket adja', () => {
    expect(allocateRefund(ITEMS, 13_470).map((allocation) => allocation.grossAmount)).toEqual([
      4_990, 6_990, 1_490,
    ])
  })

  test('egy forintot a legnagyobb maradékú tételre tesz, a nullás tételt kihagyja', () => {
    const allocations = allocateRefund(
      [
        { name: 'A', vat: 27, grossAmount: 100 },
        { name: 'B', vat: 27, grossAmount: 1 },
        { name: 'C', vat: 0, grossAmount: 0 },
      ],
      1,
    )
    expect(allocations).toEqual([{ index: 0, name: 'A', vat: 27, grossAmount: 1 }])
  })

  test('egyenlő maradéknál a nagyobb, majd a korábbi tétel kapja', () => {
    const allocations = allocateRefund(
      [
        { name: 'A', vat: 27, grossAmount: 50 },
        { name: 'B', vat: 27, grossAmount: 50 },
      ],
      1,
    )
    expect(allocations.map((allocation) => allocation.name)).toEqual(['A'])
  })

  test('a korábbi visszatérítések után a maradékon oszt, és tételenként nem lépi túl az eredetit', () => {
    const items: RefundableItem[] = [
      { name: 'A', vat: 27, grossAmount: 100 },
      { name: 'B', vat: 5, grossAmount: 1 },
    ]
    const first = allocateRefund(items, 50)
    const second = allocateRefund(items, 51, { refundedBefore: 50 })
    const perItem = [0, 1].map((index) =>
      [...first, ...second]
        .filter((allocation) => allocation.index === index)
        .reduce((sum, allocation) => sum + allocation.grossAmount, 0),
    )
    expect(perItem).toEqual([100, 1])
  })

  test('sok apró visszatérítés után is pontosan az eredetit adja vissza tételenként', () => {
    const items: RefundableItem[] = [
      { name: 'A', vat: 27, grossAmount: 333 },
      { name: 'B', vat: 18, grossAmount: 333 },
      { name: 'C', vat: 5, grossAmount: 334 },
    ]
    const perItem = [0, 0, 0]
    for (let step = 0; step < 1_000; step++) {
      for (const allocation of allocateRefund(items, 1, { refundedBefore: step })) {
        perItem[allocation.index] = (perItem[allocation.index] ?? 0) + allocation.grossAmount
      }
    }
    expect(perItem).toEqual([333, 333, 334])
  })

  test('devizában két tizedesre oszt', () => {
    const allocations = allocateRefund(
      [
        { name: 'A', vat: 27, grossAmount: 10.01 },
        { name: 'B', vat: 27, grossAmount: 20.02 },
      ],
      10,
      { decimals: 2 },
    )
    expect(allocations.map((allocation) => allocation.grossAmount)).toEqual([3.33, 6.67])
    expect(Math.round(total(allocations) * 100)).toBe(1_000)
  })

  test('nagy összegeknél is pontos (nincs lebegőpontos túlcsordulás)', () => {
    const allocations = allocateRefund(
      [
        { name: 'A', vat: 27, grossAmount: 9_999_999_999 },
        { name: 'B', vat: 27, grossAmount: 7_777_777_777 },
      ],
      8_888_888_887,
    )
    expect(total(allocations)).toBe(8_888_888_887)
  })

  test('különleges áfakódot is megtart', () => {
    expect(allocateRefund([{ name: 'A', vat: 'AAM', grossAmount: 1000 }], 10)[0]?.vat).toBe('AAM')
  })

  test.each([
    ['üres tétellista', [], 10, {}],
    ['nulla visszatérítés', ITEMS, 0, {}],
    ['negatív visszatérítés', ITEMS, -5, {}],
    ['az eredetinél nagyobb visszatérítés', ITEMS, 13_471, {}],
    ['a korábbiakkal együtt túl nagy', ITEMS, 100, { refundedBefore: 13_400 }],
    ['negatív korábbi összeg', ITEMS, 100, { refundedBefore: -1 }],
    ['tizedes forint számlán', ITEMS, 10.5, {}],
    ['nem véges összeg', ITEMS, Number.NaN, {}],
    ['negatív tétel', [{ name: 'A', vat: 27, grossAmount: -1 }], 1, {}],
    ['érvénytelen tizedes', ITEMS, 10, { decimals: 7 }],
  ] as const)('validációs hibát dob: %s', (_label, items, refund, options) => {
    expect(() => allocateRefund(items as RefundableItem[], refund, options)).toThrow(SzamlazzError)
  })
})
