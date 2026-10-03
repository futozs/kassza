import {
  childText,
  findChild,
  findChildren,
  parseXml,
  type XmlElement,
  XmlParseError,
} from '../core/xml/parse'
import {
  NAV_RECEIPT_ERROR_CODES,
  type NavFieldError,
  type NavOperation,
  NavReceiptError,
  type NavReceiptErrorCategory,
} from './errors'
import type {
  NavAuthToken,
  NavCurrencyInfo,
  NavReportDetail,
  NavReportListItem,
  NavReportPage,
  NavReportStatus,
  NavVatCategoryAmounts,
  NavVatCategoryInfo,
} from './types'

const RAW_PREVIEW_LENGTH = 2000
const UNAUTHORIZED = 401
const FORBIDDEN = 403
const SERVER_ERROR = 500

const ERROR_ROOT_CATEGORIES: ReadonlyMap<string, NavReceiptErrorCategory> = new Map([
  ['TechnicalErrorResponse', 'technical'],
  ['BusinessErrorResponse', 'business'],
  ['InvalidRequestResponse', 'validation'],
])

function preview(body: string): string | undefined {
  const trimmed = body.trim()
  return trimmed === '' ? undefined : trimmed.slice(0, RAW_PREVIEW_LENGTH)
}

function statusCategory(status: number): NavReceiptErrorCategory {
  if (status === UNAUTHORIZED || status === FORBIDDEN) return 'auth'
  if (status >= SERVER_ERROR) return 'technical'
  return 'unexpected_response'
}

function unexpected(
  operation: NavOperation,
  status: number,
  body: string,
  detail: string,
  cause?: unknown,
): NavReceiptError {
  const category = status >= 200 && status < 300 ? 'unexpected_response' : statusCategory(status)
  return new NavReceiptError(`Váratlan NAV válasz (${operation}, HTTP ${status}): ${detail}`, {
    category,
    operation,
    httpStatus: status,
    rawResponse: preview(body),
    cause,
  })
}

function fieldErrors(root: XmlElement): NavFieldError[] {
  return findChildren(root, 'error').map((entry) => ({
    field: childText(entry, 'field'),
    error: childText(entry, 'error'),
  }))
}

function errorFromRoot(
  operation: NavOperation,
  status: number,
  body: string,
  root: XmlElement,
): NavReceiptError {
  const code = childText(root, 'errorCode')
  const info = code === undefined ? undefined : NAV_RECEIPT_ERROR_CODES[code]
  const message = childText(root, 'message') ?? info?.message ?? 'ismeretlen hiba'
  const fields = fieldErrors(root)
  const details = fields
    .map((entry) => [entry.field, entry.error].filter(Boolean).join(': '))
    .filter(Boolean)
  const byStatus = status === UNAUTHORIZED || status === FORBIDDEN ? 'auth' : undefined
  const category =
    byStatus ?? info?.category ?? ERROR_ROOT_CATEGORIES.get(root.name) ?? statusCategory(status)
  const suffix = details.length > 0 ? ` (${details.join('; ')})` : ''
  return new NavReceiptError(`NAV hiba${code ? ` [${code}]` : ''}: ${message}${suffix}`, {
    category,
    code,
    operation,
    httpStatus: status,
    fieldErrors: fields,
    hint: info?.hint,
    rawResponse: preview(body),
  })
}

export function parseNavResponse(
  operation: NavOperation,
  expectedRoot: string,
  status: number,
  body: string,
): XmlElement {
  if (body.trim() === '') {
    throw unexpected(operation, status, body, 'üres válasz.')
  }
  let root: XmlElement
  try {
    root = parseXml(body)
  } catch (error) {
    if (!(error instanceof XmlParseError)) throw error
    throw unexpected(operation, status, body, 'a válasz nem XML.', error)
  }
  const isErrorRoot = ERROR_ROOT_CATEGORIES.has(root.name)
  if (isErrorRoot || childText(root, 'resultCode') === 'ERROR') {
    throw errorFromRoot(operation, status, body, root)
  }
  if (status < 200 || status >= 300) {
    throw unexpected(operation, status, body, `a válasz gyökéreleme ${root.name}.`)
  }
  if (root.name !== expectedRoot) {
    throw unexpected(operation, status, body, `${expectedRoot} helyett ${root.name} érkezett.`)
  }
  return root
}

function requiredText(
  element: XmlElement | undefined,
  name: string,
  operation: NavOperation,
): string {
  const value = childText(element, name)
  if (value === undefined) {
    throw new NavReceiptError(`A NAV válaszából (${operation}) hiányzik a(z) ${name} mező.`, {
      category: 'unexpected_response',
      operation,
    })
  }
  return value
}

