export type NavOperation =
  | 'authToken'
  | 'listReceipts'
  | 'createReceipt'
  | 'receiptDetail'
  | 'modifyReceipt'
  | 'invalidateReceipt'
  | 'createIssuingSoftware'
  | 'listIssuingSoftware'
  | 'vatCategories'
  | 'currencies'

export type NavReceiptErrorCategory =
  | 'auth'
  | 'validation'
  | 'business'
  | 'technical'
  | 'network'
  | 'timeout'
  | 'unexpected_response'
  | 'write_blocked'
  | 'conflict'
  | 'configuration'

export interface NavFieldError {
  readonly field?: string | undefined
  readonly error?: string | undefined
}

export interface NavErrorCodeInfo {
  readonly name: string
  readonly message: string
  readonly category: NavReceiptErrorCategory
  readonly hint?: string
}

export const NAV_RECEIPT_ERROR_CODES: Readonly<Record<string, NavErrorCodeInfo>> = {
  EPGP0002: {
    name: 'NEM_LETEZO_SZOFTVER',
    message: 'Nem létező nyugtakiállító szoftver megnevezés.',
    category: 'business',
    hint: 'Rögzítsd a szoftver nevét a registerSoftware hívással (/issuing-software/create), mielőtt adatot küldesz.',
  },
  EPGP0009: {
    name: 'NYUGTAADAT_MODOSITAS_NEM_ENGEDELYEZETT',
    message: 'A nyugta-adatszolgáltatás módosítása nem engedélyezett.',
    category: 'business',
    hint: 'Érvénytelenített vagy már módosított adatszolgáltatás nem módosítható; a legutóbbi RECORDED rekordot módosítsd.',
  },
  EPGP0010: {
    name: 'HIBAS_NYUGTAADAT_MENTES',
    message: 'Hiba a nyugta-adatszolgáltatás mentése során.',
    category: 'technical',
  },
  EPGP0011: {
    name: 'NEM_LETEZO_NYUGTAADAT',
    message: 'A megadott nyugta-adatszolgáltatás nem létezik.',
    category: 'business',
  },
  EPGP0013: {
    name: 'ISMERETLEN_DEVIZA_KOD',
    message: 'Ismeretlen pénznemkód.',
    category: 'validation',
    hint: 'Csak a currencies() (/currency/list) által visszaadott pénznem küldhető.',
  },
  EPGP0017: {
    name: 'HIBAS_AFA_KATEGORIA',
    message: 'Nem található a megadott ÁFA kategória.',
    category: 'validation',
    hint: 'Csak a vatCategories() (/vat-category/list) által a tárgynapra érvényes kategória küldhető.',
  },
  EPGP0020: {
    name: 'DUPLIKALT_AFA_KATEGORIA',
    message: 'Egy ÁFA kategória többször szerepel az adatszolgáltatásban.',
    category: 'validation',
  },
  EPGP0046: {
    name: 'ELTERO_TOKEN_HIBA',
    message: 'A kérés törzsszáma eltér a tokenben szereplő törzsszámtól.',
    category: 'auth',
  },
  EPGP0051: {
    name: 'LETEZO_HELYESBITO_ADATSZOLGALTATAS',
    message: 'Erre az adatszolgáltatásra már létezik helyesbítő adatszolgáltatás.',
    category: 'business',
    hint: 'Egy rekord csak egyszer módosítható; a módosítással létrejött új rekordot módosítsd tovább.',
  },
  EPGP9000: {
    name: 'INTERNAL_ERROR',
    message: 'Belső, váratlan NAV hiba.',
    category: 'technical',
  },
  EPGP9001: {
    name: 'REQUEST_VALIDACIO_SIKERTELEN',
    message: 'A kérés nem felel meg a NAV validációs szabályainak.',
    category: 'validation',
  },
}

export interface NavReceiptErrorOptions {
  readonly category: NavReceiptErrorCategory
  readonly code?: string | undefined
  readonly operation?: NavOperation | undefined
  readonly httpStatus?: number | undefined
  readonly fieldErrors?: readonly NavFieldError[] | undefined
  readonly hint?: string | undefined
  readonly rawResponse?: string | undefined
  readonly details?: Readonly<Record<string, string>> | undefined
  readonly cause?: unknown
}

const RETRYABLE_CATEGORIES: ReadonlySet<NavReceiptErrorCategory> = new Set([
  'network',
  'timeout',
  'technical',
])

export class NavReceiptError extends Error {
  override readonly name: string = 'NavReceiptError'
  readonly category: NavReceiptErrorCategory
  readonly code: string | undefined
  readonly operation: NavOperation | undefined
  readonly httpStatus: number | undefined
  readonly fieldErrors: readonly NavFieldError[]
  readonly hint: string | undefined
  readonly rawResponse: string | undefined
  readonly details: Readonly<Record<string, string>> | undefined

  constructor(message: string, options: NavReceiptErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.category = options.category
    this.code = options.code
    this.operation = options.operation
    this.httpStatus = options.httpStatus
    this.fieldErrors = options.fieldErrors ?? []
    this.hint = options.hint
    this.rawResponse = options.rawResponse
    this.details = options.details
  }

  get retryable(): boolean {
    return RETRYABLE_CATEGORIES.has(this.category)
  }
}

export function isNavReceiptError(error: unknown): error is NavReceiptError {
  return error instanceof NavReceiptError
}
