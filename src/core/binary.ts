const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46] as const

export function isPdf(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_MAGIC.length) return false
  return PDF_MAGIC.every((byte, index) => bytes[index] === byte)
}

const utf8Decoder = new TextDecoder('utf-8')
const utf8Encoder = new TextEncoder()

export function decodeUtf8(bytes: Uint8Array): string {
  return utf8Decoder.decode(bytes)
}

export function encodeUtf8(value: string): Uint8Array {
  return utf8Encoder.encode(value)
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64
    .replace(/[^A-Za-z0-9+/=_-]/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const binary = atob(clean)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

const BASE64_CHUNK_SIZE = 0x8000

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + BASE64_CHUNK_SIZE))
  }
  return btoa(binary)
}
