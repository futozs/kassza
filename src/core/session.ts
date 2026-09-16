export type Awaitable<T> = T | Promise<T>

export interface CookieStore {
  get(key: string): Awaitable<string | undefined | null>
  set(key: string, value: string, ttlSeconds: number): Awaitable<void>
  delete(key: string): Awaitable<void>
}

export const SESSION_TTL_SECONDS: number = 85 * 60

export function memoryCookieStore(): CookieStore {
  const entries = new Map<string, { value: string; expiresAt: number }>()
  return {
    get(key) {
      const entry = entries.get(key)
      if (!entry) return undefined
      if (entry.expiresAt <= Date.now()) {
        entries.delete(key)
        return undefined
      }
      return entry.value
    },
    set(key, value, ttlSeconds) {
      entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
    },
    delete(key) {
      entries.delete(key)
    },
  }
}

export function sessionKeyFor(secret: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < secret.length; index++) {
    hash ^= secret.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `szamlazz:session:${(hash >>> 0).toString(16).padStart(8, '0')}`
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
