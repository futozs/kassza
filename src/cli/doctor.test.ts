import { describe, expect, test } from 'vitest'
import { formatDoctorReport } from './doctor'

describe('formatDoctorReport', () => {
  test('a cellában a függőleges vonalat és a backslasht is escape-eli', () => {
    const report = formatDoctorReport(
      [{ id: 'env', status: 'warn', message: 'a\\|b | C:\\temp' }],
      {
        nodeVersion: '22.0.0',
      },
    )

    expect(report).toContain('| env | warn | a\\\\\\|b \\| C:\\\\temp |')
  })
})
