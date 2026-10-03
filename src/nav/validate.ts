import { todayInBudapest } from '../core/dates'
import { decimalPlaces } from '../money/rounding'
import { NavReceiptError } from './errors'
import type { NavReceiptData } from './types'

export const NAV_SERIAL_NUMBER_PATTERN: RegExp =
  /^[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű0-9_/\-\\](?:[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű0-9/_\-\\ ]*[A-Za-zÁÉÍÓÖŐÚÜŰáéíóöőúüű0-9/_\-\\])?$/
export const NAV_SOFTWARE_NAME_PATTERN: RegExp = /^[A-ZÁÉÍÓÖŐÚÜŰa-záéíóöőúüű0-9.\s\-@+_]+$/
export const NAV_VAT_CATEGORY_PATTERN: RegExp = /^[A-Za-z0-9áéíóöőúüűÁÉÍÓÖŐÚÜŰ% ]+$/
export const NAV_REPORT_ID_PATTERN: RegExp = /^[0-9]{8}_[0-9]{8}_[0-9]+$/

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const CURRENCY_PATTERN = /^[A-Z]{3}$/
const TAXPAYER_ID_PATTERN = /^\d{8}$/
const MAX_SERIAL_LENGTH = 50
const MAX_SOFTWARE_NAME_LENGTH = 100
const MAX_VAT_NAME_LENGTH = 50
const MAX_REPORT_ID_LENGTH = 50
const MAX_ROW_AMOUNT = 999_999_999.99
const MAX_COUNT = 9_999_999
const MIN_EXCHANGE_RATE = 1
const MAX_EXCHANGE_RATE = 1000
const AMOUNT_DECIMALS = 2
const RATE_DECIMALS = 4
const AMOUNT_TOLERANCE = 0.005

function invalid(message: string, hint?: string): NavReceiptError {
  return new NavReceiptError(message, { category: 'validation', hint })
}

function assertDate(value: string, label: string): void {
  const parsed = DATE_PATTERN.test(value) ? new Date(`${value}T00:00:00Z`) : undefined
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw invalid(`A(z) ${label} nem érvényes ÉÉÉÉ-HH-NN dátum: "${value}".`)
  }
}

export function navDate(value: string, label = 'dátum'): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  assertDate(trimmed, label)
  return trimmed
}

export function navTaxpayerId(taxNumber: string): string {
  const digits = typeof taxNumber === 'string' ? taxNumber.replace(/[\s-]/g, '') : ''
  const taxpayerId = digits.slice(0, 8)
  if (!TAXPAYER_ID_PATTERN.test(taxpayerId) || (digits.length !== 8 && digits.length !== 11)) {
    throw new NavReceiptError(
      `Az adószám (${taxNumber}) nem 8 jegyű törzsszám vagy 11 jegyű adószám.`,
      { category: 'configuration' },
    )
  }
  return taxpayerId
}

export function assertSoftwareName(name: string): string {
  const trimmed = typeof name === 'string' ? name.trim() : ''
  if (
    trimmed === '' ||
    trimmed.length > MAX_SOFTWARE_NAME_LENGTH ||
    !NAV_SOFTWARE_NAME_PATTERN.test(trimmed)
  ) {
    throw invalid(
      `A nyugtakiállító szoftver neve („${name}”) legfeljebb 100 karakter lehet, és csak betűt, számot, szóközt és a . - @ + _ jeleket tartalmazhatja.`,
    )
  }
  return trimmed
}

export function assertReportId(id: string): string {
  const trimmed = typeof id === 'string' ? id.trim() : ''
  if (trimmed.length > MAX_REPORT_ID_LENGTH || !NAV_REPORT_ID_PATTERN.test(trimmed)) {
    throw invalid(
      `Az adatszolgáltatás azonosítója („${id}”) nem TÖRZSSZÁM_ÉÉÉÉHHNN_SORSZÁM formátumú.`,
    )
  }
  return trimmed
}

function assertAmount(value: number, label: string, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw invalid(
      `A(z) ${label} (${value}) a megengedett ${min} és ${max} közötti tartományon kívül esik.`,
    )
  }
  if (decimalPlaces(value) > AMOUNT_DECIMALS) {
    throw invalid(`A(z) ${label} (${value}) legfeljebb 2 tizedesjegyet tartalmazhat.`)
  }
}

function assertCount(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_COUNT) {
    throw invalid(`A(z) ${label} (${value}) 0 és ${MAX_COUNT} közötti egész szám legyen.`)
  }
}

