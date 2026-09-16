import type { AgentAction } from './actions'
import { decodeUtf8, isPdf } from './binary'
import { createAgentError, parseErrorCode, SzamlazzError } from './errors'
import { childNumber, childText, parseXml, type XmlElement } from './xml/parse'

export interface AgentResponse {
  readonly action: AgentAction
  readonly status: number
  readonly headers: Headers
  readonly body: Uint8Array
  readonly isPdf: boolean
  text(): string
}

export function createAgentResponse(
  action: AgentAction,
  status: number,
  headers: Headers,
  body: Uint8Array,
): AgentResponse {
  let cachedText: string | undefined
  return {
    action,
    status,
    headers,
    body,
    isPdf: isPdf(body),
    text() {
      cachedText ??= decodeUtf8(body)
      return cachedText
    },
  }
}

export function decodeHeaderValue(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '))
  } catch {
    return value
  }
}

export function readHeader(headers: Headers, name: string, encoded = false): string | undefined {
  const raw = headers.get(name)
  if (raw === null) return undefined
  const value = (encoded ? decodeHeaderValue(raw) : raw).trim()
  return value === '' ? undefined : value
}

function readNumberHeader(headers: Headers, name: string): number | undefined {
  const value = readHeader(headers, name)
  if (value === undefined) return undefined
  const parsed = Number(value.replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : undefined
}

export interface DocumentHeaders {
  readonly number?: string | undefined
  readonly netTotal?: number | undefined
  readonly grossTotal?: number | undefined
  readonly paymentMethod?: string | undefined
  readonly buyerAccountUrl?: string | undefined
}

export function readDocumentHeaders(headers: Headers): DocumentHeaders {
  return {
    number: readHeader(headers, 'szlahu_szamlaszam', true),
    netTotal: readNumberHeader(headers, 'szlahu_nettovegosszeg'),
    grossTotal: readNumberHeader(headers, 'szlahu_bruttovegosszeg'),
    paymentMethod: readHeader(headers, 'szlahu_fizetesmod', true),
    buyerAccountUrl: readHeader(headers, 'szlahu_vevoifiokurl', true),
  }
}

const RAW_RESPONSE_PREVIEW_LENGTH = 2000

function rawPreview(response: AgentResponse): string | undefined {
  if (response.isPdf) return undefined
  return response.text().slice(0, RAW_RESPONSE_PREVIEW_LENGTH)
}

export function throwIfHeaderError(response: AgentResponse): void {
  const message = readHeader(response.headers, 'szlahu_error', true)
  const code = parseErrorCode(response.headers.get('szlahu_error_code'))
  if (message === undefined && code === undefined) return
  throw createAgentError({
    code,
    message,
    action: response.action,
    httpStatus: response.status,
    rawResponse: rawPreview(response),
  })
}

export interface TextError {
  readonly code: number | undefined
  readonly message: string
}

export function extractTextError(text: string): TextError | undefined {
  const start = text.indexOf('[ERR]')
  if (start === -1) return undefined
  const afterMarker = text.slice(start + 5)
  const separator = afterMarker.search(/-{5,}/)
  const message = (
    separator === -1 ? (afterMarker.split('\n')[0] ?? '') : afterMarker.slice(0, separator)
  )
    .replace(/\s+/g, ' ')
    .trim()
  const codeMatch = /^\[?(\d{1,4})\]?\s+/.exec(message)
  if (codeMatch?.[1]) {
    return { code: Number(codeMatch[1]), message: message.slice(codeMatch[0].length) }
  }
  return { code: undefined, message }
}

export function throwIfTextError(response: AgentResponse): void {
  if (response.isPdf) return
  const text = response.text().trimStart()
  if (!text.startsWith('[ERR]')) return
  const error = extractTextError(text)
  if (!error) return
  throw createAgentError({
    code: error.code,
    message: error.message,
    action: response.action,
    httpStatus: response.status,
    rawResponse: rawPreview(response),
  })
}

export function parseDoneText(text: string): { readonly number: string | undefined } | undefined {
  const match = /xmlagentresponse\s*=\s*DONE(?:;([^\r\n]*))?/i.exec(text)
  if (!match) return undefined
  const number = match[1]?.trim()
  return { number: number ? decodeHeaderValue(number) : undefined }
}

export function unexpectedResponse(response: AgentResponse, detail?: string): SzamlazzError {
  const suffix = detail ? ` ${detail}` : ''
  return new SzamlazzError(
    `Váratlan válasz a Számlázz.hu-tól (HTTP ${response.status}).${suffix}`,
    {
      category: 'unexpected_response',
      action: response.action,
      httpStatus: response.status,
      rawResponse: rawPreview(response),
    },
  )
}

export function looksLikeXml(response: AgentResponse): boolean {
  if (response.isPdf) return false
  const text = response.text()
  return /^\s*</.test(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text)
}

export function parseResponseXml(response: AgentResponse): XmlElement {
  if (!looksLikeXml(response)) throw unexpectedResponse(response, 'XML választ vártunk.')
  try {
    return parseXml(response.text())
  } catch (error) {
    throw new SzamlazzError(
      `A Számlázz.hu XML válasza nem értelmezhető (HTTP ${response.status}).`,
      {
        category: 'unexpected_response',
        action: response.action,
        httpStatus: response.status,
        rawResponse: rawPreview(response),
        cause: error,
      },
    )
  }
}

export function throwIfXmlFailure(root: XmlElement, response: AgentResponse): void {
  const success = childText(root, 'sikeres')?.toLowerCase()
  const code = childNumber(root, 'hibakod')
  const message = childText(root, 'hibauzenet')
  if (success === 'true' && code === undefined) return
  if (success === undefined && code === undefined && message === undefined) return
  throw createAgentError({
    code,
    message,
    action: response.action,
    httpStatus: response.status,
    rawResponse: rawPreview(response),
  })
}

export function throwIfHttpError(response: AgentResponse): void {
  if (response.status >= 200 && response.status < 400) return
  const error = unexpectedResponse(response)
  if (response.status >= 500) {
    throw new SzamlazzError(error.message, {
      category: 'network',
      action: response.action,
      httpStatus: response.status,
      rawResponse: error.rawResponse,
    })
  }
  throw error
}

export function throwIfAnyError(response: AgentResponse): void {
  throwIfHeaderError(response)
  throwIfTextError(response)
  throwIfHttpError(response)
}
