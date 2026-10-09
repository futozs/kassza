import type {
  AgentCompleteEvent,
  AgentRequestEvent,
  AgentResponseEvent,
  SzamlazzHooks,
} from '../core/context'
import { hmacHex } from '../core/crypto'
import type { DocumentEvent } from '../core/document-events'
import type { KasszaWarning, KasszaWarningKind } from '../core/warnings'
import type { Metrics } from './metrics'

export type LogMethod = (data: Readonly<Record<string, unknown>>, message: string) => void

export interface ObserveLogger {
  readonly debug?: LogMethod | undefined
  readonly info?: LogMethod | undefined
  readonly warn?: LogMethod | undefined
  readonly error?: LogMethod | undefined
}

export type SpanAttributeValue = string | number | boolean

export interface ObserveSpan {
  setAttribute(key: string, value: SpanAttributeValue): unknown
  setStatus(status: { readonly code: number; readonly message?: string }): unknown
  recordException(exception: unknown): unknown
  end(): unknown
}

export interface ObserveTracer {
  startSpan(
    name: string,
    options?: { readonly attributes?: Readonly<Record<string, SpanAttributeValue>> },
  ): ObserveSpan
}

export interface ObserveOptions {
  readonly logger?: ObserveLogger | undefined
  readonly tracer?: ObserveTracer | undefined
  readonly metrics?: Metrics | undefined
  readonly redact?: boolean | undefined
  readonly orderRefSalt?: string | undefined
  readonly logRequests?: boolean | undefined
}

export const SPAN_STATUS_OK = 1
export const SPAN_STATUS_ERROR = 2
export const MAX_OPEN_SPANS = 1_000

const STORE_WARNINGS: ReadonlySet<KasszaWarningKind> = new Set([
  'session',
  'ledger',
  'lock',
  'dedupe',
  'cache',
])

