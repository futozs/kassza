import type { AgentContext, RequestOptions } from '../core/context'
import { SzamlazzError } from '../core/errors'
import { buildXmlDocument, el, optionalEl, type XmlNode } from '../core/xml/serialize'
import {
  calculateReceiptItem,
  decimalPlaces,
  type ItemAmounts,
  isHuf,
  roundMoney,
  type VatRate,
  vatPercentage,
} from '../money'
import {
  DEFAULT_RECEIPT_DOWNLOAD_PDF,
  optionalText,
  RECEIPT_XSD_BASE_URL,
  receiptValidationError,
  requireText,
  validateTemplate,
} from './common'
import { parseReceiptResponse } from './parse'
import {
  type CreateReceiptInput,
  RECEIPT_ONLY_VAT_CODES,
  type Receipt,
  type ReceiptDefaults,
  type ReceiptItemInput,
  type ReceiptPaymentInput,
  type ReceiptVatRate,
} from './types'

export const CREATE_RECEIPT_NAMESPACE = 'http://www.szamlazz.hu/xmlnyugtacreate'

const DEFAULT_CURRENCY = 'HUF'
const DEFAULT_UNIT = 'db'
const PREFIX_PATTERN = /^[A-Z0-9]+$/
const AMOUNT_TOLERANCE = 2
const MONEY_DECIMALS = 2

const receiptOnlyVatCodes: ReadonlySet<string> = new Set(RECEIPT_ONLY_VAT_CODES)

export interface CalculatedReceiptItem {
  readonly input: ReceiptItemInput
  readonly amounts: ItemAmounts
  readonly vat: ReceiptVatRate
}

function calculateItem(item: ReceiptItemInput, currency: string, index: number): ItemAmounts {
  const isReceiptOnlyCode = typeof item.vat === 'string' && receiptOnlyVatCodes.has(item.vat)
  const vat: VatRate = isReceiptOnlyCode ? 0 : (item.vat as VatRate)
  try {
    return calculateReceiptItem({ ...item, vat }, currency)
  } catch (error) {
    if (!(error instanceof SzamlazzError)) throw error
    throw receiptValidationError(`${index + 1}. tétel (${item.name}): ${error.message}`)
  }
}

function assertHufAmounts(amounts: ItemAmounts, label: string, vat: ReceiptVatRate): void {
  if (!Number.isInteger(amounts.grossAmount)) {
    throw receiptValidationError(
      `${label}: forintos nyugtán a bruttó összegnek egész számnak kell lennie (363).`,
    )
  }
  if (decimalPlaces(amounts.netAmount) > MONEY_DECIMALS) {
    throw receiptValidationError(
      `${label}: forintos nyugtán a nettó összeg legfeljebb 2 tizedesjegyet tartalmazhat (364).`,
    )
  }
  if (decimalPlaces(amounts.vatAmount) > MONEY_DECIMALS) {
    throw receiptValidationError(
      `${label}: forintos nyugtán az áfa összeg legfeljebb 2 tizedesjegyet tartalmazhat (365).`,
    )
  }
  if (roundMoney(amounts.netAmount + amounts.vatAmount, MONEY_DECIMALS) !== amounts.grossAmount) {
    throw receiptValidationError(
      `${label}: a nettó és az áfa összegének pontosan ki kell adnia a bruttót (261).`,
    )
  }
  if (Math.abs(amounts.netUnitPrice * amounts.quantity - amounts.netAmount) > AMOUNT_TOLERANCE) {
    throw receiptValidationError(
      `${label}: a nettó egységár és a mennyiség szorzata nem egyezik a nettó összeggel (259).`,
    )
  }
  const expectedVat = (amounts.netAmount * vatPercentage(vat as VatRate)) / 100
  if (Math.abs(expectedVat - amounts.vatAmount) > AMOUNT_TOLERANCE) {
    throw receiptValidationError(
      `${label}: az áfa összeg nem egyezik a nettó összeg és az áfakulcs szorzatával (260).`,
    )
  }
}

