import { AGENT_ACTIONS, type AgentAction, SZAMLAZZ_AGENT_URL } from './actions'
import {
  type AttemptLedger,
  type AttemptLedgerMode,
  attemptLedgerKey,
  attemptLimitError,
  countsAsFailedAttempt,
  createAttemptLedger,
} from './attempt-ledger'
import type { DocumentErrorMode, DocumentHook } from './document-events'
import { SzamlazzError } from './errors'
import { type AgentResponse, createAgentResponse } from './response'
import {
  type CookieStore,
  memoryCookieStore,
  mergeSetCookies,
  SESSION_TTL_SECONDS,
  sessionKeyFor,
} from './session'
import type { KeyValueStore } from './store'
import { emitWarning, type KasszaWarning, type WarningHook } from './warnings'
import { el, type XmlNode } from './xml/serialize'

export const MAX_ATTEMPTS_PER_REQUEST = 5
export const DEFAULT_TIMEOUT_MS = 60_000
const DEFAULT_SAFE_ATTEMPTS = 3
const DEFAULT_RETRY_DELAY_MS = 1_000
export const RETRY_JITTER = 0.2
export const MAX_RETRY_AFTER_MS = 60_000

export interface AgentAttachment {
  readonly filename: string
  readonly content: Uint8Array | ArrayBuffer | Blob | string
  readonly contentType?: string
}

export interface AgentRequestEvent {
  readonly action: AgentAction
  readonly attempt: number
  readonly requestId: string
}

export interface AgentResponseEvent extends AgentRequestEvent {
  readonly status: number
  readonly durationMs: number
  readonly responseBytes: number
  readonly sessionReused: boolean
}

export interface AgentErrorEvent extends AgentRequestEvent {
  readonly error: SzamlazzError
  readonly willRetry: boolean
}

export interface AgentCompleteEvent extends AgentRequestEvent {
  readonly outcome: 'success' | 'error'
  readonly durationMs: number
  readonly error?: SzamlazzError | undefined
  readonly willRetry: boolean
}

