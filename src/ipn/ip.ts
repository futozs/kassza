export const SZAMLAZZ_OUTBOUND_IPS: readonly string[] = [
  '3.73.214.98',
  '3.76.149.232',
  '18.153.156.51',
]

const OUTBOUND_IP_SET: ReadonlySet<string> = new Set(SZAMLAZZ_OUTBOUND_IPS)

function normalizeIp(value: string): string {
  const comma = value.indexOf(',')
  let ip = (comma === -1 ? value : value.slice(0, comma)).trim()
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(ip)
  if (bracketed?.[1]) ip = bracketed[1]
  const ipv4WithPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(ip)
  if (ipv4WithPort?.[1]) ip = ipv4WithPort[1]
  return ip.replace(/^::ffff:/i, '')
}

export function isSzamlazzIp(ip: string): boolean {
  if (typeof ip !== 'string') return false
  return OUTBOUND_IP_SET.has(normalizeIp(ip))
}