function requiredNumber(
  element: XmlElement | undefined,
  name: string,
  operation: NavOperation,
): number {
  const value = Number(requiredText(element, name, operation))
  if (!Number.isFinite(value)) {
    throw new NavReceiptError(`A NAV válaszában (${operation}) a(z) ${name} nem szám.`, {
      category: 'unexpected_response',
      operation,
    })
  }
  return value
}

function status(element: XmlElement | undefined, operation: NavOperation): NavReportStatus {
  const value = requiredText(element, 'status', operation)
  if (value !== 'RECORDED' && value !== 'INVALIDATED') {
    throw new NavReceiptError(`Ismeretlen adatszolgáltatás-státusz: ${value}.`, {
      category: 'unexpected_response',
      operation,
    })
  }
  return value
}

function softwareName(element: XmlElement | undefined, operation: NavOperation): string {
  return requiredText(findChild(element, 'issuingSoftware'), 'name', operation)
}

export function parseAuthTokenResponse(root: XmlElement): NavAuthToken {
  const token = childText(root, 'token')
  const validTo = childText(root, 'validTo')
  if (!token || !validTo) {
    throw new NavReceiptError('A NAV nem adott hozzáférési tokent.', {
      category: 'auth',
      operation: 'authToken',
    })
  }
  return { token, validTo }
}

export function parseIdResponse(root: XmlElement, operation: NavOperation): string {
  return requiredText(root, 'id', operation)
}

function listItem(element: XmlElement): NavReportListItem {
  const operation: NavOperation = 'listReceipts'
  return {
    id: requiredText(element, 'id', operation),
    applicableDate: requiredText(element, 'applicableDate', operation),
    serialNumber: requiredText(element, 'serialNumber', operation),
    numberOfSaleDocument: requiredNumber(element, 'numberOfSaleDocument', operation),
    numberOfModifyingDocument: requiredNumber(element, 'numberOfModifyingDocument', operation),
    totalAmount: requiredNumber(element, 'totalAmount', operation),
    totalAmountInForint: requiredNumber(element, 'totalAmountInForint', operation),
    status: status(element, operation),
    softwareName: softwareName(element, operation),
  }
}

export function parseReceiptListResponse(root: XmlElement): NavReportPage {
  const operation: NavOperation = 'listReceipts'
  const paging = findChild(root, 'paging')
  return {
    items: findChildren(findChild(root, 'result'), 'receipt').map(listItem),
    page: requiredNumber(paging, 'page', operation),
    pageSize: requiredNumber(paging, 'pageSize', operation),
    totalRowCount: requiredNumber(paging, 'totalRowCount', operation),
  }
}

function vatRows(root: XmlElement, operation: NavOperation): NavVatCategoryAmounts[] {
  return findChildren(findChild(root, 'vatCategoryItems'), 'vatCategory').map((row) => ({
    vat: requiredText(row, 'vat', operation),
    saleDocument: requiredNumber(row, 'saleDocument', operation),
    modifyingDocument: requiredNumber(row, 'modifyingDocument', operation),
  }))
}

export function parseReceiptDetailResponse(root: XmlElement): NavReportDetail {
  const operation: NavOperation = 'receiptDetail'
  const rate = childText(root, 'exchangeRate')
  return {
    id: requiredText(root, 'id', operation),
    softwareName: softwareName(root, operation),
    applicableDate: requiredText(root, 'applicableDate', operation),
    status: status(root, operation),
    serialNumber: requiredText(root, 'serialNumber', operation),
    currency: requiredText(root, 'currency', operation),
    exchangeRate: rate === undefined ? null : Number(rate),
    vatCategories: vatRows(root, operation),
    total: requiredNumber(root, 'total', operation),
    totalAmountInForint: requiredNumber(root, 'totalAmountInForint', operation),
    numberOfSaleDocument: requiredNumber(root, 'numberOfSaleDocument', operation),
    numberOfModifyingDocument: requiredNumber(root, 'numberOfModifyingDocument', operation),
  }
}

export function parseIssuingSoftwareListResponse(root: XmlElement): string[] {
  return findChildren(findChild(root, 'issuingSoftwareList'), 'software').map((software) =>
    requiredText(software, 'name', 'listIssuingSoftware'),
  )
}

export function parseVatCategoryResponse(root: XmlElement): NavVatCategoryInfo[] {
  return findChildren(findChild(root, 'categories'), 'category').map((category) => ({
    name: requiredText(category, 'name', 'vatCategories'),
    validFrom: requiredText(category, 'validFrom', 'vatCategories'),
    validTo: childText(category, 'validTo'),
  }))
}

export function parseCurrencyResponse(root: XmlElement): NavCurrencyInfo[] {
  return findChildren(findChild(root, 'currencies'), 'currency').map((currency) => ({
    code: requiredText(currency, 'code', 'currencies'),
    name: requiredText(currency, 'name', 'currencies'),
  }))
}