export function calculateReceiptItems(
  items: readonly ReceiptItemInput[],
  currency: string,
): CalculatedReceiptItem[] {
  if (items.length === 0) {
    throw receiptValidationError('A nyugtán legalább egy tételnek szerepelnie kell.')
  }
  return items.map((input, index) => {
    requireText(input.name, `A(z) ${index + 1}. tétel megnevezése (name) kötelező.`)
    const amounts = calculateItem(input, currency, index)
    if (isHuf(currency)) assertHufAmounts(amounts, `${index + 1}. tétel (${input.name})`, input.vat)
    if (input.dataDeletionCode !== undefined) {
      if (!Number.isInteger(input.dataDeletionCode) || input.dataDeletionCode < 0) {
        throw receiptValidationError(
          `A(z) ${index + 1}. tétel adattörlő kódja (dataDeletionCode) nemnegatív egész szám legyen.`,
        )
      }
    }
    return { input, amounts, vat: input.vat }
  })
}

function formatAmount(value: number, currency: string, decimals: number): string | number {
  return isHuf(currency) ? value.toFixed(decimals) : value
}

function itemNode(item: CalculatedReceiptItem, currency: string, unit: string): XmlNode {
  const { input, amounts } = item
  const ledger = input.ledger
  return el('tetel', [
    el('megnevezes', input.name.trim()),
    optionalEl('azonosito', optionalText(input.identifier)),
    el('mennyiseg', amounts.quantity),
    el('mennyisegiEgyseg', optionalText(input.unit) ?? unit),
    el('nettoEgysegar', amounts.netUnitPrice),
    el('afakulcs', String(item.vat)),
    el('netto', formatAmount(amounts.netAmount, currency, MONEY_DECIMALS)),
    el('afa', formatAmount(amounts.vatAmount, currency, MONEY_DECIMALS)),
    el('brutto', formatAmount(amounts.grossAmount, currency, 0)),
    ledger &&
      optionalEl('fokonyv', [
        optionalEl('arbevetel', optionalText(ledger.revenue)),
        optionalEl('afa', optionalText(ledger.vat)),
      ]),
    optionalEl('megjegyzes', optionalText(input.comment)),
    optionalEl('torloKod', input.dataDeletionCode),
  ])
}

function paymentNodes(
  payments: readonly ReceiptPaymentInput[] | undefined,
  items: readonly CalculatedReceiptItem[],
): XmlNode | undefined {
  if (payments === undefined || payments.length === 0) return undefined
  const nodes = payments.map((payment, index) => {
    const method = requireText(
      payment.method,
      `A(z) ${index + 1}. kifizetés fizetési eszköze (method) kötelező.`,
    )
    if (!Number.isFinite(payment.amount)) {
      throw receiptValidationError(`A(z) ${index + 1}. kifizetés összege nem érvényes szám.`)
    }
    return el('kifizetes', [
      el('fizetoeszkoz', method),
      el('osszeg', payment.amount),
      optionalEl('leiras', optionalText(payment.description)),
    ])
  })
  const paid = roundMoney(
    payments.reduce((sum, payment) => sum + payment.amount, 0),
    MONEY_DECIMALS,
  )
  const gross = roundMoney(
    items.reduce((sum, item) => sum + item.amounts.grossAmount, 0),
    MONEY_DECIMALS,
  )
  if (paid !== gross) {
    throw receiptValidationError(
      `A kifizetések összege (${paid}) eltér a nyugta bruttó végösszegétől (${gross}) (340).`,
    )
  }
  return el('kifizetesek', nodes)
}

function resolvePrefix(value: string | undefined): string {
  const prefix = requireText(
    value,
    'Add meg a nyugta előtagját (prefix) a hívásban vagy a receipts alapbeállításaiban.',
  )
  if (!PREFIX_PATTERN.test(prefix)) {
    throw receiptValidationError(
      `A nyugta előtag csak nagybetűt és számot tartalmazhat, kapott: ${prefix} (337).`,
    )
  }
  return prefix
}

function resolveExchange(
  currency: string,
  rate: number | undefined,
  bank: string | undefined,
): { rate: number | undefined; bank: string | undefined } {
  if (isHuf(currency)) return { rate: undefined, bank: undefined }
  if (rate === undefined || !Number.isFinite(rate) || rate <= 0) {
    throw receiptValidationError(
      `Devizás nyugtánál (${currency}) add meg az árfolyamot (exchangeRate) pozitív számként.`,
    )
  }
  return {
    rate,
    bank: requireText(
      bank,
      `Devizás nyugtánál (${currency}) add meg az árfolyamot jegyző bankot (exchangeBank).`,
    ),
  }
}