function randomSalt(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

function safely(run: () => void): void {
  try {
    run()
  } catch {
    return
  }
}

function orderNumberOf(event: DocumentEvent): string | undefined {
  if (event.kind === 'receipt') return event.document.orderNumber
  if (event.action === 'created') return event.input.orderNumber?.trim() || undefined
  return undefined
}

function spanKey(event: AgentRequestEvent): string {
  return `${event.requestId}:${event.attempt}`
}

export function observe(options: ObserveOptions = {}): SzamlazzHooks {
  const { logger, tracer, metrics } = options
  const redact = options.redact !== false
  const salt = options.orderRefSalt ?? randomSalt()
  const spans = new Map<string, ObserveSpan>()

  async function orderRef(orderNumber: string | undefined): Promise<string | undefined> {
    if (orderNumber === undefined) return undefined
    if (!redact) return orderNumber
    return `hmac:${(await hmacHex('SHA-256', salt, orderNumber)).slice(0, 16)}`
  }

  const onRequest = (event: AgentRequestEvent): void => {
    if (tracer) {
      safely(() => {
        if (spans.size >= MAX_OPEN_SPANS) {
          const oldest = spans.keys().next().value
          if (oldest !== undefined) {
            spans.get(oldest)?.end()
            spans.delete(oldest)
          }
        }
        spans.set(
          spanKey(event),
          tracer.startSpan(`kassza ${event.action}`, {
            attributes: {
              'kassza.action': event.action,
              'kassza.attempt': event.attempt,
              'kassza.request_id': event.requestId,
            },
          }),
        )
      })
    }
    if (options.logRequests === true) {
      safely(() =>
        logger?.debug?.(
          { event: 'kassza.request.start', ...event },
          `kassza: ${event.action} kérés indul`,
        ),
      )
    }
  }

  const onResponse = (event: AgentResponseEvent): void => {
    const span = spans.get(spanKey(event))
    if (!span) return
    safely(() => {
      span.setAttribute('http.status_code', event.status)
      span.setAttribute('kassza.response_bytes', event.responseBytes)
      span.setAttribute('kassza.session_reused', event.sessionReused)
    })
  }

  const onComplete = (event: AgentCompleteEvent): void => {
    const key = spanKey(event)
    const span = spans.get(key)
    spans.delete(key)
    const category = event.error?.category
    const code = event.error?.code
    if (span) {
      safely(() => {
        if (category) span.setAttribute('kassza.error.category', category)
        if (code !== undefined) span.setAttribute('kassza.error.code', code)
        if (event.error) {
          span.recordException(event.error)
          span.setStatus({ code: SPAN_STATUS_ERROR, message: event.error.message })
        } else if (event.outcome === 'error') {
          span.setStatus({ code: SPAN_STATUS_ERROR })
        } else {
          span.setStatus({ code: SPAN_STATUS_OK })
        }
        span.end()
      })
    }
    if (metrics) {
      safely(() => {
        metrics.counter('kassza_requests_total', {
          action: event.action,
          outcome: event.outcome === 'success' ? 'success' : (category ?? 'error'),
        })
        metrics.histogram('kassza_request_duration_ms', event.durationMs, { action: event.action })
        if (event.willRetry) metrics.counter('kassza_retries_total', { action: event.action })
        if (category === 'maintenance') metrics.counter('kassza_maintenance_total')
        if (category === 'unexpected_response') {
          metrics.counter('kassza_unexpected_response_total', { action: event.action })
        }
      })
    }
    const data = {
      event: 'kassza.request',
      action: event.action,
      attempt: event.attempt,
      requestId: event.requestId,
      outcome: event.outcome,
      durationMs: event.durationMs,
      willRetry: event.willRetry,
      ...(category ? { errorCategory: category } : {}),
      ...(code === undefined ? {} : { errorCode: code }),
    }
    safely(() => {
      if (event.outcome === 'success') {
        logger?.info?.(data, `kassza: ${event.action} sikeres (${event.durationMs} ms)`)
      } else {
        logger?.warn?.(
          data,
          `kassza: ${event.action} sikertelen${category ? ` (${category})` : ''}${event.willRetry ? ', újrapróbálás' : ''}`,
        )
      }
    })
  }

  const onWarning = (warning: KasszaWarning): void => {
    safely(() => {
      metrics?.counter('kassza_warnings_total', { kind: warning.kind })
      if (STORE_WARNINGS.has(warning.kind)) {
        metrics?.counter('kassza_store_errors_total', { store: warning.kind })
      }
    })
    safely(() =>
      logger?.warn?.(
        {
          event: 'kassza.warning',
          kind: warning.kind,
          ...(warning.action ? { action: warning.action } : {}),
          ...(warning.operation ? { operation: warning.operation } : {}),
          error: warning.error instanceof Error ? warning.error.message : String(warning.error),
        },
        warning.message,
      ),
    )
  }

  const onDocument = async (event: DocumentEvent): Promise<void> => {
    safely(() =>
      metrics?.counter('kassza_documents_total', { kind: event.kind, action: event.action }),
    )
    if (!logger?.info) return
    try {
      const ref = await orderRef(orderNumberOf(event))
      logger.info(
        {
          event: 'kassza.document',
          kind: event.kind,
          action: event.action,
          number: event.number,
          ...(ref === undefined ? {} : { orderRef: ref }),
        },
        `kassza: ${event.kind} ${event.action} ${event.number}`,
      )
    } catch {
      return
    }
  }

  return { onRequest, onResponse, onComplete, onWarning, onDocument }
}

type SyncHookName = 'onRequest' | 'onResponse' | 'onError' | 'onComplete' | 'onWarning'

const SYNC_HOOKS: readonly SyncHookName[] = [
  'onRequest',
  'onResponse',
  'onError',
  'onComplete',
  'onWarning',
]

function combineSync(hooks: readonly SzamlazzHooks[], name: SyncHookName): unknown {
  const handlers = hooks
    .map((hook) => hook[name] as ((event: unknown) => unknown) | undefined)
    .filter((handler): handler is (event: unknown) => unknown => handler !== undefined)
  if (handlers.length === 0) return undefined
  return (event: unknown): void => {
    let failure: { readonly error: unknown } | undefined
    for (const handler of handlers) {
      try {
        const result = handler(event)
        if (result instanceof Promise) result.catch(() => undefined)
      } catch (error) {
        failure ??= { error }
      }
    }
    if (failure) throw failure.error
  }
}

export function combineHooks(...hooks: readonly (SzamlazzHooks | undefined)[]): SzamlazzHooks {
  const present = hooks.filter((hook): hook is SzamlazzHooks => hook !== undefined)
  const combined: Record<string, unknown> = {}
  for (const name of SYNC_HOOKS) {
    const handler = combineSync(present, name)
    if (handler) combined[name] = handler
  }
  const documentHooks = present
    .map((hook) => hook.onDocument)
    .filter((hook): hook is NonNullable<SzamlazzHooks['onDocument']> => hook !== undefined)
  if (documentHooks.length > 0) {
    combined.onDocument = async (event: DocumentEvent): Promise<void> => {
      let failure: { readonly error: unknown } | undefined
      for (const hook of documentHooks) {
        try {
          await hook(event)
        } catch (error) {
          failure ??= { error }
        }
      }
      if (failure) throw failure.error
    }
  }
  const mode = present.map((hook) => hook.onDocumentError).findLast((value) => value !== undefined)
  if (mode !== undefined) combined.onDocumentError = mode
  return combined as SzamlazzHooks
}
