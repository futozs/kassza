import { plainResponse } from './body'
import { WebhookVerificationError } from './errors'
import type { PaymentWebhookBaseOptions } from './types'

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
