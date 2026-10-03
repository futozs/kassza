import { toBudapestDate } from '../core/dates'
import { isSzamlazzError, SzamlazzError } from '../core/errors'
import { summarizeItems } from '../money/items'
import { buildCreateReceiptXml, calculateReceiptItems } from '../receipts/create'
import type { CreateReceiptInput, Receipt } from '../receipts/types'
import { idempotencyKey } from './confirmation'
import { receiptInputOf } from './inputs'
import type { JsonObject } from './protocol'
import { CREATE_RECEIPT_SCHEMA, RECEIPT_SCHEMA } from './schemas'
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

export const PREVIEW_RECEIPT = 'preview_receipt'
export const CREATE_RECEIPT = 'create_receipt'

const DUPLICATE_CALL_ID = 338

interface ReceiptPreview {
  readonly data: JsonObject
  readonly currency: string
  readonly grossAmount: number
}

function previewOf(input: CreateReceiptInput, context: McpToolContext): ReceiptPreview {
  const defaults = context.defaults.receipt ?? {}
  buildCreateReceiptXml([], defaults, input)
  const currency = input.currency ?? defaults.currency ?? 'HUF'
  const items = calculateReceiptItems(input.items, currency)
  const totals = summarizeItems(items.map((item) => item.amounts))
  return {
    currency,
    grossAmount: totals.grossAmount,
    data: {
      document: 'receipt',
      prefix: input.prefix ?? defaults.prefix,
      paymentMethod: input.paymentMethod ?? defaults.paymentMethod,
      currency,
      exchangeRate: input.exchangeRate ?? defaults.exchangeRate,
      orderNumber: input.orderNumber,
      comment: input.comment,
      items: items.map((item) => ({
        name: item.input.name,
        quantity: item.amounts.quantity,
        unit: item.input.unit ?? defaults.unit ?? 'db',
        netUnitPrice: item.amounts.netUnitPrice,
        vat: item.vat,
        netAmount: item.amounts.netAmount,
        vatAmount: item.amounts.vatAmount,
        grossAmount: item.amounts.grossAmount,
      })),
      payments: input.payments ?? [],
      totals: {
        netAmount: totals.netAmount,
        vatAmount: totals.vatAmount,
        grossAmount: totals.grossAmount,
      },
    },
  }
}

async function previewReceipt(args: JsonObject, context: McpToolContext): Promise<McpToolOutput> {
  const preview = previewOf(receiptInputOf(args), context)
  const confirmation = await context.confirmations.issue(CREATE_RECEIPT, args)
  return {
    summary: lines(
      `Nyugta előnézete (még NEM készült el): bruttó ${money(preview.grossAmount, preview.currency)}.`,
      `Mutasd meg az előnézetet a felhasználónak. Ha jóváhagyja, hívd meg a ${CREATE_RECEIPT} eszközt pontosan ugyanezekkel az adatokkal, a confirmation mezőben ezzel a kóddal: ${confirmation.token} (lejár: ${confirmation.expiresAt}).`,
    ),
    data: {
      ...preview.data,
      confirmation: confirmation.token,
      confirmationExpiresAt: confirmation.expiresAt,
    },
  }
}

function receiptOutput(receipt: Receipt, created: boolean): McpToolOutput {
  const total = money(receipt.totals.grossAmount, receipt.currency)
  return {
    summary: created
      ? `Nyugta kiállítva: ${receipt.number} (bruttó ${total}).`
      : `Ehhez a rendelésszámhoz már létezik nyugta: ${receipt.number} (bruttó ${total}). Nem állítottam ki újra.`,
    data: {
      created,
      number: receipt.number,
      type: receipt.type,
      orderNumber: receipt.orderNumber,
      callId: receipt.callId,
      issueDate: receipt.issueDate,
      grossTotal: receipt.totals.grossAmount,
      currency: receipt.currency,
    },
  }
}

function duplicateCallIdError(error: SzamlazzError, callId: string): SzamlazzError {
  return new SzamlazzError(
    `Ezekkel az adatokkal ma már készült nyugta ezen az eszközön keresztül (hívásazonosító: ${callId}), ezért nem készült új.`,
    {
      category: 'duplicate',
      code: error.code,
      action: error.action,
      hint: 'A Számla Agent hívásazonosító alapján nem tud nyugtát lekérdezni: a nyugtát a Számlázz.hu felületén találod. Ha valóban még egy ugyanilyen nyugta kell, adj meg rendelésszámot (orderNumber), vagy változtass az adatokon.',
      cause: error,
    },
  )
}

async function createReceipt(args: JsonObject, context: McpToolContext): Promise<McpToolOutput> {
  const { payload, confirmation } = splitConfirmation(args)
  await context.confirmations.verify(CREATE_RECEIPT, payload, confirmation, PREVIEW_RECEIPT)
  const input = receiptInputOf(payload)
  previewOf(input, context)
  const day = toBudapestDate(context.now())
  const callId = `MCP-${await idempotencyKey(CREATE_RECEIPT, day, payload)}`
  const kassza = context.client()
  if (input.orderNumber !== undefined) {
    const result = await kassza.receipts.createOnce(
      { ...input, callId },
      { recoveryDelayMs: context.recoveryDelayMs },
    )
    return receiptOutput(result.receipt, result.created)
  }
  try {
    return receiptOutput(await kassza.receipts.create({ ...input, callId }), true)
  } catch (error) {
    if (isSzamlazzError(error) && error.code === DUPLICATE_CALL_ID) {
      throw duplicateCallIdError(error, callId)
    }
    throw error
  }
}

export const RECEIPT_TOOLS: readonly McpTool[] = [
  {
    name: PREVIEW_RECEIPT,
    title: 'Nyugta előnézete',
    description:
      'Kiszámolja egy nyugta tételeit és végösszegét a Számlázz.hu hívása nélkül, ellenőrzi a forintos kerekítési szabályokat, és ad egy megerősítő kódot a create_receipt eszközhöz. Semmit nem állít ki.',
    inputSchema: RECEIPT_SCHEMA,
    annotations: LOCAL_READ,
    write: false,
    run: previewReceipt,
  },
  {
    name: CREATE_RECEIPT,
    title: 'Nyugta kiállítása',
    description:
      'Kiállítja a nyugtát a Számlázz.hu-n. Csak a preview_receipt által adott megerősítő kóddal működik, és csak akkor hívd, ha a felhasználó jóváhagyta az előnézetet. Rendelésszámmal egy rendeléshez csak egy nyugta készül.',
    inputSchema: CREATE_RECEIPT_SCHEMA,
    annotations: REMOTE_CREATE,
    write: true,
    run: createReceipt,
  },
]
