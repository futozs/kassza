export type HashAlgorithm = 'SHA-256' | 'SHA-384' | 'SHA-512'

const encoder = new TextEncoder()

function toBytes(data: string | Uint8Array): Uint8Array<ArrayBuffer> {
  if (typeof data === 'string') return encoder.encode(data)
  const copy = new Uint8Array(data.byteLength)
  copy.set(data)
  return copy
}

export function bytesToHex(bytes: Uint8Array): string {
  let hex = ''
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0')
  return hex
}

export async function digestHex(
  algorithm: HashAlgorithm,
  data: string | Uint8Array,
): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest(algorithm, toBytes(data))))
}

export async function hmac(
  algorithm: HashAlgorithm,
  key: string | Uint8Array,
  data: string | Uint8Array,
): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    toBytes(key),
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, toBytes(data)))
}

export async function hmacHex(
  algorithm: HashAlgorithm,
  key: string | Uint8Array,
  data: string | Uint8Array,
): Promise<string> {
  return bytesToHex(await hmac(algorithm, key, data))
}

export function timingSafeEqual(left: string, right: string): boolean {
  const a = encoder.encode(left)
  const b = encoder.encode(right)
  let difference = a.length ^ b.length
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index++) {
    difference |= (a[index] ?? 0) ^ (b[index] ?? 0)
  }
  return difference === 0
}
