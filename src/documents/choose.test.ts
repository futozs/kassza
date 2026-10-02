import { describe, expect, test } from 'vitest'
import { chooseDocument, RECEIPT_MAX_GROSS_HUF } from './choose'

describe('chooseDocument', () => {
  test('magánszemélynek, 900 000 Ft alatt, kifizetve nyugta adható', () => {
    const decision = chooseDocument({ grossTotal: 12_990 })

    expect(decision.type).toBe('receipt')
    expect(decision.grossTotalHuf).toBe(12_990)
    expect(decision.reasons[0]).toContain('nyugta adható')
  })

  test('adószámos vagy cég vevőnek számla kell', () => {
    expect(chooseDocument({ grossTotal: 100, buyer: { taxNumber: '12345678-2-41' } }).type).toBe(
      'invoice',
    )
    expect(chooseDocument({ grossTotal: 100, buyer: { euTaxNumber: 'DE123' } }).type).toBe(
      'invoice',
    )
    expect(chooseDocument({ grossTotal: 100, buyer: { isBusiness: true } }).type).toBe('invoice')
    expect(chooseDocument({ grossTotal: 100, buyer: { taxNumber: '  ' } }).type).toBe('receipt')
  })

  test('a 900 000 Ft-os határt pontosan kezeli', () => {
    expect(chooseDocument({ grossTotal: RECEIPT_MAX_GROSS_HUF - 1 }).type).toBe('receipt')
    const atLimit = chooseDocument({ grossTotal: RECEIPT_MAX_GROSS_HUF })

    expect(atLimit.type).toBe('invoice')
    expect(atLimit.reasons[0]).toContain('900 000 Ft')
  })

  test('devizás összeget forintra számít át, árfolyam nélkül hibát dob', () => {
    expect(chooseDocument({ grossTotal: 2_000, currency: 'EUR', exchangeRate: 400 })).toMatchObject(
      {
        type: 'receipt',
        grossTotalHuf: 800_000,
      },
    )
    expect(chooseDocument({ grossTotal: 2_300, currency: 'EUR', exchangeRate: 400 }).type).toBe(
      'invoice',
    )
    expect(() => chooseDocument({ grossTotal: 10, currency: 'EUR' })).toThrow(/árfolyamot/)
    expect(() => chooseDocument({ grossTotal: 10, currency: 'EUR', exchangeRate: 0 })).toThrow(
      /árfolyamot/,
    )
  })

  test('utólagos fizetésnél és számlakérésnél számla kell, minden okot felsorol', () => {
    const decision = chooseDocument({
      grossTotal: 1_000_000,
      buyer: { isBusiness: true },
      paidByFulfillment: false,
      invoiceRequested: true,
    })

    expect(decision.type).toBe('invoice')
    expect(decision.reasons).toHaveLength(4)
  })

  test('pénztárgép-köteles tevékenységnél számítógépes nyugtát nem enged', () => {
    const decision = chooseDocument({ grossTotal: 890, cashRegisterRequired: true })

    expect(decision.type).toBe('cash-register')
    expect(decision.reasons.join(' ')).toContain('pénztárgép')
    expect(
      chooseDocument({ grossTotal: 890, cashRegisterRequired: true, invoiceRequested: true }).type,
    ).toBe('invoice')
  })

  test('érvénytelen végösszegre validációs hibát dob', () => {
    expect(() => chooseDocument({ grossTotal: -1 })).toThrow(/nemnegatív/)
    expect(() => chooseDocument({ grossTotal: Number.NaN })).toThrow(/nemnegatív/)
  })
})
