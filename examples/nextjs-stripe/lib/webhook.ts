import { isSzamlazzError, type Kassza, type KeyValueStore } from 'kassza'
import { stripeWebhook } from 'kassza/payments/stripe'

export interface StripeHandlerOptions {
  readonly secret: string
  readonly apiKey?: string | undefined
  readonly dedupe?: KeyValueStore | undefined
  readonly now?: (() => number) | undefined
  readonly onManualReview?:
    | ((paymentId: string, reason: string) => void | Promise<void>)
    | undefined
}

export function createStripeHandler(
  kassza: Kassza,
  options: StripeHandlerOptions,
): (request: Request) => Promise<Response> {
  return stripeWebhook({
    secret: options.secret,
    apiKey: options.apiKey,
    dedupe: options.dedupe,
    now: options.now,
    onPayment: async (payment) => {
      try {
        const result = await kassza.issueForPayment(payment, { vat: 27 })
        if (result.kind === 'refund-proposal') {
          await options.onManualReview?.(payment.id, result.reason)
        }
      } catch (error) {
        if (!isSzamlazzError(error) || error.retryable || error.category === 'in_progress') {
          throw error
        }
        const reason = `${error.category}: ${error.message}`
        await options.onManualReview?.(payment.id, reason)
      }
    },
  })
}
