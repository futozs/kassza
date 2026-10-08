import { SzamlazzError } from '../core/errors'

export const SZAMLAZZ_OUTBOUND_IPS: readonly string[] = [
  '3.73.214.98',
  '3.76.149.232',
  '18.153.156.51',
]

export interface SzamlazzIpOptions {
  readonly trustedProxies?: number | undefined
  readonly allowedIps?: readonly string[] | undefined
}

function normalizeIp(value: string): string {
  let ip = value.trim()
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(ip)
  if (bracketed?.[1]) ip = bracketed[1]
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(ip)
  if (ipv4WithPort?.[1]) ip = ipv4WithPort[1]
  return ip.replace(/^::ffff:/i, '')
}

function resolveTrustedProxies(value: number | undefined): number {
  if (value === undefined) return 0
  if (!Number.isInteger(value) || value < 0) {
    throw new SzamlazzError(
      `A trustedProxies értéke nemnegatív egész szám legyen, kapott: ${value}`,
      { category: 'configuration' },
    )
  }
  return value
}

function clientAddress(header: string, trustedProxies: number): string | undefined {
  const entries = header
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
  return entries[entries.length - 1 - trustedProxies]
}

export type SzamlazzIpRejection = 'missing_header' | 'no_client_entry' | 'not_allowed'

export type SzamlazzIpCheck =
  | { readonly allowed: true; readonly client: string }
  | {
      readonly allowed: false
      readonly reason: SzamlazzIpRejection
      readonly client?: string | undefined
      readonly message: string
    }

function rejection(
  reason: SzamlazzIpRejection,
  message: string,
  client?: string | undefined,
): SzamlazzIpCheck {
  return client === undefined
    ? { allowed: false, reason, message }
    : { allowed: false, reason, client, message }
}

export function checkSzamlazzIp(
  ip: string | null | undefined,
  options: SzamlazzIpOptions = {},
): SzamlazzIpCheck {
  const trustedProxies = resolveTrustedProxies(options.trustedProxies)
  if (typeof ip !== 'string' || ip.trim() === '') {
    return rejection(
      'missing_header',
      'Nincs forrás IP-cím: a proxy nem adta át az x-forwarded-for fejlécet.',
    )
  }
  const client = clientAddress(ip, trustedProxies)
  if (client === undefined) {
    return rejection(
      'no_client_entry',
      `Az x-forwarded-for fejlécben kevesebb cím van, mint a trustedProxies (${trustedProxies}) + 1.`,
    )
  }
  const normalized = normalizeIp(client)
  const allowed = new Set((options.allowedIps ?? SZAMLAZZ_OUTBOUND_IPS).map(normalizeIp))
  if (allowed.has(normalized)) return { allowed: true, client: normalized }
  return rejection(
    'not_allowed',
    `A(z) ${normalized} cím nem szerepel a Számlázz.hu kimenő IP-címei között. Ha a Számlázz.hu új címet kapott, add meg az allowedIps opcióban, és jelezd a kassza hibajegyében.`,
    normalized,
  )
}

export function isSzamlazzIp(
  ip: string | null | undefined,
  options: SzamlazzIpOptions = {},
): boolean {
  return checkSzamlazzIp(ip, options).allowed
}
