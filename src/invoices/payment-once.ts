import type { DateInput } from '../core/dates'
import { SzamlazzError } from '../core/errors'
import {
  type CreateOnceOptions,
  isUncertainOutcome,
  type RecoveryState,
  recoverAfterFailure,
  resolveRecoveryDelay,
  unknownOutcomeError,
} from '../core/once'
import { guardOnce, type OnceGuard } from '../core/once-guard'
import type { GetInvoiceOptions, InvoiceDetails, InvoiceDetailsPayment } from './get'
import {
  DEFAULT_PAYMENT_METHOD,
  type RegisteredPayment,
  type RegisterPaymentInput,
} from './payment'
import type { InvoiceReference } from './reference'

export interface RegisterPaymentOnceInput {
  readonly invoiceNumber: string
  readonly key: string
  readonly amount: number
  readonly method?: string | undefined
  readonly date?: DateInput | undefined
  readonly description?: string | undefined
  readonly taxNumber?: string | undefined
}

export interface RegisteredPaymentOnce {
  readonly invoiceNumber: string
  readonly key: string
  readonly marker: string
  readonly created: boolean
  readonly payment?: RegisteredPayment | undefined
  readonly existing?: InvoiceDetailsPayment | undefined
}

export interface PaymentOnceApi {
  registerPayment(
    input: RegisterPaymentInput,
    options?: CreateOnceOptions,
  ): Promise<RegisteredPayment>
  get(
    reference: InvoiceReference,
    query?: GetInvoiceOptions,
    options?: CreateOnceOptions,
  ): Promise<InvoiceDetails>
}

const KEY_PATTERN = /^[A-Za-z0-9_.:-]{1,48}$/

function validation(message: string, hint?: string): SzamlazzError {
  return new SzamlazzError(message, { category: 'validation', hint })
}

export function paymentMarker(key: string): string {
  const trimmed = key?.trim()
  if (!trimmed || !KEY_PATTERN.test(trimmed)) {
    throw validation(
      `A registerPaymentOnce kulcsa (key) 1–48 karakter legyen, csak betű, szám és _ . : - jellel, kapott: ${String(key)}`,
      'Használj rövid, stabil azonosítót, például a banki tranzakció vagy a fizetés azonosítóját.',
    )
  }
  return `[kassza:${trimmed}]`
}

function matchingPayment(
  details: InvoiceDetails,
  marker: string,
): InvoiceDetailsPayment | undefined {
  return details.payments.find((payment) => payment.comment?.includes(marker) === true)
}

function describe(description: string | undefined, marker: string): string {
  const text = description?.trim()
  return text ? `${marker} ${text}` : marker
}

function unreadableMarker(invoiceNumber: string, marker: string): SzamlazzError {
  return new SzamlazzError(
    `A(z) ${invoiceNumber} számlán a befizetés rögzült, de a jelölő (${marker}) a számla lekérdezésében nem látszik, így a registerPaymentOnce nem tudja megakadályozni az ismételt rögzítést.`,
    {
      category: 'unexpected_response',
      details: { invoiceNumber, marker, registered: 'true' },
      hint: 'NE hívd újra ezt a rögzítést: a befizetés már rögzült. Jelezd a kassza hibajegyében; addig a befizetéseket a saját rendszeredben tartsd nyilván, és a registerPayment-et csak egyszer hívd.',
    },
  )
}

const QUERY: GetInvoiceOptions = { includePdf: false }

export async function registerPaymentOnce(
  api: PaymentOnceApi,
  input: RegisterPaymentOnceInput,
  options: CreateOnceOptions = {},
  guard?: OnceGuard,
): Promise<RegisteredPaymentOnce> {
  const invoiceNumber = input.invoiceNumber?.trim()
  if (!invoiceNumber) throw validation('Add meg a számla számát (invoiceNumber).')
  if (typeof input.amount !== 'number' || !Number.isFinite(input.amount) || input.amount === 0) {
    throw validation('A befizetés összege (amount) nullától különböző véges szám legyen.')
  }
  const marker = paymentMarker(input.key)
  const key = input.key.trim()
  const delayMs = resolveRecoveryDelay(options.recoveryDelayMs)
  const lookup = async (): Promise<InvoiceDetailsPayment | null> => {
    const details = await api.get(invoiceNumber, QUERY, options)
    return matchingPayment(details, marker) ?? null
  }
  const base = { invoiceNumber, key, marker }

  const run = async (): Promise<RegisteredPaymentOnce> => {
    const existing = await lookup()
    if (existing) return { ...base, created: false, existing }
    let payment: RegisteredPayment
    try {
      payment = await api.registerPayment(
        {
          invoiceNumber,
          taxNumber: input.taxNumber,
          additive: true,
          amount: input.amount,
          method: input.method ?? DEFAULT_PAYMENT_METHOD,
          date: input.date,
          description: describe(input.description, marker),
        },
        options,
      )
    } catch (error) {
      if (!isUncertainOutcome(error)) throw error
      const state: RecoveryState = {}
      const recovered = await recoverAfterFailure(lookup, delayMs, options.signal, state)
      if (recovered) return { ...base, created: true, existing: recovered }
      throw unknownOutcomeError(error, `${invoiceNumber} számla`, {
        subject: `${key} kulcsú befizetése`,
        lookupError: state.lookupError,
        method: 'registerPaymentOnce',
      })
    }
    const confirmed = await lookup()
    if (!confirmed) throw unreadableMarker(invoiceNumber, marker)
    return { ...base, created: true, payment, existing: confirmed }
  }

  return guardOnce(
    guard,
    `payment:${JSON.stringify([invoiceNumber, key])}`,
    options,
    run,
    (result) => ({
      ...result,
      created: false,
    }),
  )
}