function assertExchangeRate(currency: string, rate: number | null): void {
  if (currency === 'HUF') {
    if (rate !== null && rate !== 1) {
      throw invalid(`Forintos adatszolgáltatásnál az árfolyam null vagy 1 lehet, kapott: ${rate}.`)
    }
    return
  }
  if (
    rate === null ||
    !Number.isFinite(rate) ||
    rate < MIN_EXCHANGE_RATE ||
    rate > MAX_EXCHANGE_RATE
  ) {
    throw invalid(
      `Devizás (${currency}) adatszolgáltatásnál az 1 egységre vonatkozó árfolyam 1 és 1000 között legyen, kapott: ${rate}.`,
      'A NAV csak 1 és 1000 közötti, legfeljebb 4 tizedesjegyű árfolyamot fogad el.',
    )
  }
  if (decimalPlaces(rate) > RATE_DECIMALS) {
    throw invalid(`Az árfolyam (${rate}) legfeljebb 4 tizedesjegyet tartalmazhat.`)
  }
}

function assertVatCategories(data: NavReceiptData): number {
  if (!Array.isArray(data.vatCategories) || data.vatCategories.length === 0) {
    throw invalid('Az adatszolgáltatásban legalább egy ÁFA kategóriának szerepelnie kell.')
  }
  const seen = new Set<string>()
  let sum = 0
  for (const row of data.vatCategories) {
    const name = typeof row.vat === 'string' ? row.vat : ''
    if (name === '' || name.length > MAX_VAT_NAME_LENGTH || !NAV_VAT_CATEGORY_PATTERN.test(name)) {
      throw invalid(`Érvénytelen ÁFA kategória név: „${row.vat}”.`)
    }
    if (seen.has(name)) {
      throw invalid(`A(z) „${name}” ÁFA kategória többször szerepel (EPGP0020).`)
    }
    seen.add(name)
    assertAmount(row.saleDocument, `„${name}” értékesítési összege`, 0, MAX_ROW_AMOUNT)
    assertAmount(
      row.modifyingDocument,
      `„${name}” módosító összege`,
      -MAX_ROW_AMOUNT,
      MAX_ROW_AMOUNT,
    )
    sum += row.saleDocument + row.modifyingDocument
  }
  return sum
}

export interface ValidateNavReceiptOptions {
  readonly today?: string | undefined
}

export function validateNavReceiptData(
  data: NavReceiptData,
  options: ValidateNavReceiptOptions = {},
): void {
  assertDate(data.applicableDate, 'tárgynap (applicableDate)')
  const today = options.today ?? todayInBudapest()
  if (data.applicableDate > today) {
    throw invalid(`A tárgynap (${data.applicableDate}) nem lehet jövőbeli.`)
  }
  if (
    typeof data.serialNumber !== 'string' ||
    data.serialNumber.length > MAX_SERIAL_LENGTH ||
    !NAV_SERIAL_NUMBER_PATTERN.test(data.serialNumber)
  ) {
    throw invalid(
      `A kezdő nyugtasorszám („${data.serialNumber}”) legfeljebb 50 karakter lehet, és csak betűt, számot, szóközt (belül), valamint - _ / \\ jelet tartalmazhat.`,
    )
  }
  if (!CURRENCY_PATTERN.test(data.currency)) {
    throw invalid(`A pénznem („${data.currency}”) nem háromjegyű, nagybetűs ISO 4217 kód.`)
  }
  assertExchangeRate(data.currency, data.exchangeRate)
  const sum = assertVatCategories(data)
  if (!Number.isFinite(data.total) || decimalPlaces(data.total) > AMOUNT_DECIMALS) {
    throw invalid(`A végösszeg (${data.total}) érvénytelen vagy 2-nél több tizedesjegyű.`)
  }
  if (Math.abs(sum - data.total) > AMOUNT_TOLERANCE) {
    throw invalid(
      `A végösszeg (${data.total}) nem egyezik az ÁFA kategóriák összegével (${Math.round(sum * 100) / 100}).`,
    )
  }
  assertCount(data.numberOfSaleDocument, 'nyugták száma (numberOfSaleDocument)')
  assertCount(
    data.numberOfModifyingDocument,
    'módosító bizonylatok száma (numberOfModifyingDocument)',
  )
  if (data.numberOfSaleDocument === 0 && data.numberOfModifyingDocument === 0) {
    throw invalid('A nyugták és a módosító bizonylatok száma közül legalább az egyik nem lehet 0.')
  }
}
