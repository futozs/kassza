import { timingSafeEqual } from '../core/crypto'
import { readRequestText } from '../core/request-body'
import { DataLinkError, type DataLinkPush, parseDataLinkPush } from './push'
import { type DataLinkAcknowledgement, type DataLinkKeyError, dataLinkResponse } from './response'

export const DATA_LINK_KEY_HEADER = 'x-szamlazzhu-key'
export const DEFAULT_DATA_LINK_MAX_BYTES = 67_108_864

export type DataLinkKeyCheck = boolean | DataLinkKeyError

export interface DataLinkHandlerOptions {
  readonly keys?: readonly string[] | undefined
  readonly verifyKey?:
    | ((key: string, push: DataLinkPush) => DataLinkKeyCheck | Promise<DataLinkKeyCheck>)
    | undefined
  readonly onPush: (push: DataLinkPush) => unknown
  readonly onError?: ((error: unknown) => void) | undefined
  readonly maxBodyBytes?: number | undefined
}

export type DataLinkHandler = (request: Request) => Promise<Response>

function plain(status: number, body: string): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } })
}

function reportError(onError: DataLinkHandlerOptions['onError'], error: unknown): void {
  try {
    if (onError) onError(error)
    else console.error('[kassza] Az adatkapcsolati üzenet feldolgozása nem sikerült.', error)
  } catch {
    return
  }
}

function acknowledgementOf(value: unknown): DataLinkAcknowledgement {
  if (value === undefined || value === null) return {}
  if (typeof value !== 'object') {
    throw new TypeError(
      'Az onPush csak DataLinkAcknowledgement objektumot (registrationNumber, keyError) vagy semmit adhat vissza.',
    )
  }
  return value as DataLinkAcknowledgement
}

function configuredKeys(keys: readonly string[] | undefined): readonly string[] | undefined {
  if (keys === undefined) return undefined
  const trimmed = keys.map((key) => (typeof key === 'string' ? key.trim() : ''))
  if (trimmed.length === 0 || trimmed.some((key) => key === '')) {
    throw new TypeError('A keys lista nem lehet üres, és nem tartalmazhat üres kulcsot.')
  }
  return trimmed
}

async function checkKey(
  options: DataLinkHandlerOptions,
  keys: readonly string[] | undefined,
  push: DataLinkPush,
): Promise<true | DataLinkKeyError> {
  const key = push.key
  if (key === undefined) return 'KEY_ERR'
  if (keys !== undefined && !keys.some((candidate) => timingSafeEqual(candidate, key))) {
    return 'KEY_ERR'
  }
  if (!options.verifyKey) return true
  const result = await options.verifyKey(key, push)
  return result === false ? 'KEY_ERR' : result
}

export function dataLinkHandler(options: DataLinkHandlerOptions): DataLinkHandler {
  if (typeof options.onPush !== 'function') {
    throw new TypeError('Add meg az onPush függvényt.')
  }
  const keys = configuredKeys(options.keys)
  if (keys === undefined && typeof options.verifyKey !== 'function') {
    throw new TypeError(
      'Add meg az elfogadott azonosító kulcsokat (keys) vagy a verifyKey függvényt: az adatkapcsolati üzenetnek nincs aláírása, csak a kulcs azonosítja a küldőt.',
    )
  }
  const maxBytes = options.maxBodyBytes ?? DEFAULT_DATA_LINK_MAX_BYTES
  return async (request) => {
    try {
      const raw = await readRequestText(
        request,
        maxBytes,
        () =>
          new DataLinkError(
            'payload_too_large',
            `Az adatkapcsolati üzenet nagyobb a megengedett ${maxBytes} bájtnál.`,
          ),
      )
      const push = parseDataLinkPush(raw, request.headers.get(DATA_LINK_KEY_HEADER) ?? undefined)
      const keyCheck = await checkKey(options, keys, push)
      if (keyCheck !== true) return dataLinkResponse(push, { keyError: keyCheck })
      return dataLinkResponse(push, acknowledgementOf(await options.onPush(push)))
    } catch (error) {
      if (error instanceof DataLinkError) return plain(400, error.message)
      reportError(options.onError, error)
      return plain(500, 'Az adatkapcsolati üzenet feldolgozása nem sikerült.')
    }
  }
}
