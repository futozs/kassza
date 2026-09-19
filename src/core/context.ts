import { AGENT_ACTIONS, type AgentAction, SZAMLAZZ_AGENT_URL } from './actions'
import { SzamlazzError } from './errors'
import { type AgentResponse, createAgentResponse } from './response'
import {
  type CookieStore,
  memoryCookieStore,
  mergeSetCookies,
  SESSION_TTL_SECONDS,
  sessionKeyFor,
} from './session'
import { el, type XmlNode } from './xml/serialize'

export const MAX_ATTEMPTS_PER_REQUEST = 5
export const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_SAFE_ATTEMPTS = 3
const DEFAULT_RETRY_DELAY_MS = 1_000

export interface AgentAttachment {
  readonly filename: string
  readonly content: Uint8Array | ArrayBuffer | Blob | string
  readonly contentType?: string
}

export interface AgentRequestEvent {
  readonly action: AgentAction
  readonly attempt: number
}

export interface AgentResponseEvent extends AgentRequestEvent {
  readonly status: number
  readonly durationMs: number
}

export interface AgentErrorEvent extends AgentRequestEvent {
  readonly error: SzamlazzError
  readonly willRetry: boolean
}

export interface SzamlazzHooks {
  readonly onRequest?: (event: AgentRequestEvent) => void
  readonly onResponse?: (event: AgentResponseEvent) => void
  readonly onError?: (event: AgentErrorEvent) => void
}

export interface SzamlazzOptions {
  readonly agentKey?: string
  readonly username?: string
  readonly password?: string
  readonly endpoint?: string
  readonly fetch?: typeof globalThis.fetch
  readonly timeoutMs?: number
  readonly maxAttempts?: number
  readonly retryDelayMs?: number
  readonly cookieStore?: CookieStore | false
  readonly hooks?: SzamlazzHooks
}

export interface RequestOptions {
  readonly signal?: AbortSignal | undefined
}

export interface AgentRequest {
  readonly action: AgentAction
  readonly xml: string
  readonly attachments?: readonly AgentAttachment[]
  readonly signal?: AbortSignal | undefined
  readonly safeToRetry?: boolean
}

export interface AgentContext {
  readonly credentials: readonly XmlNode[]
  execute<T>(request: AgentRequest, parse: (response: AgentResponse) => T | Promise<T>): Promise<T>
  resetSession(): Promise<void>
}

function readEnv(name: string): string | undefined {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env
  const value = env?.[name]?.trim()
  return value ? value : undefined
}

function configurationError(message: string): SzamlazzError {
  return new SzamlazzError(message, { category: 'configuration' })
}

export function resolveCredentials(options: SzamlazzOptions): XmlNode[] {
  const agentKey =
    options.agentKey?.trim() || (options.username ? undefined : readEnv('SZAMLAZZ_AGENT_KEY'))
  if (agentKey) {
    if (agentKey !== agentKey.toLowerCase()) {
      throw configurationError(
        'Az Agent kulcs nagybetűt tartalmaz. A Számlázz.hu csak kisbetűs kulcsot fogad el, másold ki újra a kulcsot.',
      )
    }
    return [el('szamlaagentkulcs', agentKey)]
  }
  if (options.username && options.password) {
    return [el('felhasznalo', options.username), el('jelszo', options.password)]
  }
  throw configurationError(
    'Hiányzik az Agent kulcs. Add meg az agentKey opciót, vagy állítsd be a SZAMLAZZ_AGENT_KEY környezeti változót.',
  )
}

function toBlob(attachment: AgentAttachment): Blob {
  const type = attachment.contentType ?? 'application/octet-stream'
  if (attachment.content instanceof Blob) return attachment.content
  return new Blob([attachment.content as BlobPart], { type })
}

