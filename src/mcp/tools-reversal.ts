import { isUncertainOutcome, recoverAfterFailure } from '../core/once'
import type { InvoiceDetails } from '../invoices/get'
import type { Receipt } from '../receipts/types'
import { assertKnownKeys, optionalEnum, requiredString, ToolInputError } from './arguments'
import type { JsonObject } from './protocol'
import { CONFIRMATION_PROPERTY, objectSchema, TEXT_PROPERTY } from './schemas'
import {
  lines,
  type McpTool,
  type McpToolContext,
  type McpToolOutput,
  money,
  REMOTE_READ,
  REMOTE_REVERSE,
} from './tool-kit'

export const PREVIEW_REVERSAL = 'preview_reversal'
export const REVERSE_INVOICE = 'reverse_invoice'
export const REVERSE_RECEIPT = 'reverse_receipt'

const DOCUMENT_KINDS = ['invoice', 'receipt'] as const
const ALREADY_REVERSED_MESSAGE = 'már sztornózták'

function assertReversibleInvoice(details: InvoiceDetails): void {
  const { number, type } = details.header
  if (type === 'reversal')
    throw new ToolInputError(`A(z) ${number} sztornó számla, nem sztornózható.`)
  if (type === 'proforma') {
    throw new ToolInputError(
      `A(z) ${number} díjbekérő, nem sztornózható. Díjbekérőt a Számlázz.hu felületén vagy a kassza deleteProforma függvényével lehet törölni.`,
    )
  }
  if (type === 'deliveryNote') {
    throw new ToolInputError(`A(z) ${number} szállítólevél, nem sztornózható.`)
  }
}

function assertReversibleReceipt(receipt: Receipt): void {
  if (receipt.type === 'reversal') {
    throw new ToolInputError(`A(z) ${receipt.number} sztornónyugta, nem sztornózható.`)
  }
}

async function previewInvoiceReversal(
  number: string,
  context: McpToolContext,
): Promise<McpToolOutput> {
  const details = await context.client().invoices.get(number, { includePdf: false })
  assertReversibleInvoice(details)
  if (details.header.reversed === true) {
    throw new ToolInputError(`A(z) ${number} számlát már sztornózták.`)
  }
  const confirmation = await context.confirmations.issue(REVERSE_INVOICE, { invoiceNumber: number })
  const currency = details.header.currency ?? 'HUF'
  return {
    summary: lines(
      `Sztornó előnézete (még NEM készült el): a(z) ${number} számla sztornózása. Vevő: ${details.buyer.name}, bruttó ${money(details.totals.grossAmount, currency)}, kelt: ${details.header.issueDate}.`,
      `Mutasd meg a felhasználónak. Ha jóváhagyja, hívd meg a ${REVERSE_INVOICE} eszközt az invoiceNumber mezőben a számlaszámmal, a confirmation mezőben ezzel a kóddal: ${confirmation.token} (lejár: ${confirmation.expiresAt}).`,
    ),
    data: {
      document: 'invoice',
      number,
      buyer: details.buyer.name,
      issueDate: details.header.issueDate,
      grossTotal: details.totals.grossAmount,
      currency,
      confirmation: confirmation.token,
      confirmationExpiresAt: confirmation.expiresAt,
    },
  }
}

async function previewReceiptReversal(
  number: string,
  context: McpToolContext,
): Promise<McpToolOutput> {
  const receipt = await context.client().receipts.get({ receiptNumber: number, downloadPdf: false })
  assertReversibleReceipt(receipt)
  if (receipt.isReversed) throw new ToolInputError(`A(z) ${number} nyugtát már sztornózták.`)
  const confirmation = await context.confirmations.issue(REVERSE_RECEIPT, { receiptNumber: number })
  return {
    summary: lines(
      `Sztornó előnézete (még NEM készült el): a(z) ${number} nyugta sztornózása, bruttó ${money(receipt.totals.grossAmount, receipt.currency)}, kelt: ${receipt.issueDate}.`,
      `Mutasd meg a felhasználónak. Ha jóváhagyja, hívd meg a ${REVERSE_RECEIPT} eszközt a receiptNumber mezőben a nyugtaszámmal, a confirmation mezőben ezzel a kóddal: ${confirmation.token} (lejár: ${confirmation.expiresAt}).`,
    ),
    data: {
      document: 'receipt',
      number,
      issueDate: receipt.issueDate,
      grossTotal: receipt.totals.grossAmount,
      currency: receipt.currency,
      confirmation: confirmation.token,
      confirmationExpiresAt: confirmation.expiresAt,
    },
  }
}

async function previewReversal(args: JsonObject, context: McpToolContext): Promise<McpToolOutput> {
  assertKnownKeys(args, ['document', 'number'], '')
  const document = optionalEnum(args, 'document', '', DOCUMENT_KINDS)
  if (document === undefined) {
    throw new ToolInputError('A document mező kötelező: invoice (számla) vagy receipt (nyugta).')
  }
  const number = requiredString(args, 'number', '')
  return document === 'invoice'
    ? previewInvoiceReversal(number, context)
    : previewReceiptReversal(number, context)
}

