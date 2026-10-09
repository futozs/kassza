import type { Kassza } from '../src/client'
export interface FuzzCart {
  readonly index: number
  readonly currency: string
  readonly exchangeRate?: number
  readonly exchangeBank?: string
  readonly items: readonly import('../src/invoices/create-types').InvoiceItemInput[]
}
export interface Totals {
  readonly net: number
  readonly gross: number
}
export declare function mulberry32(seed: number): () => number
export declare function randomCart(rng: () => number, index: number): FuzzCart
export declare function localTotals(
  cart: Pick<FuzzCart, 'currency' | 'items'>,
  money: typeof import('../src/money'),
): Totals
export declare function serverTotals(headers: Headers): Totals | undefined
export declare function compareTotals(
  local: Totals,
  server: Totals | undefined,
  tolerance?: number,
): 'match' | 'mismatch' | 'inconclusive'
export declare function throttle<T extends (...args: never[]) => Promise<Response>>(
  fetchImpl: T,
  delayMs: number,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
export declare function capturingFetch(fetchImpl: typeof globalThis.fetch): {
  readonly fetch: typeof globalThis.fetch
  readonly captured: { headers: Headers | undefined }
}
export declare const PROBE_LENGTHS: readonly number[]
export declare const PROBE_CHARACTERS: Readonly<Record<string, string>>
export declare function assertTestAccount(kassza: Kassza, orderNumber: string): Promise<void>
