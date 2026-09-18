declare module 'kassza-sandbox' {
  import type { AgentAction } from 'kassza'

  export type SimulatedFailure = 'network' | 'timeout' | 'maintenance' | 'server-error' | number

  export interface SimulatedInvoiceSummary {
    readonly number: string
    readonly typeCode: 'SZ' | 'D' | 'ES' | 'VS' | 'HS' | 'SS' | 'SL'
    readonly orderNumber?: string | undefined
    readonly reversed: boolean
    readonly deleted: boolean
  }

  export interface SimulatedReceiptSummary {
    readonly number: string
    readonly typeCode: 'NY' | 'SN'
    readonly callId?: string | undefined
    readonly reversed: boolean
    readonly sentTo: readonly string[]
  }

  export interface SimulatedAccount {
    readonly invoicePrefixes: readonly string[]
    readonly invoices: readonly SimulatedInvoiceSummary[]
    readonly receipts: readonly SimulatedReceiptSummary[]
    readonly sessionActive: boolean
  }

  export interface SimulatedCallSummary {
    readonly id: number
    readonly action: AgentAction
    readonly status: number | 'network-error' | 'timeout'
    readonly sessionReused: boolean
  }

  export const simulator: {
    failNext(action: AgentAction, failure: SimulatedFailure): void
    account(): SimulatedAccount
    readonly calls: readonly SimulatedCallSummary[]
  }

  export const sampleTaxNumbers: readonly string[]
}
