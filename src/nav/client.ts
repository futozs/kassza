import type { RequestOptions } from '../core/context'
import { digestHex } from '../core/crypto'
import { todayInBudapest } from '../core/dates'
import { type NavOperation, NavReceiptError } from './errors'
import {
  parseAuthTokenResponse,
  parseCurrencyResponse,
  parseIdResponse,
  parseIssuingSoftwareListResponse,
  parseNavResponse,
  parseReceiptDetailResponse,
  parseReceiptListResponse,
  parseVatCategoryResponse,
} from './parse'
import { sha3_512Hex } from './sha3'
import type {
  NavAuthToken,
  NavCurrencyInfo,
  NavReceiptData,
  NavReportDetail,
  NavReportListItem,
  NavReportPage,
  NavReportQuery,
  NavVatCategoryInfo,
} from './types'
import {
  assertReportId,
  assertSoftwareName,
  navDate,
  navTaxpayerId,
  validateNavReceiptData,
} from './validate'
import {
  buildAuthTokenXml,
  buildContextOnlyXml,
  buildCreateIssuingSoftwareXml,
  buildCreateReceiptXml,
  buildIssuingSoftwareListXml,
  buildModifyReceiptXml,
  buildReceiptIdXml,
  buildReceiptListXml,
  NAV_DEFAULT_PAGE_SIZE,
  type NavRequestContext,
} from './xml'

export const NAV_RECEIPT_URLS = {
  test: 'https://bv-receipt-if.enyugta.nav.gov.hu/v1',
  production: 'https://receipt-if.enyugta.nav.gov.hu/v1',
} as const

export type NavEnvironment = keyof typeof NAV_RECEIPT_URLS

export const NAV_DEFAULT_TIMEOUT_MS = 15_000
export const NAV_MAX_LIST_PAGES = 1000

const OPERATION_PATHS: Readonly<Record<NavOperation, string>> = {
  authToken: '/auth/token',
  listReceipts: '/receipt/list',
  createReceipt: '/receipt/create',
  receiptDetail: '/receipt/detail',
  modifyReceipt: '/receipt/modify',
  invalidateReceipt: '/receipt/invalidate',
  createIssuingSoftware: '/issuing-software/create',
  listIssuingSoftware: '/issuing-software/list',
  vatCategories: '/vat-category/list',
  currencies: '/currency/list',
}

const TOKEN_REFRESH_MARGIN_MS = 30_000
const LEGACY_REQUEST_ID_LENGTH = 30
const REQUEST_ID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const UNBIASED_BYTE_LIMIT = 248
const MAX_LOGIN_LENGTH = 50
const PASSWORD_HASH_PATTERN = /^[0-9A-Fa-f]{128}$/
const UNAUTHORIZED = 401
const AMOUNT_TOLERANCE = 0.005
const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?Z$/

export async function navPasswordHash(password: string): Promise<string> {
  return (await digestHex('SHA-512', password)).toUpperCase()
}

export function navSignatureTimestamp(timestamp: string): string {
  const match = TIMESTAMP_PATTERN.exec(timestamp)
  if (!match) {
    throw new NavReceiptError(`Érvénytelen UTC időbélyeg az aláíráshoz: ${timestamp}`, {
      category: 'validation',
    })
  }
  return match.slice(1, 7).join('')
}

export function navRequestSignature(
  requestId: string,
  timestamp: string,
  signatureKey: string,
): string {
  return sha3_512Hex(`${requestId}${navSignatureTimestamp(timestamp)}${signatureKey}`).toUpperCase()
}

export function navLegacyRequestId(): string {
  let id = ''
  while (id.length < LEGACY_REQUEST_ID_LENGTH) {
    for (const byte of crypto.getRandomValues(new Uint8Array(LEGACY_REQUEST_ID_LENGTH))) {
      if (byte >= UNBIASED_BYTE_LIMIT || id.length >= LEGACY_REQUEST_ID_LENGTH) continue
      id += REQUEST_ID_ALPHABET[byte % REQUEST_ID_ALPHABET.length]
    }
  }
  return id
}

