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

export function isSzamlazzIp(
  ip: string | null | undefined,
  options: SzamlazzIpOptions = {},
): boolean {
  const trustedProxies = resolveTrustedProxies(options.trustedProxies)
  if (typeof ip !== 'string') return false
  const client = clientAddress(ip, trustedProxies)
  if (client === undefined) return false
  const allowed = new Set((options.allowedIps ?? SZAMLAZZ_OUTBOUND_IPS).map(normalizeIp))
  return allowed.has(normalizeIp(client))
}
