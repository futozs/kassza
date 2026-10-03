import { encodeUtf8 } from '../core/binary'
import { toBudapestDate } from '../core/dates'
import { AGENT_ERROR_CODES } from '../core/errors'

export type FakeInvoiceTypeCode = 'SZ' | 'D' | 'ES' | 'VS' | 'HS' | 'SS' | 'SL'

export interface FakeAgentSeller {
  readonly name: string
  readonly taxNumber: string
  readonly country?: string | undefined
  readonly zip: string
  readonly city: string
  readonly address: string
  readonly bankName?: string | undefined
  readonly bankAccount?: string | undefined
}

export interface FakeAgentBuyer {
  readonly name: string
  readonly identifier?: string | undefined
  readonly country?: string | undefined
  readonly zip: string
  readonly city: string
  readonly address: string
  readonly email?: string | undefined
  readonly taxNumber?: string | undefined
  readonly groupTaxNumber?: string | undefined
  readonly euTaxNumber?: string | undefined
}

export interface FakeAgentItemLedger {
  readonly revenue?: string | undefined
  readonly vat?: string | undefined
}

export interface FakeAgentItem {
  readonly name: string
  readonly identifier?: string | undefined
  readonly quantity: number
  readonly unit: string
  readonly netUnitPrice: number
  readonly vatRate: number
  readonly vatCode?: string | undefined
  readonly netAmount: number
  readonly vatAmount: number
  readonly grossAmount: number
  readonly comment?: string | undefined
  readonly ledger?: FakeAgentItemLedger | undefined
}

export interface FakeAgentTotals {
  readonly net: number
  readonly vat: number
  readonly gross: number
}

export interface FakeAgentInvoicePayment {
  readonly date: string
  readonly method: string
  readonly amount: number
  readonly comment?: string | undefined
}

export interface FakeAgentInvoice {
  readonly id: number
  readonly number: string
  readonly prefix: string
  readonly series: string
  readonly typeCode: FakeInvoiceTypeCode
  readonly createdAt: number
  readonly eInvoice: boolean
  readonly issueDate: string
  readonly fulfillmentDate: string
  readonly dueDate: string
  readonly paymentMethod: string
  readonly language: string
  readonly currency: string
  readonly exchangeBank?: string | undefined
  readonly exchangeRate?: number | undefined
  readonly comment?: string | undefined
  readonly orderNumber?: string | undefined
  readonly externalId?: string | undefined
  readonly referencedInvoiceNumber?: string | undefined
  readonly referencedProformaNumber?: string | undefined
  readonly seller: FakeAgentSeller
  readonly buyer: FakeAgentBuyer
  readonly items: readonly FakeAgentItem[]
  readonly totals: FakeAgentTotals
  readonly payments: readonly FakeAgentInvoicePayment[]
  readonly reversed: boolean
  readonly deleted: boolean
}

export interface FakeAgentReceiptPayment {
  readonly method: string
  readonly amount: number
  readonly description?: string | undefined
}

export interface FakeAgentReceipt {
  readonly id: number
  readonly number: string
  readonly prefix: string
  readonly callId?: string | undefined
  readonly type: 'NY' | 'SN'
  readonly reversed: boolean
  readonly reversedNumber?: string | undefined
  readonly issueDate: string
  readonly paymentMethod: string
  readonly currency: string
  readonly exchangeBank?: string | undefined
  readonly exchangeRate?: number | undefined
  readonly comment?: string | undefined
  readonly customerLedgerId?: string | undefined
  readonly orderNumber?: string | undefined
  readonly items: readonly FakeAgentItem[]
  readonly payments: readonly FakeAgentReceiptPayment[]
  readonly totals: FakeAgentTotals
  readonly sentTo: readonly (readonly string[])[]
}

export interface FakeAgentTaxpayerAddress {
  readonly postalCode: string
  readonly city: string
  readonly streetName?: string | undefined
  readonly publicPlaceCategory?: string | undefined
  readonly number?: string | undefined
}

export interface FakeAgentTaxpayer {
  readonly name: string
  readonly shortName?: string | undefined
  readonly vatCode?: string | undefined
  readonly countyCode?: string | undefined
  readonly incorporation?: string | undefined
  readonly valid?: boolean | undefined
  readonly address?: FakeAgentTaxpayerAddress | undefined
}

export type FakeAgentPrincipalState = 'owned' | 'unowned'

export interface FakeAgentPrincipal {
  readonly state: FakeAgentPrincipalState
  readonly joinRequests: number
}

export interface FakeAgentDelegate {
  readonly taxpayerId: string
  readonly password: string
  readonly approved: boolean
}

export interface FakeAgentConfig {
  readonly seller: FakeAgentSeller
  readonly testAccount: boolean
  readonly defaultInvoicePrefix: string
  readonly invoicePrefixes: ReadonlySet<string> | undefined
  readonly receiptPrefixes: ReadonlySet<string> | undefined
  readonly uniqueInvoiceOrderNumbers: boolean
  readonly uniqueReceiptOrderNumbers: boolean
  readonly strictAuth: boolean
  readonly agentKeys: ReadonlySet<string>
  readonly taxpayers: Readonly<Record<string, FakeAgentTaxpayer>>
}

export interface FakeAgentState {
  readonly now: () => Date
  readonly config: FakeAgentConfig
  readonly invoices: Map<string, FakeAgentInvoice>
  readonly receipts: Map<string, FakeAgentReceipt>
  readonly counters: Map<string, number>
  readonly principals: Map<string, FakeAgentPrincipal>
  readonly delegates: Map<string, FakeAgentDelegate>
  readonly users: ReadonlyMap<string, string>
}

export class FakeAgentFailure extends Error {
  override readonly name: string = 'FakeAgentFailure'
  readonly code: number | undefined

  constructor(code: number | undefined, message: string) {
    super(message)
    this.code = code
  }
}

export function agentFailure(code: number, message?: string): FakeAgentFailure {
  return new FakeAgentFailure(
    code,
    message ?? AGENT_ERROR_CODES[code]?.message ?? `Hiba (${code}).`,
  )
}

export function nextCounter(state: FakeAgentState, key: string): number {
  const next = (state.counters.get(key) ?? 0) + 1
  state.counters.set(key, next)
  return next
}

export function today(state: FakeAgentState): string {
  return toBudapestDate(state.now())
}

export function nextDocumentNumber(state: FakeAgentState, series: string): string {
  const year = today(state).slice(0, 4)
  return `${series}-${year}-${nextCounter(state, `${series}|${year}`)}`
}

export function nextDocumentId(state: FakeAgentState): number {
  return nextCounter(state, '#id')
}

export function fakePdf(label: string): Uint8Array {
  return encodeUtf8(`%PDF-1.4\n%kassza hamis Agent: ${label}\n%%EOF\n`)
}

export function taxpayerKey(value: string): string {
  return value.replace(/\D/g, '').slice(0, 8)
}
