import type { PaymentProvider } from './types'

export type WebhookVerificationReason =
  | 'missing_signature'
  | 'invalid_signature'
  | 'timestamp_out_of_range'
  | 'invalid_payload'
  | 'payload_too_large'
  | 'verification_failed'

export class WebhookVerificationError extends Error {
  override readonly name: string = 'WebhookVerificationError'
  readonly provider: PaymentProvider
  readonly reason: WebhookVerificationReason

  constructor(provider: PaymentProvider, reason: WebhookVerificationReason, message: string) {
    super(message)
    this.provider = provider
    this.reason = reason
  }
}

export class PaymentProviderError extends Error {
  override readonly name: string = 'PaymentProviderError'
  readonly provider: PaymentProvider
  readonly status: number | undefined

  constructor(provider: PaymentProvider, message: string, status?: number, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause })
    this.provider = provider
    this.status = status
  }
}

export function isWebhookVerificationError(error: unknown): error is WebhookVerificationError {
  return error instanceof WebhookVerificationError
}