export interface NavReceiptClientOptions {
  readonly environment: NavEnvironment
  readonly login: string
  readonly password?: string | undefined
  readonly passwordHash?: string | undefined
  readonly signatureKey: string
  readonly taxNumber: string
  readonly predecessorTaxNumber?: string | undefined
  readonly softwareName?: string | undefined
  readonly allowWrite?: boolean | undefined
  readonly baseUrl?: string | undefined
  readonly fetch?: typeof globalThis.fetch | undefined
  readonly timeoutMs?: number | undefined
  readonly now?: (() => Date) | undefined
}

export interface NavSubmitOptions extends RequestOptions {
  readonly softwareName?: string | undefined
}

export interface NavSubmitResult {
  readonly id: string
  readonly created: boolean
  readonly softwareName: string
}

export type NavListAllQuery = Omit<NavReportQuery, 'page' | 'pageSize'>

export interface NavReceiptClient {
  readonly environment: NavEnvironment
  readonly taxPayerId: string
  readonly canWrite: boolean
  authenticate(options?: RequestOptions): Promise<NavAuthToken>
  listReports(query: NavReportQuery, options?: RequestOptions): Promise<NavReportPage>
  listAllReports(query: NavListAllQuery, options?: RequestOptions): Promise<NavReportListItem[]>
  getReport(id: string, options?: RequestOptions): Promise<NavReportDetail>
  submitReport(data: NavReceiptData, options?: NavSubmitOptions): Promise<NavSubmitResult>
  modifyReport(
    id: string,
    data: NavReceiptData,
    options?: NavSubmitOptions,
  ): Promise<{ readonly id: string }>
  invalidateReport(id: string, options?: RequestOptions): Promise<void>
  registerSoftware(name?: string, options?: RequestOptions): Promise<{ readonly created: boolean }>
  listSoftware(options?: RequestOptions): Promise<string[]>
  vatCategories(options?: RequestOptions): Promise<NavVatCategoryInfo[]>
  currencies(options?: RequestOptions): Promise<NavCurrencyInfo[]>
}

function configuration(message: string, hint?: string): NavReceiptError {
  return new NavReceiptError(message, { category: 'configuration', hint })
}

function required(value: string | undefined, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw configuration(`Hiányzik a NAV ${label}.`)
  }
  return value
}

interface ResolvedOptions {
  readonly baseUrl: string
  readonly login: string
  readonly password: string | undefined
  readonly passwordHash: string | undefined
  readonly signatureKey: string
  readonly taxPayerId: string
  readonly predecessorTaxPayerId: string | undefined
  readonly softwareName: string | undefined
  readonly timeoutMs: number
}

function resolveOptions(options: NavReceiptClientOptions): ResolvedOptions {
  if (options.environment !== 'test' && options.environment !== 'production') {
    throw configuration(
      'Add meg a NAV környezetet: environment: "test" vagy "production".',
      'A teszt és az éles NAV rendszer külön technikai felhasználót használ; a kassza nem választ helyetted.',
    )
  }
  const login = required(options.login, 'technikai felhasználó login neve').trim()
  if (login.length > MAX_LOGIN_LENGTH) {
    throw configuration('A NAV technikai felhasználó login neve legfeljebb 50 karakter lehet.')
  }
  const passwordHash = options.passwordHash?.trim()
  if (passwordHash !== undefined && !PASSWORD_HASH_PATTERN.test(passwordHash)) {
    throw configuration('A passwordHash 128 hexadecimális karakterből álló SHA-512 hash legyen.')
  }
  if (passwordHash === undefined && !options.password) {
    throw configuration(
      'Add meg a technikai felhasználó jelszavát (password) vagy annak SHA-512 hash-ét (passwordHash).',
    )
  }
  const timeoutMs = options.timeoutMs ?? NAV_DEFAULT_TIMEOUT_MS
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw configuration(`A timeoutMs pozitív szám legyen, kapott: ${timeoutMs}`)
  }
  return {
    baseUrl: (options.baseUrl ?? NAV_RECEIPT_URLS[options.environment]).replace(/\/+$/, ''),
    login,
    password: options.password,
    passwordHash: passwordHash?.toUpperCase(),
    signatureKey: required(options.signatureKey, 'aláírókulcs (signatureKey)'),
    taxPayerId: navTaxpayerId(required(options.taxNumber, 'adószám (taxNumber)')),
    predecessorTaxPayerId:
      options.predecessorTaxNumber === undefined
        ? undefined
        : navTaxpayerId(options.predecessorTaxNumber),
    softwareName:
      options.softwareName === undefined ? undefined : assertSoftwareName(options.softwareName),
    timeoutMs,
  }
}