function reversalOutput(
  document: 'invoice' | 'receipt',
  reversedNumber: string,
  number: string | undefined,
  created: boolean,
): McpToolOutput {
  const label = document === 'invoice' ? 'számla' : 'nyugta'
  const summary = created
    ? `A(z) ${reversedNumber} ${label} sztornózva${number === undefined ? '' : `, sztornó: ${number}`}.`
    : `A(z) ${reversedNumber} ${label} már sztornózva volt${number === undefined ? '' : ` (sztornó: ${number})`}, nem sztornóztam újra.`
  return { summary, data: { created, document, reversedNumber, number } }
}

async function reverseInvoice(args: JsonObject, context: McpToolContext): Promise<McpToolOutput> {
  assertKnownKeys(args, ['invoiceNumber', 'confirmation'], '')
  const invoiceNumber = requiredString(args, 'invoiceNumber', '')
  await context.confirmations.verify(
    REVERSE_INVOICE,
    { invoiceNumber },
    args.confirmation,
    PREVIEW_REVERSAL,
  )
  const kassza = context.client()
  const externalId = `${invoiceNumber}/SS`
  const lookup = (): Promise<InvoiceDetails | null> =>
    kassza.invoices.find({ externalId }, { includePdf: false })
  const existing = await lookup()
  if (existing) return reversalOutput('invoice', invoiceNumber, existing.header.number, false)
  const original = await kassza.invoices.get(invoiceNumber, { includePdf: false })
  assertReversibleInvoice(original)
  if (original.header.reversed === true) {
    return reversalOutput('invoice', invoiceNumber, undefined, false)
  }
  try {
    const reversal = await kassza.invoices.reverse({
      invoiceNumber,
      externalId,
      downloadPdf: false,
    })
    return reversalOutput('invoice', invoiceNumber, reversal.number, true)
  } catch (error) {
    if (!isUncertainOutcome(error)) throw error
    const recovered = await recoverAfterFailure(lookup, context.recoveryDelayMs, undefined)
    if (!recovered) throw error
    return reversalOutput(
      'invoice',
      invoiceNumber,
      recovered.header.number,
      error.category !== 'duplicate',
    )
  }
}

async function reverseReceipt(args: JsonObject, context: McpToolContext): Promise<McpToolOutput> {
  assertKnownKeys(args, ['receiptNumber', 'confirmation'], '')
  const receiptNumber = requiredString(args, 'receiptNumber', '')
  await context.confirmations.verify(
    REVERSE_RECEIPT,
    { receiptNumber },
    args.confirmation,
    PREVIEW_REVERSAL,
  )
  const kassza = context.client()
  const original = await kassza.receipts.get({ receiptNumber, downloadPdf: false })
  assertReversibleReceipt(original)
  if (original.isReversed) return reversalOutput('receipt', receiptNumber, undefined, false)
  try {
    const reversal = await kassza.receipts.reverse({
      receiptNumber,
      callId: `${receiptNumber}/SN`,
      downloadPdf: false,
    })
    return reversalOutput('receipt', receiptNumber, reversal.number, true)
  } catch (error) {
    if (!isUncertainOutcome(error)) throw error
    const current = await kassza.receipts.get({ receiptNumber, downloadPdf: false })
    if (!current.isReversed) throw error
    const reversedElsewhere =
      error.category === 'duplicate' || error.message.includes(ALREADY_REVERSED_MESSAGE)
    return reversalOutput('receipt', receiptNumber, undefined, !reversedElsewhere)
  }
}

export const REVERSAL_TOOLS: readonly McpTool[] = [
  {
    name: PREVIEW_REVERSAL,
    title: 'Sztornó előnézete',
    description:
      'Lekéri a sztornózandó számlát vagy nyugtát, ellenőrzi, hogy sztornózható-e, és ad egy megerősítő kódot a reverse_invoice vagy reverse_receipt eszközhöz. Semmit nem sztornóz.',
    inputSchema: objectSchema(
      {
        document: {
          type: 'string',
          enum: [...DOCUMENT_KINDS],
          description: 'invoice (számla) vagy receipt (nyugta).',
        },
        number: { ...TEXT_PROPERTY, description: 'A számla- vagy nyugtaszám.' },
      },
      ['document', 'number'],
    ),
    annotations: REMOTE_READ,
    write: false,
    run: previewReversal,
  },
  {
    name: REVERSE_INVOICE,
    title: 'Számla sztornózása',
    description:
      'Sztornó számlát állít ki a megadott számlához. Csak a preview_reversal által adott megerősítő kóddal működik, és csak a felhasználó jóváhagyása után hívd. Egy számlát csak egyszer sztornóz.',
    inputSchema: objectSchema(
      { invoiceNumber: TEXT_PROPERTY, confirmation: CONFIRMATION_PROPERTY },
      ['invoiceNumber', 'confirmation'],
    ),
    annotations: REMOTE_REVERSE,
    write: true,
    run: reverseInvoice,
  },
  {
    name: REVERSE_RECEIPT,
    title: 'Nyugta sztornózása',
    description:
      'Sztornónyugtát állít ki a megadott nyugtához. Csak a preview_reversal által adott megerősítő kóddal működik, és csak a felhasználó jóváhagyása után hívd. Egy nyugtát csak egyszer sztornóz.',
    inputSchema: objectSchema(
      { receiptNumber: TEXT_PROPERTY, confirmation: CONFIRMATION_PROPERTY },
      ['receiptNumber', 'confirmation'],
    ),
    annotations: REMOTE_REVERSE,
    write: true,
    run: reverseReceipt,
  },
]
