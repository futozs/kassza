import { readRequestText } from '../core/request-body'
import { WebhookVerificationError } from './errors'
import type { PaymentProvider } from './types'

export const DEFAULT_MAX_WEBHOOK_BYTES = 1_048_576

function tooLarge(provider: PaymentProvider, maxBytes: number): WebhookVerificationError {
  return new WebhookVerificationError(
    provider,
    'payload_too_large',
    `A webhook törzse nagyobb a megengedett ${maxBytes} bájtnál.`,
  )
}

export function readRawBody(
  request: Request,
  provider: PaymentProvider,
  maxBytes: number = DEFAULT_MAX_WEBHOOK_BYTES,
): Promise<string> {
  return readRequestText(request, maxBytes, () => tooLarge(provider, maxBytes))
}

export function parseJsonObject(
  provider: PaymentProvider,
  payload: string,
): Readonly<Record<string, unknown>> {
  let parsed: unknown
  try {
    parsed = JSON.parse(payload)
  } catch (error) {
    throw new WebhookVerificationError(
      provider,
      'invalid_payload',
      `A webhook törzse nem érvényes JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new WebhookVerificationError(
      provider,
      'invalid_payload',
      'A webhook törzse nem JSON objektum.',
    )
  }
  return parsed as Readonly<Record<string, unknown>>
}

export function plainResponse(status: number, body: string): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