function sameReport(existing: NavReportListItem, data: NavReceiptData): boolean {
  return (
    Math.abs(existing.totalAmount - data.total) <= AMOUNT_TOLERANCE &&
    existing.numberOfSaleDocument === data.numberOfSaleDocument &&
    existing.numberOfModifyingDocument === data.numberOfModifyingDocument
  )
}

export function createNavReceiptClient(options: NavReceiptClientOptions): NavReceiptClient {
  const resolved = resolveOptions(options)
  const fetchImpl = options.fetch ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw configuration('Nem található fetch implementáció. Add meg a fetch opciót.')
  }
  const now = options.now ?? (() => new Date())
  const allowWrite = options.allowWrite === true
  let cachedToken: { readonly value: NavAuthToken; readonly expiresAt: number } | undefined
  let pendingToken: Promise<NavAuthToken> | undefined
  let passwordHashPromise: Promise<string> | undefined

  const passwordHash = (): Promise<string> => {
    if (resolved.passwordHash !== undefined) return Promise.resolve(resolved.passwordHash)
    passwordHashPromise ??= navPasswordHash(resolved.password ?? '')
    return passwordHashPromise
  }

  async function send(
    operation: NavOperation,
    xml: string,
    signal: AbortSignal | undefined,
    token: string | undefined,
  ): Promise<{ readonly status: number; readonly body: string }> {
    signal?.throwIfAborted()
    const timeout = AbortSignal.timeout(resolved.timeoutMs)
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
    const headers: Record<string, string> = {
      'content-type': 'application/xml; charset=UTF-8',
      accept: 'application/xml',
    }
    if (token !== undefined) headers.authorization = `Bearer ${token}`
    try {
      const response = await fetchImpl(`${resolved.baseUrl}${OPERATION_PATHS[operation]}`, {
        method: 'POST',
        headers,
        body: xml,
        signal: combined,
      })
      return { status: response.status, body: await response.text() }
    } catch (error) {
      if (signal?.aborted) throw signal.reason
      if (timeout.aborted) {
        throw new NavReceiptError(
          `A NAV nem válaszolt ${resolved.timeoutMs} ms alatt (${operation}).`,
          { category: 'timeout', operation, cause: error },
        )
      }
      throw new NavReceiptError(`Hálózati hiba a NAV elérésekor (${operation}).`, {
        category: 'network',
        operation,
        cause: error,
      })
    }
  }

  async function requestToken(signal: AbortSignal | undefined): Promise<NavAuthToken> {
    const timestamp = now().toISOString()
    const requestId = navLegacyRequestId()
    const xml = buildAuthTokenXml(
      { requestId, timestamp },
      {
        login: resolved.login,
        passwordHash: await passwordHash(),
        taxPayerId: resolved.taxPayerId,
        predecessorTaxPayerId: resolved.predecessorTaxPayerId,
        requestSignature: navRequestSignature(requestId, timestamp, resolved.signatureKey),
      },
    )
    const response = await send('authToken', xml, signal, undefined)
    const token = parseAuthTokenResponse(
      parseNavResponse('authToken', 'AuthTokenResponse', response.status, response.body),
    )
    const validUntil = Date.parse(token.validTo)
    cachedToken = {
      value: token,
      expiresAt: Number.isFinite(validUntil) ? validUntil - TOKEN_REFRESH_MARGIN_MS : 0,
    }
    return token
  }

  async function authenticate(requestOptions: RequestOptions = {}): Promise<NavAuthToken> {
    pendingToken ??= requestToken(requestOptions.signal).finally(() => {
      pendingToken = undefined
    })
    return pendingToken
  }

  async function currentToken(signal: AbortSignal | undefined): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > now().getTime()) return cachedToken.value.token
    return (await authenticate({ signal })).token
  }

  function context(): NavRequestContext {
    return { requestId: crypto.randomUUID(), timestamp: now().toISOString() }
  }

  async function call<T>(
    operation: NavOperation,
    expectedRoot: string,
    build: (requestContext: NavRequestContext) => string,
    parse: (root: ReturnType<typeof parseNavResponse>) => T,
    requestOptions: RequestOptions,
  ): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      const token = await currentToken(requestOptions.signal)
      const response = await send(operation, build(context()), requestOptions.signal, token)
      if (response.status === UNAUTHORIZED && attempt === 1) {
        cachedToken = undefined
        continue
      }
      return parse(parseNavResponse(operation, expectedRoot, response.status, response.body))
    }
  }

  function assertWritable(operation: NavOperation): void {
    if (allowWrite) return
    throw new NavReceiptError('A NAV kliens csak olvasásra van beállítva, ezért nem küld adatot.', {
      category: 'write_blocked',
      operation,
      hint: 'Ha a Számlázz.hu már beküldi a nyugtáidat, ne küldd be te is, mert az dupla adatszolgáltatás. Ha biztosan neked kell beküldeni (például papír nyugtatömb), add meg az allowWrite: true opciót.',
    })
  }

  function softwareFor(name: string | undefined): string {
    const software = name === undefined ? resolved.softwareName : assertSoftwareName(name)
    if (software === undefined) {
      throw configuration(
        'Add meg a nyugtakiállító szoftver nevét (softwareName), ahogy a NAV-nál rögzítve van.',
      )
    }
    return software
  }

  function query(input: NavReportQuery): NavReportQuery {
    const from = navDate(input.from, 'lekérdezés kezdete (from)')
    const to = navDate(input.to, 'lekérdezés vége (to)')
    if (to < from) {
      throw new NavReceiptError(
        `A lekérdezés vége (${to}) nem lehet korábbi a kezdeténél (${from}).`,
        {
          category: 'validation',
          operation: 'listReceipts',
        },
      )
    }
    const pageSize = input.pageSize ?? NAV_DEFAULT_PAGE_SIZE
    const page = input.page ?? 1
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > NAV_DEFAULT_PAGE_SIZE) {
      throw new NavReceiptError(
        `A pageSize 1 és 100 közötti egész szám legyen, kapott: ${pageSize}`,
        {
          category: 'validation',
          operation: 'listReceipts',
        },
      )
    }
    if (!Number.isInteger(page) || page < 1) {
      throw new NavReceiptError(`A page legalább 1 egész szám legyen, kapott: ${page}`, {
        category: 'validation',
        operation: 'listReceipts',
      })
    }
    return { ...input, from, to, page, pageSize }
  }

  async function listReports(
    input: NavReportQuery,
    requestOptions: RequestOptions = {},
  ): Promise<NavReportPage> {
    const checked = query(input)
    return call(
      'listReceipts',
      'ReceiptListResponse',
      (requestContext) => buildReceiptListXml(requestContext, resolved.taxPayerId, checked),
      parseReceiptListResponse,
      requestOptions,
    )
  }

  async function listAllReports(
    input: NavListAllQuery,
    requestOptions: RequestOptions = {},
  ): Promise<NavReportListItem[]> {
    const items: NavReportListItem[] = []
    for (let page = 1; page <= NAV_MAX_LIST_PAGES; page++) {
      const result = await listReports(
        { ...input, page, pageSize: NAV_DEFAULT_PAGE_SIZE },
        requestOptions,
      )
      items.push(...result.items)
      if (result.items.length === 0 || items.length >= result.totalRowCount) return items
    }
    throw new NavReceiptError(
      `A NAV listázás ${NAV_MAX_LIST_PAGES} oldal után sem ért véget; szűkítsd az időszakot.`,
      { category: 'unexpected_response', operation: 'listReceipts' },
    )
  }

  async function submitReport(
    data: NavReceiptData,
    submitOptions: NavSubmitOptions = {},
  ): Promise<NavSubmitResult> {
    assertWritable('createReceipt')
    const software = softwareFor(submitOptions.softwareName)
    validateNavReceiptData(data, { today: todayInBudapest(now()) })
    const existing = (
      await listAllReports(
        { from: data.applicableDate, to: data.applicableDate },
        { signal: submitOptions.signal },
      )
    ).find((item) => item.status === 'RECORDED' && item.serialNumber === data.serialNumber)
    if (existing) {
      if (sameReport(existing, data)) {
        return { id: existing.id, created: false, softwareName: existing.softwareName }
      }
      throw new NavReceiptError(
        `Erre a tárgynapra (${data.applicableDate}) és kezdő sorszámra (${data.serialNumber}) már van rögzített adatszolgáltatás (${existing.id}) eltérő adatokkal.`,
        {
          category: 'conflict',
          operation: 'createReceipt',
          details: { existingId: existing.id, existingSoftware: existing.softwareName },
          hint: 'Ha a korábbi adat hibás, javítsd a modifyReport(id, …) hívással; ha más szoftver küldte be (például a Számlázz.hu), ne küldd be újra.',
        },
      )
    }
    const id = await call(
      'createReceipt',
      'CreateReceiptResponse',
      (requestContext) =>
        buildCreateReceiptXml(requestContext, resolved.taxPayerId, software, data),
      (root) => parseIdResponse(root, 'createReceipt'),
      { signal: submitOptions.signal },
    )
    return { id, created: true, softwareName: software }
  }

  async function modifyReport(
    id: string,
    data: NavReceiptData,
    submitOptions: NavSubmitOptions = {},
  ): Promise<{ readonly id: string }> {
    assertWritable('modifyReceipt')
    const reportId = assertReportId(id)
    const software = softwareFor(submitOptions.softwareName)
    validateNavReceiptData(data, { today: todayInBudapest(now()) })
    const newId = await call(
      'modifyReceipt',
      'ModifyReceiptResponse',
      (requestContext) =>
        buildModifyReceiptXml(requestContext, reportId, resolved.taxPayerId, software, data),
      (root) => parseIdResponse(root, 'modifyReceipt'),
      { signal: submitOptions.signal },
    )
    return { id: newId }
  }

  async function invalidateReport(id: string, requestOptions: RequestOptions = {}): Promise<void> {
    assertWritable('invalidateReceipt')
    const reportId = assertReportId(id)
    await call(
      'invalidateReceipt',
      'InvalidateReceiptResponse',
      (requestContext) =>
        buildReceiptIdXml(
          'InvalidateReceiptRequest',
          requestContext,
          reportId,
          resolved.taxPayerId,
        ),
      () => undefined,
      requestOptions,
    )
  }

  function listSoftware(requestOptions: RequestOptions = {}): Promise<string[]> {
    return call(
      'listIssuingSoftware',
      'IssuingSoftwareListResponse',
      (requestContext) => buildIssuingSoftwareListXml(requestContext, resolved.taxPayerId),
      parseIssuingSoftwareListResponse,
      requestOptions,
    )
  }

  async function registerSoftware(
    name?: string,
    requestOptions: RequestOptions = {},
  ): Promise<{ readonly created: boolean }> {
    assertWritable('createIssuingSoftware')
    const software = softwareFor(name)
    const registered = await listSoftware(requestOptions)
    if (registered.includes(software)) return { created: false }
    await call(
      'createIssuingSoftware',
      'CreateIssuingSoftwareResponse',
      (requestContext) =>
        buildCreateIssuingSoftwareXml(requestContext, resolved.taxPayerId, software),
      () => undefined,
      requestOptions,
    )
    return { created: true }
  }

  return {
    environment: options.environment,
    taxPayerId: resolved.taxPayerId,
    canWrite: allowWrite,
    authenticate,
    listReports,
    listAllReports,
    getReport: async (id, requestOptions = {}) => {
      const reportId = assertReportId(id)
      return call(
        'receiptDetail',
        'ReceiptDetailResponse',
        (requestContext) =>
          buildReceiptIdXml('ReceiptDetailRequest', requestContext, reportId, resolved.taxPayerId),
        parseReceiptDetailResponse,
        requestOptions,
      )
    },
    submitReport,
    modifyReport,
    invalidateReport,
    registerSoftware,
    listSoftware,
    vatCategories: (requestOptions = {}) =>
      call(
        'vatCategories',
        'VatCategoryResponse',
        (requestContext) => buildContextOnlyXml('VatCategoryRequest', requestContext),
        parseVatCategoryResponse,
        requestOptions,
      ),
    currencies: (requestOptions = {}) =>
      call(
        'currencies',
        'CurrencyResponse',
        (requestContext) => buildContextOnlyXml('CurrencyRequest', requestContext),
        parseCurrencyResponse,
        requestOptions,
      ),
  }
}
