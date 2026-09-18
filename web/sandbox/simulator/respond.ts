import { AGENT_ERROR_CODES, bytesToBase64 } from 'kassza'
import type { ResponseKind } from './types'
import { renderDocument, type XmlTree } from './xml'

export interface SimResponse {
  readonly status: number
  readonly headers: readonly (readonly [string, string])[]
  readonly body: Uint8Array
  readonly kind: ResponseKind
  readonly effects: readonly string[]
}

const encoder = new TextEncoder()

export class AgentFault extends Error {
  readonly code: number | undefined

  constructor(code: number | undefined, message?: string) {
    super(
      message ??
        (code === undefined
          ? 'Ismeretlen hiba.'
          : (AGENT_ERROR_CODES[code]?.message ?? 'Ismeretlen hiba.')),
    )
    this.code = code
  }
}

export function xmlResponse(
  root: string,
  namespace: string,
  content: readonly (XmlTree | false | undefined)[],
  options: { headers?: readonly (readonly [string, string])[]; effects?: readonly string[] } = {},
): SimResponse {
  return {
    status: 200,
    headers: [['content-type', 'application/xml; charset=UTF-8'], ...(options.headers ?? [])],
    body: encoder.encode(renderDocument(root, namespace, content)),
    kind: 'xml',
    effects: options.effects ?? [],
  }
}

export function errorHeaders(fault: AgentFault): (readonly [string, string])[] {
  const headers: (readonly [string, string])[] = [
    ['szlahu_error', encodeURIComponent(fault.message)],
  ]
  if (fault.code !== undefined) headers.push(['szlahu_error_code', String(fault.code)])
  return headers
}

export function xmlErrorResponse(root: string, namespace: string, fault: AgentFault): SimResponse {
  return xmlResponse(
    root,
    namespace,
    [
      ['sikeres', false],
      ['hibakod', fault.code ?? ''],
      ['hibauzenet', fault.message],
    ],
    { headers: errorHeaders(fault) },
  )
}

export function textErrorResponse(fault: AgentFault): SimResponse {
  const code = fault.code === undefined ? '' : `[${fault.code}] `
  return {
    status: 200,
    headers: [['content-type', 'text/plain; charset=UTF-8'], ...errorHeaders(fault)],
    body: encoder.encode(`[ERR] ${code}${fault.message}`),
    kind: 'text',
    effects: [],
  }
}

export function htmlErrorResponse(status: number): SimResponse {
  return {
    status,
    headers: [['content-type', 'text/html; charset=UTF-8']],
    body: encoder.encode(
      `<!doctype html><html><head><title>${status} Bad Gateway</title></head><body><h1>${status} Bad Gateway</h1></body></html>`,
    ),
    kind: 'html',
    effects: [],
  }
}

export function pdfElement(pdf: Uint8Array | undefined): XmlTree | undefined {
  return pdf ? ['pdf', bytesToBase64(pdf)] : undefined
}

export function money(value: number): number {
  return Math.round(value * 100) / 100
}

const hufFormatter = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 2 })

export function formatAmount(value: number, currency: string): string {
  const label = currency === 'HUF' || currency === 'Ft' ? 'Ft' : currency
  return `${hufFormatter.format(value)} ${label}`
}
