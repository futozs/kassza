import { type Awaitable, type KeyValueStore, memoryStore } from './store'

export type { Awaitable }

export type CookieStore = KeyValueStore

export const SESSION_TTL_SECONDS: number = 85 * 60

export function memoryCookieStore(): CookieStore {
  return memoryStore()
}

const SESSION_KEY_PREFIX = 'szamlazz:session:'
const sessionKeyEncoder = new TextEncoder()

export async function sessionKeyFor(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    sessionKeyEncoder.encode(`${SESSION_KEY_PREFIX}${secret}`),
  )
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0'))
  return `${SESSION_KEY_PREFIX}${hex.join('')}`
}

function readSetCookieHeaders(headers: Headers): string[] {
  const withGetter = headers as Headers & { getSetCookie?: () => string[] }
  if (typeof withGetter.getSetCookie === 'function') return withGetter.getSetCookie()
  const combined = headers.get('set-cookie')
  return combined ? combined.split(/,(?=\s*[^;,=\s]+=)/) : []
}

function parseCookiePairs(cookieHeader: string | undefined | null): Map<string, string> {
  const pairs = new Map<string, string>()
  if (!cookieHeader) return pairs
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=')
    if (separator <= 0) continue
    pairs.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim())
  }
  return pairs
}

export function mergeSetCookies(
  existing: string | undefined | null,
  headers: Headers,
): string | undefined {
  const setCookies = readSetCookieHeaders(headers)
  if (setCookies.length === 0) return undefined
  const pairs = parseCookiePairs(existing)
  let changed = false
  for (const setCookie of setCookies) {
    const [pair] = setCookie.split(';')
    if (!pair) continue
    const separator = pair.indexOf('=')
    if (separator <= 0) continue
    const name = pair.slice(0, separator).trim()
    const value = pair.slice(separator + 1).trim()
    if (pairs.get(name) === value) continue
    pairs.set(name, value)
    changed = true
  }
  if (!changed) return undefined
  return [...pairs].map(([name, value]) => `${name}=${value}`).join('; ')
}
