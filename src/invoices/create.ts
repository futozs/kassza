import type { AgentContext, AgentRequest, RequestOptions } from '../core/context'
import { type ResolvedInvoice, resolveInvoice } from './create-resolve'
import { parseCreateInvoiceResponse, parseInvoicePreviewResponse } from './create-response'
import type {
  CreatedInvoice,
  CreatedInvoiceItem,
  CreateInvoiceInput,
  InvoiceDefaults,
  InvoicePreview,
} from './create-types'
import { renderInvoiceXml } from './create-xml'

export { parseCreateInvoiceResponse, parseInvoicePreviewResponse } from './create-response'
export { buildCreateInvoiceXml } from './create-xml'

function buildRequest(
  ctx: AgentContext,
  invoice: ResolvedInvoice,
  preview: boolean,
  options: RequestOptions,
): AgentRequest {
  const xml = renderInvoiceXml(ctx.credentials, invoice, { preview })
  const attachments = preview ? [] : invoice.attachments
  return {
    action: 'createInvoice',
    xml,
    signal: options.signal,
    ...(attachments.length > 0 ? { attachments } : {}),
  }
}

function itemsOf(invoice: ResolvedInvoice): CreatedInvoiceItem[] {
  return invoice.items.map((item) => item.amounts)
}

export async function createInvoice(
  ctx: AgentContext,
  defaults: InvoiceDefaults,
  input: CreateInvoiceInput,
  options: RequestOptions = {},
): Promise<CreatedInvoice> {
  const invoice = resolveInvoice(defaults, input, new Date())
  const items = itemsOf(invoice)
  return ctx.execute(buildRequest(ctx, invoice, false, options), (response) =>
    parseCreateInvoiceResponse(response, items),
  )
}

export async function previewInvoice(
  ctx: AgentContext,
  defaults: InvoiceDefaults,
  input: CreateInvoiceInput,
  options: RequestOptions = {},
): Promise<InvoicePreview> {
  const invoice = resolveInvoice(defaults, input, new Date())
  const items = itemsOf(invoice)
  return ctx.execute(buildRequest(ctx, invoice, true, options), (response) =>
    parseInvoicePreviewResponse(response, items),
  )
}