export function buildCreateReceiptXml(
  credentials: readonly XmlNode[],
  defaults: ReceiptDefaults,
  input: CreateReceiptInput,
): string {
  const prefix = resolvePrefix(input.prefix ?? defaults.prefix)
  const paymentMethod = requireText(
    input.paymentMethod ?? defaults.paymentMethod,
    'Add meg a fizetési módot (paymentMethod) a hívásban vagy a receipts alapbeállításaiban.',
  )
  const currency = optionalText(input.currency ?? defaults.currency) ?? DEFAULT_CURRENCY
  const exchange = resolveExchange(
    currency,
    input.exchangeRate ?? defaults.exchangeRate,
    input.exchangeBank ?? defaults.exchangeBank,
  )
  const template = validateTemplate(input.template ?? defaults.template)
  const items = calculateReceiptItems(input.items ?? [], currency)
  const unit = optionalText(defaults.unit) ?? DEFAULT_UNIT
  const payments = paymentNodes(input.payments, items)
  const downloadPdf = input.downloadPdf ?? defaults.downloadPdf ?? DEFAULT_RECEIPT_DOWNLOAD_PDF

  return buildXmlDocument({
    root: 'xmlnyugtacreate',
    namespace: CREATE_RECEIPT_NAMESPACE,
    schemaLocation: `${RECEIPT_XSD_BASE_URL}nyugtacreate/xmlnyugtacreate.xsd`,
    children: [
      el('beallitasok', [...credentials, el('pdfLetoltes', downloadPdf)]),
      el('fejlec', [
        optionalEl('hivasAzonosito', optionalText(input.callId)),
        el('elotag', prefix),
        el('fizmod', paymentMethod),
        el('penznem', currency),
        optionalEl('devizaarf', exchange.rate),
        optionalEl('devizabank', exchange.bank),
        optionalEl('megjegyzes', optionalText(input.comment)),
        optionalEl('pdfSablon', template),
        optionalEl(
          'fokonyvVevo',
          optionalText(input.customerLedgerId ?? defaults.customerLedgerId),
        ),
        optionalEl('rendelesSzam', optionalText(input.orderNumber)),
      ]),
      el(
        'tetelek',
        items.map((item) => itemNode(item, currency, unit)),
      ),
      payments,
    ],
  })
}

const DUPLICATE_CALL_ID_CODE = 338

function enrichDuplicateError(error: unknown, input: CreateReceiptInput): unknown {
  if (!(error instanceof SzamlazzError) || error.code !== DUPLICATE_CALL_ID_CODE) return error
  const lookup = input.orderNumber
    ? ` A meglévő nyugtát a getReceipt({ orderNumber: '${input.orderNumber}' }) hívással kérdezheted le, ha a fiókban tiltva van a rendelésszám ismétlődése.`
    : ' A Számla Agent hívásazonosító alapján nem ad lekérdezési lehetőséget, ezért a meglévő nyugtát a Számlázz.hu felületén keresd meg, vagy adj meg rendelésszámot (orderNumber) is.'
  return new SzamlazzError(error.message, {
    category: 'duplicate',
    code: error.code,
    hint: `Ezzel a hívásazonosítóval (callId: ${input.callId ?? ''}) már készült nyugta, a nyugta nem jött létre újra.${lookup}`,
    action: error.action,
    httpStatus: error.httpStatus,
    rawResponse: error.rawResponse,
    cause: error,
  })
}

export async function createReceipt(
  ctx: AgentContext,
  defaults: ReceiptDefaults,
  input: CreateReceiptInput,
  options: RequestOptions = {},
): Promise<Receipt> {
  const xml = buildCreateReceiptXml(ctx.credentials, defaults, input)
  try {
    return await ctx.execute(
      {
        action: 'createReceipt',
        xml,
        signal: options.signal,
        safeToRetry: optionalText(input.callId) !== undefined,
      },
      parseReceiptResponse,
    )
  } catch (error) {
    throw enrichDuplicateError(error, input)
  }
}
