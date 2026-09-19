import { decodeUtf8 } from '../core/binary'
import { SzamlazzError } from '../core/errors'

export type IpnInput = string | URLSearchParams | FormData | Readonly<Record<string, string>>

export interface IpnNotification {
  readonly invoiceNumber: string
  readonly proformaNumber?: string | undefined
  readonly orderNumber?: string | undefined
  readonly grossTotal: number
  readonly paidAmount: number
  readonly paymentMethod?: string | undefined
  readonly paymentDate?: string | undefined
  readonly isFullyPaid: boolean
  readonly raw: Readonly<Record<string, string>>
}

export const IPN_FIELDS = {
  invoiceNumber: 'szlahu_szamlaszam',
  proformaNumber: 'szlahu_dijbekero_szama',
  orderNumber: 'szlahu_rendelesszam',
  grossTotal: 'szlahu_bruttovegosszeg',
  paidAmount: 'szlahu_kifizetettbrutto',
  paymentMethod: 'szlahu_fizetesmod',
  paymentDate: 'szlahu_kifizdat',
} as const

const AMOUNT_TOLERANCE = 0.005

export const MAX_IPN_BODY_BYTES = 65_536

function ipnError(message: string): SzamlazzError {
  return new SzamlazzError(message, { category: 'validation' })
}

function toRecord(input: IpnInput): Record<string, string> {
  if (typeof input === 'string') {
    return Object.fromEntries(new URLSearchParams(input.trim().replace(/^\?/, '')))
  }
  if (input instanceof URLSearchParams) return Object.fromEntries(input)
  if (typeof FormData !== 'undefined' && input instanceof FormData) {
    return Object.fromEntries(
      [...input.entries()].filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    )
  }
  if (input !== null && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input as Record<string, unknown>)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)]),
    )
  }
  throw ipnError(
    'Az IPN értesítés nem értelmezhető: szöveget, URLSearchParams-t, FormData-t vagy objektumot várunk.',
  )
}

function optionalField(raw: Readonly<Record<string, string>>, name: string): string | undefined {
  const value = raw[name]?.trim()
  return value === undefined || value === '' ? undefined : value
}

function requiredField(raw: Readonly<Record<string, string>>, name: string): string {
  const value = optionalField(raw, name)
  if (value === undefined) {
    throw ipnError(`Hiányzik a kötelező IPN mező: ${name}`)
  }
  return value
}

export function parseIpnAmount(value: string): number | undefined {
  let text = value.replace(/\s+/g, '')
  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')
  if (lastComma !== -1 && lastDot !== -1) {
    const decimal = lastComma > lastDot ? ',' : '.'
    const thousands = decimal === ',' ? '.' : ','
    text = text.split(thousands).join('').replace(decimal, '.')
  } else if (lastComma !== -1) {
    text = text.replace(',', '.')
  }
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return undefined
  return Number(text)
}

function requiredAmount(raw: Readonly<Record<string, string>>, name: string): number {
  const value = requiredField(raw, name)
  const amount = parseIpnAmount(value)
  if (amount === undefined) {
    throw ipnError(`Az IPN mező nem értelmezhető összeg: ${name}="${value}"`)
  }
  return amount
}

export function parseIpnNotification(input: IpnInput): IpnNotification {
  const raw = toRecord(input)
  const invoiceNumber = requiredField(raw, IPN_FIELDS.invoiceNumber)
  const grossTotal = requiredAmount(raw, IPN_FIELDS.grossTotal)
  const paidAmount = requiredAmount(raw, IPN_FIELDS.paidAmount)
  return {
    invoiceNumber,
    proformaNumber: optionalField(raw, IPN_FIELDS.proformaNumber),
    orderNumber: optionalField(raw, IPN_FIELDS.orderNumber),
    grossTotal,
    paidAmount,
    paymentMethod: optionalField(raw, IPN_FIELDS.paymentMethod),
    paymentDate: optionalField(raw, IPN_FIELDS.paymentDate),
    isFullyPaid: Math.abs(paidAmount) + AMOUNT_TOLERANCE >= Math.abs(grossTotal),
    raw,
  }
}

function bodyTooLarge(): SzamlazzError {
  return ipnError(
    `Az IPN kérés törzse túl nagy, legfeljebb ${MAX_IPN_BODY_BYTES} bájt fogadható el.`,
  )
}

function assertDeclaredSize(request: Request): void {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_IPN_BODY_BYTES) throw bodyTooLarge()
}

async function readLimitedText(request: Request): Promise<string> {
  assertDeclaredSize(request)
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  let chunk = await reader.read()
  while (!chunk.done) {
    total += chunk.value.byteLength
    if (total > MAX_IPN_BODY_BYTES) {
      await reader.cancel().catch(() => undefined)
      throw bodyTooLarge()
    }
    chunks.push(chunk.value)
    chunk = await reader.read()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const part of chunks) {
    bytes.set(part, offset)
    offset += part.byteLength
  }
  return decodeUtf8(bytes)
}

export async function readIpnNotification(request: Request): Promise<IpnNotification> {
  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  if (contentType.includes('multipart/form-data')) {
    assertDeclaredSize(request)
    return parseIpnNotification(await request.formData())
  }
  const body = await readLimitedText(request)
  if (body.trim() === '') {
    return parseIpnNotification(new URL(request.url).searchParams)
  }
  return parseIpnNotification(body)
}

export function ipnOkResponse(): Response {
  return new Response('OK', {
    status: 200,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  })
}
