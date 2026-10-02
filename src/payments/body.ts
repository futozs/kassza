import { decodeUtf8 } from '../core/binary'
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

export async function readRawBody(
  request: Request,
  provider: PaymentProvider,
  maxBytes: number = DEFAULT_MAX_WEBHOOK_BYTES,
): Promise<string> {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge(provider, maxBytes)
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const chunk = await reader.read()
    if (chunk.done) break
    total += chunk.value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw tooLarge(provider, maxBytes)
    }
    chunks.push(chunk.value)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return decodeUtf8(bytes)
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
