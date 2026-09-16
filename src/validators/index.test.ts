import { describe, expect, test } from 'vitest'
import * as validators from './index'

describe('validators barrel', () => {
  test('minden publikus validátort exportál', () => {
    expect(Object.keys(validators).sort()).toEqual([
      'EU_VAT_NUMBER_PATTERNS',
      'HUNGARIAN_TAX_COUNTY_CODES',
      'formatHungarianBankAccount',
      'isHungarianVatGroupMemberTaxNumber',
      'isValidAgentKey',
      'isValidEmail',
      'isValidEuVatNumber',
      'isValidHungarianBankAccount',
      'isValidHungarianGroupTaxNumber',
      'isValidHungarianIban',
      'isValidHungarianTaxNumber',
      'isValidHungarianTaxpayerId',
      'isValidHungarianZipCode',
      'normalizeEmail',
      'normalizeEuVatNumber',
      'parseHungarianAddress',
      'parseHungarianBankAccount',
      'parseHungarianTaxNumber',
    ])
  })
})
