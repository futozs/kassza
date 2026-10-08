import { emitWarning } from '../core/warnings'
import { plainResponse } from './body'
import { WebhookVerificationError } from './errors'
import type { PaymentEvent, PaymentWebhookBaseOptions } from './types'

export const WEBHOOK_DEDUPE_KEY_PREFIX = 'szamlazz:evt:'
export const DEFAULT_DEDUPE_TTL_SECONDS: number = 7 * 86_400

export type WebhookHandler = (request: Request) => Promise<Response>

function reportError(onError: ((error: unknown) => void) | undefined, error: unknown): void {
  try {
    if (onError) onError(error)
    else console.error('[kassza] A fizetési webhook feldolgozása nem sikerült.', error)
  } catch {
    return
  }
}

export async function respondToWebhook(
  options: Pick<PaymentWebhookBaseOptions, 'onError'>,
  run: () => Promise<Response>,
): Promise<Response> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof WebhookVerificationError) return plainResponse(400, error.message)
    reportError(options.onError, error)
    return plainResponse(500, 'A webhook feldolgozása nem sikerült.')
  }
}

type DedupeOptions = Pick<
  PaymentWebhookBaseOptions,
  'onPayment' | 'onWarning' | 'dedupe' | 'dedupeTtlSeconds'
>

export function webhookDedupeKey(payment: Pick<PaymentEvent, 'provider' | 'eventId'>): string {
  return `${WEBHOOK_DEDUPE_KEY_PREFIX}${payment.provider}:${payment.eventId ?? ''}`
}

function resolveDedupeTtl(value: number | undefined): number {
  if (value === undefined) return DEFAULT_DEDUPE_TTL_SECONDS
  if (!Number.isFinite(value) || value < 1) {
    throw new TypeError(`A dedupeTtlSeconds legalább 1 másodperc legyen, kapott: ${String(value)}`)
  }
  return Math.ceil(value)
}

function dedupeWarning(
  options: DedupeOptions,
  operation: 'get' | 'set',
  key: string,
  error: unknown,
): void {
  const message =
    operation === 'get'
      ? `A webhook ismétlés-szűrő tárolója nem olvasható (${key}), a kassza feldolgozza az eseményt; a createOnce így is megakadályozza a dupla bizonylatot.`
      : `A webhook ismétlés-szűrő nem tudta megjelölni a feldolgozott eseményt (${key}); egy újraküldés ismét feldolgozásra kerül, de a createOnce nem állít ki duplát.`
  emitWarning(options.onWarning, { kind: 'dedupe', message, error, operation }, 'console')
}

export async function deliverPayment(
  options: DedupeOptions,
  payment: PaymentEvent,
  prepare: (payment: PaymentEvent) => PaymentEvent | Promise<PaymentEvent> = (value) => value,
): Promise<boolean> {
  const store = options.dedupe
  if (!store || !payment.eventId) {
    await options.onPayment(await prepare(payment))
    return true
  }
  const ttlSeconds = resolveDedupeTtl(options.dedupeTtlSeconds)
  const key = webhookDedupeKey(payment)
  let seen = false
  try {
    seen = Boolean(await store.get(key))
  } catch (error) {
    dedupeWarning(options, 'get', key, error)
  }
  if (seen) return false
  await options.onPayment(await prepare(payment))
  try {
    await store.set(key, '1', ttlSeconds)
  } catch (error) {
    dedupeWarning(options, 'set', key, error)
  }
  return true
}
