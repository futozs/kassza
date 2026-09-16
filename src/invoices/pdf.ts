import type { AgentContext, RequestOptions } from '../core/context'
import { type AgentResponse, unexpectedResponse } from '../core/response'
import { buildXmlDocument, el, optionalEl, type XmlNode } from '../core/xml/serialize'
import {
  AGENT_XSD_BASE_URL,
  type InvoiceReference,
  parseInvoiceResult,
  RESPONSE_VERSION_XML,
  referenceValue,
  resolveInvoiceReference,
} from './reference'

export interface InvoicePdf {
  readonly pdf: Uint8Array
  readonly number?: string | undefined
  readonly netTotal?: number | undefined
  readonly grossTotal?: number | undefined
  readonly outstanding?: number | undefined
  readonly buyerAccountUrl?: string | undefined
}

export function buildInvoicePdfXml(
  credentials: readonly XmlNode[],
  reference: InvoiceReference,
): string {
  const resolved = resolveInvoiceReference(reference)
  return buildXmlDocument({
    root: 'xmlszamlapdf',
    namespace: 'http://www.szamlazz.hu/xmlszamlapdf',
    schemaLocation: `${AGENT_XSD_BASE_URL}agentpdf/xmlszamlapdf.xsd`,
    children: [
      ...credentials,
      optionalEl('szamlaszam', referenceValue(resolved, 'invoiceNumber')),
      optionalEl('rendelesSzam', referenceValue(resolved, 'orderNumber')),
      el('valaszVerzio', RESPONSE_VERSION_XML),
      optionalEl('szamlaKulsoAzon', referenceValue(resolved, 'externalId')),
    ],
  })
}

export function parseInvoicePdfResponse(response: AgentResponse): InvoicePdf {
  const { pdf, ...rest } = parseInvoiceResult(response)
  if (pdf === undefined || pdf.length === 0) {
    throw unexpectedResponse(response, 'A válasz nem tartalmaz PDF-et.')
  }
  return { ...rest, pdf }
}

export async function getInvoicePdf(
  ctx: AgentContext,
  reference: InvoiceReference,
  options: RequestOptions = {},
): Promise<InvoicePdf> {
  const xml = buildInvoicePdfXml(ctx.credentials, reference)
  return ctx.execute(
    { action: 'getInvoicePdf', xml, signal: options.signal, safeToRetry: true },
    parseInvoicePdfResponse,
  )
}
