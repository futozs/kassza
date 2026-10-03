import { isUncertainOutcome, recoverAfterFailure } from '../core/once'
import { type ResolvedInvoice, resolveInvoice } from '../invoices/create-resolve'
import type { CreateInvoiceInput } from '../invoices/create-types'
import type { InvoiceDetails } from '../invoices/get'
import { summarizeItems } from '../money/items'
import { idempotencyKey } from './confirmation'
import { invoiceInputOf } from './inputs'
import type { JsonObject } from './protocol'
import { CREATE_INVOICE_SCHEMA, INVOICE_SCHEMA } from './schemas'
import {
  LOCAL_READ,
  lines,
  type McpTool,
  type McpToolContext,
  type McpToolOutput,
  money,
  REMOTE_CREATE,
  splitConfirmation,
} from './tool-kit'

export const PREVIEW_INVOICE = 'preview_invoice'
export const CREATE_INVOICE = 'create_invoice'

function documentLabel(resolved: ResolvedInvoice): string {
  return resolved.type === 'proforma' ? 'Díjbekérő' : 'Számla'
}

function resolve(input: CreateInvoiceInput, context: McpToolContext): ResolvedInvoice {
  return resolveInvoice(context.defaults.invoice ?? {}, input, context.now())
}

function previewData(input: CreateInvoiceInput, resolved: ResolvedInvoice): JsonObject {
  const totals = summarizeItems(resolved.items.map((item) => item.amounts))
  return {
    document: resolved.type,
    buyer: input.buyer,
    issueDate: resolved.issueDate,
    fulfillmentDate: resolved.fulfillmentDate,
    dueDate: resolved.dueDate,
    paymentMethod: resolved.paymentMethod,
    currency: resolved.currency,
    exchangeRate: resolved.exchangeRate,
    exchangeBank: resolved.exchangeBank,
    language: resolved.language,
    prefix: resolved.prefix,
    eInvoice: resolved.eInvoice,
    sendEmail: resolved.sendEmail,
    orderNumber: input.orderNumber,
    comment: input.comment,
    items: resolved.items.map((item) => ({
      name: item.input.name,
      quantity: item.amounts.quantity,
      unit: item.unit,
      netUnitPrice: item.amounts.netUnitPrice,
      vat: item.amounts.vat,
      netAmount: item.amounts.netAmount,
      vatAmount: item.amounts.vatAmount,
      grossAmount: item.amounts.grossAmount,
    })),
    totals: {
      netAmount: totals.netAmount,
      vatAmount: totals.vatAmount,
      grossAmount: totals.grossAmount,
    },
  }
}

async function previewInvoice(args: JsonObject, context: McpToolContext): Promise<McpToolOutput> {
  const input = invoiceInputOf(args)
  const resolved = resolve(input, context)
  const data = previewData(input, resolved)
  const totals = summarizeItems(resolved.items.map((item) => item.amounts))
  const confirmation = await context.confirmations.issue(CREATE_INVOICE, args)
  return {
    summary: lines(
      `${documentLabel(resolved)} előnézete (még NEM készült el): ${input.buyer.name}, nettó ${money(totals.netAmount, resolved.currency)}, bruttó ${money(totals.grossAmount, resolved.currency)}.`,
      `Kelt: ${resolved.issueDate}, teljesítés: ${resolved.fulfillmentDate}, fizetési határidő: ${resolved.dueDate}, fizetési mód: ${resolved.paymentMethod}.`,
      resolved.sendEmail
        ? 'A Számlázz.hu e-mailben elküldi a vevőnek.'
        : 'A vevő nem kap e-mailt a Számlázz.hu-tól.',
      `Mutasd meg az előnézetet a felhasználónak. Ha jóváhagyja, hívd meg a ${CREATE_INVOICE} eszközt pontosan ugyanezekkel az adatokkal, a confirmation mezőben ezzel a kóddal: ${confirmation.token} (lejár: ${confirmation.expiresAt}).`,
    ),
    data: {
      ...data,
      confirmation: confirmation.token,
      confirmationExpiresAt: confirmation.expiresAt,
    },
  }
}

function existingOutput(
  details: InvoiceDetails,
  externalId: string,
  created: boolean,
): McpToolOutput {
  const currency = details.header.currency ?? 'HUF'
  return {
    summary: created
      ? `Kiállítva: ${details.header.number} (bruttó ${money(details.totals.grossAmount, currency)}). A válasz elveszett, de a kassza visszakereste.`
      : `Ezzel a külső azonosítóval (${externalId}) már létezik bizonylat: ${details.header.number} (bruttó ${money(details.totals.grossAmount, currency)}). Nem állítottam ki újra. Ha valóban még egy ugyanilyen kell, adj meg eltérő externalId értéket.`,
    data: {
      created,
      number: details.header.number,
      externalId,
      netTotal: details.totals.netAmount,
      grossTotal: details.totals.grossAmount,
      currency,
    },
  }
}

async function createInvoice(args: JsonObject, context: McpToolContext): Promise<McpToolOutput> {
  const { payload, confirmation } = splitConfirmation(args)
  await context.confirmations.verify(CREATE_INVOICE, payload, confirmation, PREVIEW_INVOICE)
  const input = invoiceInputOf(payload)
  const resolved = resolve(input, context)
  const externalId =
    input.externalId ?? `MCP-${await idempotencyKey(CREATE_INVOICE, resolved.issueDate, payload)}`
  const kassza = context.client()
  const lookup = (): Promise<InvoiceDetails | null> =>
    kassza.invoices.find({ externalId }, { includePdf: false })
  const existing = await lookup()
  if (existing) return existingOutput(existing, externalId, false)
  try {
    const created = await kassza.invoices.create({
      ...input,
      externalId,
      issueDate: resolved.issueDate,
      fulfillmentDate: resolved.fulfillmentDate,
      dueDate: resolved.dueDate,
    })
    return {
      summary: `${documentLabel(resolved)} kiállítva: ${created.number} (bruttó ${money(created.grossTotal, resolved.currency)}).`,
      data: {
        created: true,
        number: created.number,
        externalId,
        netTotal: created.netTotal,
        grossTotal: created.grossTotal,
        outstanding: created.outstanding,
        currency: resolved.currency,
      },
    }
  } catch (error) {
    if (!isUncertainOutcome(error)) throw error
    const recovered = await recoverAfterFailure(lookup, context.recoveryDelayMs, undefined)
    if (!recovered) throw error
    return existingOutput(recovered, externalId, error.category !== 'duplicate')
  }
}

export const INVOICE_TOOLS: readonly McpTool[] = [
  {
    name: PREVIEW_INVOICE,
    title: 'Számla előnézete',
    description:
      'Kiszámolja egy számla vagy díjbekérő tételeit és végösszegét a Számlázz.hu hívása nélkül, és ad egy megerősítő kódot a create_invoice eszközhöz. Semmit nem állít ki.',
    inputSchema: INVOICE_SCHEMA,
    annotations: LOCAL_READ,
    write: false,
    run: previewInvoice,
  },
  {
    name: CREATE_INVOICE,
    title: 'Számla kiállítása',
    description:
      'Kiállítja a számlát vagy díjbekérőt a Számlázz.hu-n. Csak a preview_invoice által adott megerősítő kóddal működik, és csak akkor hívd, ha a felhasználó jóváhagyta az előnézetet. Ugyanazzal a kéréssel naponta csak egy bizonylat készül.',
    inputSchema: CREATE_INVOICE_SCHEMA,
    annotations: REMOTE_CREATE,
    write: true,
    run: createInvoice,
  },
]
