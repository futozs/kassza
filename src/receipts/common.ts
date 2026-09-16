import { SzamlazzError } from '../core/errors'
import { RECEIPT_PDF_TEMPLATES, type ReceiptPdfTemplate } from './types'

export const RECEIPT_XSD_BASE_URL = 'https://www.szamlazz.hu/szamla/docs/xsds/'

export const DEFAULT_RECEIPT_DOWNLOAD_PDF = true

export function receiptValidationError(message: string): SzamlazzError {
  return new SzamlazzError(message, { category: 'validation' })
}

export function requireText(value: string | undefined, message: string): string {
  const trimmed = value?.trim()
  if (!trimmed) throw receiptValidationError(message)
  return trimmed
}

export function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

const templates: ReadonlySet<string> = new Set(RECEIPT_PDF_TEMPLATES)

export function validateTemplate(
  template: ReceiptPdfTemplate | undefined,
): ReceiptPdfTemplate | undefined {
  if (template === undefined) return undefined
  if (!templates.has(template)) {
    throw receiptValidationError(
      `Ismeretlen nyugta PDF sablon: ${String(template)}. Lehetséges értékek: A (normál A4), N (80 mm), J (jegy), L (jegy logóval).`,
    )
  }
  return template
}

export function requireReceiptNumber(value: string | undefined): string {
  return requireText(value, 'Add meg a nyugtaszámot (receiptNumber).')
}
