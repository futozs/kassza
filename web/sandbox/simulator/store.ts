import { todayInBudapest } from 'kassza'
import type { SimInvoice, SimReceipt, SimulatorOptions } from './types'

export const SELLER = {
  name: 'Minta Webáruház Kft.',
  taxNumber: '23456787-2-13',
  country: 'Magyarország',
  zip: '1111',
  city: 'Budapest',
  address: 'Minta utca 12.',
  bank: 'Minta Bank Zrt.',
  bankAccount: '11773016-11111018',
} as const

export const DEFAULT_INVOICE_PREFIXES = ['KASSZA', 'WEB', 'PROJ', 'TESZT', 'SZLA'] as const

export class SimulatorStore {
  readonly invoices: SimInvoice[] = []
  readonly receipts: SimReceipt[] = []
  readonly invoicePrefixes: Set<string>
  readonly defaultInvoicePrefix: string
  readonly forbidDuplicateOrderNumbers: boolean
  readonly now: () => Date
  session: string | undefined
  private readonly sequences = new Map<string, number>()
  private nextId = 1000

  constructor(options: SimulatorOptions) {
    this.invoicePrefixes = new Set(options.invoicePrefixes ?? DEFAULT_INVOICE_PREFIXES)
    this.defaultInvoicePrefix = options.defaultInvoicePrefix ?? 'KASSZA'
    this.forbidDuplicateOrderNumbers = options.forbidDuplicateOrderNumbers ?? false
    this.now = options.now ?? (() => new Date())
  }

  today(): string {
    return todayInBudapest(this.now())
  }

  id(): number {
    this.nextId += 1
    return this.nextId
  }

  sequence(key: string): number {
    const next = (this.sequences.get(key) ?? 0) + 1
    this.sequences.set(key, next)
    return next
  }

  findInvoice(reference: {
    number?: string | undefined
    orderNumber?: string | undefined
    externalId?: string | undefined
  }): SimInvoice | undefined {
    const active = this.invoices.filter((invoice) => !invoice.deleted)
    if (reference.number) return active.find((invoice) => invoice.number === reference.number)
    if (reference.orderNumber) {
      return active.findLast((invoice) => invoice.orderNumber === reference.orderNumber)
    }
    if (reference.externalId) {
      return active.findLast((invoice) => invoice.externalId === reference.externalId)
    }
    return undefined
  }

  findReceipt(reference: {
    number?: string | undefined
    orderNumber?: string | undefined
  }): SimReceipt | undefined {
    if (reference.number)
      return this.receipts.find((receipt) => receipt.number === reference.number)
    if (reference.orderNumber) {
      return this.receipts.findLast((receipt) => receipt.orderNumber === reference.orderNumber)
    }
    return undefined
  }
}
