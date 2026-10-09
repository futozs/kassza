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
import type { CreateReceiptInput, GetReceiptInput, Receipt } from './types'

export interface ReceiptOnceApi {
  create(input: CreateReceiptInput, options?: CreateOnceOptions): Promise<Receipt>
  find(input: GetReceiptInput | string, options?: CreateOnceOptions): Promise<Receipt | null>
}

export interface ReceiptOnceResult {
  readonly receipt: Receipt
  readonly created: boolean
}

function requireOrderNumber(input: CreateReceiptInput): string {
  const orderNumber = input.orderNumber?.trim()
  if (!orderNumber) {
    throw new SzamlazzError(
      'A createOnce-hoz add meg a rendelésszámot (orderNumber), ez azonosítja a nyugtát.',
      { category: 'validation' },
    )
  }
  return orderNumber
}

export async function createReceiptOnce(
  api: ReceiptOnceApi,
  input: CreateReceiptInput,
  options: CreateOnceOptions = {},
  guard?: OnceGuard,
): Promise<ReceiptOnceResult> {
  const orderNumber = requireOrderNumber(input)
  const callId = input.callId?.trim() || orderNumber
  const delayMs = resolveRecoveryDelay(options.recoveryDelayMs)
  const lookup = (): Promise<Receipt | null> =>
    api.find({ orderNumber, downloadPdf: input.downloadPdf }, options)

  const run = async (recheck: boolean): Promise<ReceiptOnceResult> => {
    if (recheck || options.lookupFirst !== false) {
      const existing = await lookup()
      if (existing) return { receipt: existing, created: false }
    }

    try {
      const receipt = await api.create({ ...input, orderNumber, callId }, options)
      return { receipt, created: true }
    } catch (error) {
      if (!isUncertainOutcome(error)) throw error
      const state: RecoveryState = {}
      const recovered = await recoverAfterFailure(lookup, delayMs, options.signal, state)
      if (recovered) return { receipt: recovered, created: error.category !== 'duplicate' }
      if (error.category === 'duplicate' && !state.lookupError) throw error
      throw unknownOutcomeError(error, `${orderNumber} rendelés`, {
        lookupError: state.lookupError,
      })
    }
  }

  return guardOnce(guard, `receipt:order:${orderNumber}`, options, run, (result) => ({
    ...result,
    created: false,
  }))
}