export interface SzamlazzHooks {
  readonly onRequest?: (event: AgentRequestEvent) => void
  readonly onResponse?: (event: AgentResponseEvent) => void
  readonly onError?: (event: AgentErrorEvent) => void
  readonly onComplete?: (event: AgentCompleteEvent) => void
  readonly onDocument?: DocumentHook
  readonly onDocumentError?: DocumentErrorMode
  readonly onWarning?: (warning: KasszaWarning) => void
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
  readonly attemptLedger?: KeyValueStore | undefined
  readonly attemptLedgerMode?: AttemptLedgerMode | undefined
  readonly maintenanceCooldownMs?: number | undefined
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
  readonly warn?: WarningHook | undefined
  execute<T>(request: AgentRequest, parse: (response: AgentResponse) => T | Promise<T>): Promise<T>
  resetSession(): Promise<void>
  resetAttempts(key: string): Promise<void>
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

type HookName = 'onRequest' | 'onResponse' | 'onError' | 'onComplete'

function hookWarning(name: HookName, action: AgentAction, error: unknown): KasszaWarning {
  return {
    kind: 'hook',
    message: `A(z) ${name} hook hibát dobott, a kassza figyelmen kívül hagyta.`,
    error,
    action,
    operation: name,
  }
}

function callHook<T extends AgentRequestEvent>(
  hooks: SzamlazzHooks,
  name: HookName,
  event: T,
): void {
  const hook = hooks[name] as ((event: T) => unknown) | undefined
  if (!hook) return
  try {
    const result: unknown = hook(event)
    if (result instanceof Promise) {
      result.catch((error: unknown) =>
        emitWarning(hooks.onWarning, hookWarning(name, event.action, error)),
      )
    }
  } catch (error) {
    emitWarning(hooks.onWarning, hookWarning(name, event.action, error))
  }
}

function parseRetryAfter(value: string | null, now: number): number | undefined {
  if (value === null) return undefined
  const trimmed = value.trim()
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000
  const date = Date.parse(trimmed)
  if (Number.isNaN(date)) return undefined
  return Math.max(0, date - now)
}

export function retryDelay(
  baseMs: number,
  attempt: number,
  random: number = Math.random(),
): number {
  const backoff = baseMs * 2 ** (attempt - 1)
  return Math.round(backoff * (1 - RETRY_JITTER + 2 * RETRY_JITTER * random))
}

function resolveLedgerMode(value: AttemptLedgerMode | undefined): AttemptLedgerMode {
  if (value === undefined || value === 'fail-open' || value === 'fail-closed') {
    return value ?? 'fail-open'
  }
  throw configurationError(
    `Az attemptLedgerMode értéke 'fail-open' vagy 'fail-closed' lehet, kapott: ${String(value)}`,
  )
}

function storeUnavailableError(action: AgentAction, error: unknown): SzamlazzError {
  return new SzamlazzError(
    'A próbálkozás-napló tárolója nem érhető el, ezért a kassza nem küldte el a kérést.',
    {
      category: 'store_unavailable',
      action,
      cause: error,
      hint: "Az attemptLedgerMode: 'fail-closed' beállítás miatt a kassza nem küld kérést, amíg a napló (például a Redis) nem elérhető. Állítsd helyre a tárolót, vagy válts 'fail-open' módra.",
    },
  )
}

function clampAttempts(value: number | undefined): number {
  if (value === undefined) return DEFAULT_SAFE_ATTEMPTS
  if (!Number.isInteger(value) || value < 1) {
    throw configurationError(`A maxAttempts értéke legalább 1 egész szám legyen, kapott: ${value}`)
  }
  return Math.min(value, MAX_ATTEMPTS_PER_REQUEST)
}

function resolveCooldown(value: number | undefined): number {
  if (value === undefined) return 0
  if (!Number.isFinite(value) || value < 0) {
    throw configurationError(
      `A maintenanceCooldownMs értéke nemnegatív szám legyen, kapott: ${value}`,
    )
  }
  return value
}

function attachmentSize(attachment: AgentAttachment): number {
  const { content } = attachment
  if (typeof content === 'string') return new TextEncoder().encode(content).byteLength
  if (content instanceof Blob) return content.size
  return content.byteLength
}

function maintenanceCooldownError(action: AgentAction, remainingMs: number): SzamlazzError {
  return new SzamlazzError(
    `A Számlázz.hu karbantartás miatt nem érhető el, a kassza még ${Math.ceil(remainingMs / 1000)} másodpercig nem küld kérést.`,
    {
      category: 'maintenance',
      action,
      hint: 'A maintenanceCooldownMs beállítás miatt a kérés el sem indult. Válts tartalék folyamatra (például kézi nyugtatömbre), vagy próbáld később.',
    },
  )
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
  const warn: WarningHook = (warning) => emitWarning(hooks.onWarning, warning)
  const ledger: AttemptLedger | undefined = options.attemptLedger
    ? createAttemptLedger(options.attemptLedger)
    : undefined
  const ledgerMode = resolveLedgerMode(options.attemptLedgerMode)

  async function ignoreStoreFailure<T>(
    operation: string,
    action: AgentAction | undefined,
    run: () => T | Promise<T>,
  ): Promise<T | undefined> {
    try {
      return await run()
    } catch (error) {
      warn({
        kind: 'session',
        message: `A session cookie tároló "${operation}" művelete sikertelen, a kérés session nélkül folytatódik.`,
        error,
        action,
        operation,
      })
      return undefined
    }
  }
  const cooldownMs = resolveCooldown(options.maintenanceCooldownMs)
  let blockedUntil = 0

  async function send(
    request: AgentRequest,
  ): Promise<{ response: AgentResponse; sessionReused: boolean }> {
    const cookie = cookieStore
      ? await ignoreStoreFailure('get', request.action, async () =>
          cookieStore.get(await resolveSessionKey()),
        )
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
        await ignoreStoreFailure('set', request.action, async () =>
          cookieStore.set(await resolveSessionKey(), merged, SESSION_TTL_SECONDS),
        )
      }
    }
    return {
      response: createAgentResponse(request.action, response.status, response.headers, body),
      sessionReused: Boolean(cookie),
    }
  }

  async function resetSession(): Promise<void> {
    if (cookieStore) {
      await ignoreStoreFailure('delete', undefined, async () =>
        cookieStore.delete(await resolveSessionKey()),
      )
    }
  }

  async function resetAttempts(key: string): Promise<void> {
    if (ledger) await ledger.reset(key)
  }

  async function ledgerKeyFor(request: AgentRequest): Promise<string | undefined> {
    if (!ledger) return undefined
    return attemptLedgerKey({
      action: request.action,
      xml: request.xml,
      attachments: (request.attachments ?? []).map((attachment) => ({
        filename: attachment.filename,
        size: attachmentSize(attachment),
      })),
    })
  }

  function ledgerWarning(operation: string, action: AgentAction, error: unknown): void {
    warn({
      kind: 'ledger',
      message: `A próbálkozás-napló tárolójának "${operation}" művelete sikertelen. A kassza a folyamaton belüli számlálót használja, a folyamatok közötti védelem most nem él.`,
      error,
      action,
      operation,
    })
  }

  async function readFailures(action: AgentAction, key: string | undefined): Promise<number> {
    if (!ledger || key === undefined) return 0
    try {
      return await ledger.failures(key)
    } catch (error) {
      if (ledgerMode === 'fail-closed') throw storeUnavailableError(action, error)
      ledgerWarning('get', action, error)
      return ledger.fallbackFailures(key)
    }
  }

  async function recordFailure(action: AgentAction, key: string | undefined): Promise<void> {
    if (!ledger || key === undefined) return
    try {
      await ledger.recordFailure(key)
    } catch (error) {
      ledgerWarning('increment', action, error)
    }
  }

  async function clearFailures(action: AgentAction, key: string | undefined): Promise<void> {
    if (!ledger || key === undefined) return
    try {
      await ledger.reset(key)
    } catch (error) {
      ledgerWarning('delete', action, error)
    }
  }

  function assertNoCooldown(action: AgentAction): void {
    const remainingMs = blockedUntil - Date.now()
    if (remainingMs > 0) throw maintenanceCooldownError(action, remainingMs)
  }

  async function execute<T>(
    request: AgentRequest,
    parse: (response: AgentResponse) => T | Promise<T>,
  ): Promise<T> {
    const maxAttempts = request.safeToRetry ? safeAttempts : 1
    const ledgerKey = await ledgerKeyFor(request)
    const requestId = crypto.randomUUID()
    for (let attempt = 1; ; attempt++) {
      assertNoCooldown(request.action)
      const failures = await readFailures(request.action, ledgerKey)
      if (ledgerKey !== undefined && failures >= MAX_ATTEMPTS_PER_REQUEST) {
        throw attemptLimitError(request.action, ledgerKey, failures)
      }
      const startedAt = Date.now()
      let retryAfterMs: number | undefined
      const base = { action: request.action, attempt, requestId }
      callHook(hooks, 'onRequest', base)
      try {
        const { response, sessionReused } = await send(request)
        retryAfterMs = parseRetryAfter(response.headers.get('retry-after'), Date.now())
        callHook(hooks, 'onResponse', {
          ...base,
          status: response.status,
          durationMs: Date.now() - startedAt,
          responseBytes: response.body.byteLength,
          sessionReused,
        })
        const result = await parse(response)
        if (failures > 0) await clearFailures(request.action, ledgerKey)
        callHook(hooks, 'onComplete', {
          ...base,
          outcome: 'success',
          durationMs: Date.now() - startedAt,
          willRetry: false,
        })
        return result
      } catch (error) {
        if (!(error instanceof SzamlazzError)) throw error
        if (countsAsFailedAttempt(error)) await recordFailure(request.action, ledgerKey)
        if (error.category === 'maintenance' && cooldownMs > 0) {
          blockedUntil = Date.now() + cooldownMs
        }
        const willRetry =
          error.retryable &&
          attempt < maxAttempts &&
          !(error.category === 'maintenance' && cooldownMs > 0) &&
          (retryAfterMs === undefined || retryAfterMs <= MAX_RETRY_AFTER_MS)
        callHook(hooks, 'onError', { ...base, error, willRetry })
        callHook(hooks, 'onComplete', {
          ...base,
          outcome: 'error',
          durationMs: Date.now() - startedAt,
          error,
          willRetry,
        })
        if (error.category === 'auth') await resetSession()
        if (!willRetry) throw error
        await sleep(Math.max(retryDelay(retryDelayMs, attempt), retryAfterMs ?? 0), request.signal)
      }
    }
  }

  return { credentials, warn, execute, resetSession, resetAttempts }
}