function buildFormData(request: AgentRequest): FormData {
  const form = new FormData()
  form.append(
    AGENT_ACTIONS[request.action],
    new Blob([request.xml], { type: 'text/xml; charset=UTF-8' }),
    'request.xml',
  )
  request.attachments?.forEach((attachment, index) => {
    form.append(`attachfile${index + 1}`, toBlob(attachment), attachment.filename)
  })
  return form
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function ignoreStoreFailure<T>(operation: () => T | Promise<T>): Promise<T | undefined> {
  try {
    return await operation()
  } catch {
    return undefined
  }
}

function callHook<T>(hook: ((event: T) => void) | undefined, event: T): void {
  if (!hook) return
  try {
    const result: unknown = hook(event)
    if (result instanceof Promise) result.catch(() => undefined)
  } catch {
    return
  }
}

function clampAttempts(value: number | undefined): number {
  if (value === undefined) return DEFAULT_SAFE_ATTEMPTS
  if (!Number.isInteger(value) || value < 1) {
    throw configurationError(`A maxAttempts értéke legalább 1 egész szám legyen, kapott: ${value}`)
  }
  return Math.min(value, MAX_ATTEMPTS_PER_REQUEST)
}

export function createAgentContext(options: SzamlazzOptions = {}): AgentContext {
  const credentials = resolveCredentials(options)
  const endpoint = options.endpoint ?? SZAMLAZZ_AGENT_URL
  const fetchImpl = options.fetch ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw configurationError('Nem található fetch implementáció. Add meg a fetch opciót.')
  }
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const safeAttempts = clampAttempts(options.maxAttempts)
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS
  const cookieStore =
    options.cookieStore === false ? undefined : (options.cookieStore ?? memoryCookieStore())
  const sessionSecret = credentials.map((node) => String(node.content)).join('|')
  let sessionKeyPromise: Promise<string> | undefined
  const resolveSessionKey = (): Promise<string> => {
    sessionKeyPromise ??= sessionKeyFor(sessionSecret)
    return sessionKeyPromise
  }
  const hooks = options.hooks ?? {}

  async function send(request: AgentRequest): Promise<AgentResponse> {
    const cookie = cookieStore
      ? await ignoreStoreFailure(async () => cookieStore.get(await resolveSessionKey()))
      : undefined
    request.signal?.throwIfAborted()
    const headers = new Headers({ Accept: 'application/xml, application/pdf, text/plain, */*' })
    if (cookie) headers.set('Cookie', cookie)

    const timeoutSignal = AbortSignal.timeout(timeoutMs)
    const signal = request.signal ? AbortSignal.any([request.signal, timeoutSignal]) : timeoutSignal

    let response: Response
    let body: Uint8Array
    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers,
        body: buildFormData(request),
        signal,
      })
      body = new Uint8Array(await response.arrayBuffer())
    } catch (error) {
      if (request.signal?.aborted) throw request.signal.reason
      if (timeoutSignal.aborted || isAbortError(error)) {
        throw new SzamlazzError(`A Számlázz.hu nem válaszolt ${timeoutMs} ms alatt.`, {
          category: 'timeout',
          action: request.action,
          cause: error,
        })
      }
      throw new SzamlazzError('Hálózati hiba a Számlázz.hu elérésekor.', {
        category: 'network',
        action: request.action,
        cause: error,
      })
    }

    if (cookieStore) {
      const merged = mergeSetCookies(cookie, response.headers)
      if (merged) {
        await ignoreStoreFailure(async () =>
          cookieStore.set(await resolveSessionKey(), merged, SESSION_TTL_SECONDS),
        )
      }
    }
    return createAgentResponse(request.action, response.status, response.headers, body)
  }

  async function resetSession(): Promise<void> {
    if (cookieStore) {
      await ignoreStoreFailure(async () => cookieStore.delete(await resolveSessionKey()))
    }
  }

  async function execute<T>(
    request: AgentRequest,
    parse: (response: AgentResponse) => T | Promise<T>,
  ): Promise<T> {
    const maxAttempts = request.safeToRetry ? safeAttempts : 1
    for (let attempt = 1; ; attempt++) {
      const startedAt = Date.now()
      callHook(hooks.onRequest, { action: request.action, attempt })
      try {
        const response = await send(request)
        callHook(hooks.onResponse, {
          action: request.action,
          attempt,
          status: response.status,
          durationMs: Date.now() - startedAt,
        })
        return await parse(response)
      } catch (error) {
        if (!(error instanceof SzamlazzError)) throw error
        const willRetry = error.retryable && attempt < maxAttempts
        callHook(hooks.onError, { action: request.action, attempt, error, willRetry })
        if (error.category === 'auth') await resetSession()
        if (!willRetry) throw error
        await sleep(retryDelayMs * 2 ** (attempt - 1), request.signal)
      }
    }
  }

  return { credentials, execute, resetSession }
}
