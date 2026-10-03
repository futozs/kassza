import type { InvoiceReference } from '../invoices/reference'
import type { Receipt } from '../receipts/types'
import { describeNavReport, navDailyReports } from '../reports/nav'
import {
  assertKnownKeys,
  optionalArray,
  optionalBoolean,
  optionalInteger,
  optionalString,
  requiredString,
  ToolInputError,
} from './arguments'
import type { JsonObject } from './protocol'
import { objectSchema, TEXT_PROPERTY } from './schemas'
import {
  lines,
  type McpTool,
  type McpToolContext,
  type McpToolOutput,
  money,
  plainJson,
  REMOTE_READ,
} from './tool-kit'

export const MAX_SUMMARY_RECEIPTS = 200

const INVOICE_TYPE_LABELS: Readonly<Record<string, string>> = {
  invoice: 'Számla',
  proforma: 'Díjbekérő',
  advance: 'Előlegszámla',
  final: 'Végszámla',
  corrective: 'Helyesbítő számla',
  reversal: 'Sztornó számla',
  deliveryNote: 'Szállítólevél',
}

function exactlyOne(values: Readonly<Record<string, string | undefined>>): string {
  const present = Object.entries(values).filter(([, value]) => value !== undefined)
  if (present.length !== 1) {
    throw new ToolInputError(
      `Pontosan egyet adj meg ezek közül: ${Object.keys(values).join(', ')}.`,
    )
  }
  return present[0]?.[0] ?? ''
}

async function getInvoice(args: JsonObject, context: McpToolContext): Promise<McpToolOutput> {
  assertKnownKeys(args, ['invoiceNumber', 'orderNumber', 'externalId'], '')
  const invoiceNumber = optionalString(args, 'invoiceNumber', '')
  const orderNumber = optionalString(args, 'orderNumber', '')
  const externalId = optionalString(args, 'externalId', '')
  const kind = exactlyOne({ invoiceNumber, orderNumber, externalId })
  const reference: InvoiceReference =
    kind === 'invoiceNumber'
      ? (invoiceNumber ?? '')
      : kind === 'orderNumber'
        ? { orderNumber: orderNumber ?? '' }
        : { externalId: externalId ?? '' }
  const details = await context.client().invoices.find(reference, { includePdf: false })
  if (!details) {
    return { summary: 'Nincs ilyen számla a Számlázz.hu fiókban.', data: { found: false } }
  }
  const { header } = details
  const currency = header.currency ?? 'HUF'
  return {
    summary: lines(
      `${INVOICE_TYPE_LABELS[header.type] ?? 'Bizonylat'} ${header.number}: ${details.buyer.name}, bruttó ${money(details.totals.grossAmount, currency)}, kelt: ${header.issueDate}.`,
      header.reversed === true && 'A számlát sztornózták.',
      header.test === true && 'Tesztfiókban készült.',
    ),
    data: { found: true, invoice: plainJson(details) },
  }
}

async function getReceipt(args: JsonObject, context: McpToolContext): Promise<McpToolOutput> {
  assertKnownKeys(args, ['receiptNumber', 'orderNumber'], '')
  const receiptNumber = optionalString(args, 'receiptNumber', '')
  const orderNumber = optionalString(args, 'orderNumber', '')
  const kind = exactlyOne({ receiptNumber, orderNumber })
  const receipt = await context
    .client()
    .receipts.find(
      kind === 'receiptNumber'
        ? { receiptNumber: receiptNumber ?? '', downloadPdf: false }
        : { orderNumber: orderNumber ?? '', downloadPdf: false },
    )
  if (!receipt) {
    return { summary: 'Nincs ilyen nyugta a Számlázz.hu fiókban.', data: { found: false } }
  }
  return {
    summary: lines(
      `${receipt.type === 'reversal' ? 'Sztornónyugta' : 'Nyugta'} ${receipt.number}: bruttó ${money(receipt.totals.grossAmount, receipt.currency)}, kelt: ${receipt.issueDate}.`,
      receipt.isReversed && 'A nyugtát sztornózták.',
      receipt.isTest && 'Tesztfiókban készült.',
    ),
    data: { found: true, receipt: plainJson(receipt) },
  }
}

async function queryTaxpayer(args: JsonObject, context: McpToolContext): Promise<McpToolOutput> {
  assertKnownKeys(args, ['taxNumber'], '')
  const taxNumber = requiredString(args, 'taxNumber', '')
  const info = await context.client().taxpayer.query(taxNumber)
  return {
    summary: info.valid
      ? lines(
          `${info.name ?? 'Ismeretlen név'}${info.taxNumber?.formatted ? ` (${info.taxNumber.formatted})` : ''}: a NAV szerint érvényes adószám.`,
          info.address && `Székhely: ${info.address.formatted}.`,
        )
      : 'A NAV szerint ez az adószám nem érvényes, vagy nem tartozik működő adóalanyhoz.',
    data: plainJson(info),
  }
}

function receiptNumbersOf(args: JsonObject): string[] {
  const listed = optionalArray(args, 'receiptNumbers', '')
  const series = optionalString(args, 'series', '')
  const from = optionalInteger(args, 'from', '')
  const to = optionalInteger(args, 'to', '')
  if (listed !== undefined) {
    if (series !== undefined || from !== undefined || to !== undefined) {
      throw new ToolInputError('A receiptNumbers mellett ne adj meg series, from vagy to mezőt.')
    }
    const numbers = listed.map((value, index) => {
      if (typeof value !== 'string' || value.trim() === '') {
        throw new ToolInputError(`A(z) receiptNumbers[${index}] nem érvényes nyugtaszám.`)
      }
      return value.trim()
    })
    return [...new Set(numbers)]
  }
  if (series === undefined || from === undefined || to === undefined) {
    throw new ToolInputError(
      'Add meg a nyugtaszámokat (receiptNumbers), vagy a sorozatot és a tartományt (series, from, to), például series: "NYGT-2026", from: 1, to: 120.',
    )
  }
  if (from < 1 || to < from) {
    throw new ToolInputError('A from legalább 1 legyen, és nem lehet nagyobb a to értékénél.')
  }
  return Array.from({ length: to - from + 1 }, (_, index) => `${series}-${from + index}`)
}

async function navDailySummary(args: JsonObject, context: McpToolContext): Promise<McpToolOutput> {
  assertKnownKeys(args, ['receiptNumbers', 'series', 'from', 'to', 'includeTest'], '')
  const numbers = receiptNumbersOf(args)
  if (numbers.length === 0 || numbers.length > MAX_SUMMARY_RECEIPTS) {
    throw new ToolInputError(
      `Egyszerre 1 és ${MAX_SUMMARY_RECEIPTS} közötti számú nyugta összesíthető, kért: ${numbers.length}.`,
    )
  }
  const includeTest = optionalBoolean(args, 'includeTest', '') ?? false
  const kassza = context.client()
  const receipts: Receipt[] = []
  const missing: string[] = []
  for (const receiptNumber of numbers) {
    const receipt = await kassza.receipts.find({ receiptNumber, downloadPdf: false })
    if (receipt) receipts.push(receipt)
    else missing.push(receiptNumber)
  }
  const reports = navDailyReports(receipts, { includeTest })
  const skippedTest = includeTest ? 0 : receipts.filter((receipt) => receipt.isTest).length
  return {
    summary: lines(
      reports.length === 0
        ? 'Nincs összesíthető nyugta.'
        : reports.map((report) => describeNavReport(report)).join('\n\n'),
      missing.length > 0 && `Nem található nyugták: ${missing.join(', ')}.`,
      skippedTest > 0 &&
        `${skippedTest} tesztfiókos nyugtát kihagytam (az includeTest: true beveszi őket).`,
    ),
    data: { reports: plainJson({ reports }).reports, missing, receiptCount: receipts.length },
  }
}

export const LOOKUP_TOOLS: readonly McpTool[] = [
  {
    name: 'get_invoice',
    title: 'Számla lekérdezése',
    description:
      'Lekér egy számlát (díjbekérőt, sztornót) a Számlázz.hu-ról számlaszám, rendelésszám vagy külső azonosító alapján.',
    inputSchema: objectSchema({
      invoiceNumber: TEXT_PROPERTY,
      orderNumber: TEXT_PROPERTY,
      externalId: TEXT_PROPERTY,
    }),
    annotations: REMOTE_READ,
    write: false,
    run: getInvoice,
  },
  {
    name: 'get_receipt',
    title: 'Nyugta lekérdezése',
    description: 'Lekér egy nyugtát a Számlázz.hu-ról nyugtaszám vagy rendelésszám alapján.',
    inputSchema: objectSchema({ receiptNumber: TEXT_PROPERTY, orderNumber: TEXT_PROPERTY }),
    annotations: REMOTE_READ,
    write: false,
    run: getReceipt,
  },
  {
    name: 'query_taxpayer',
    title: 'Adószám ellenőrzése',
    description:
      'A NAV adatai alapján (a Számlázz.hu-n keresztül) ellenőrzi az adószámot, és visszaadja a cég nevét és székhelyét.',
    inputSchema: objectSchema(
      {
        taxNumber: {
          ...TEXT_PROPERTY,
          description: '8 jegyű törzsszám vagy 11 jegyű adószám, például 12345676-2-42.',
        },
      },
      ['taxNumber'],
    ),
    annotations: REMOTE_READ,
    write: false,
    run: queryTaxpayer,
  },
  {
    name: 'nav_daily_summary',
    title: 'Napi NAV nyugta-összesítő',
    description: `Lekéri a megadott nyugtákat, és elkészíti belőlük a NAV felé teendő napi, áfakategóriánkénti összesítőt (kezdő sorszám, értékesítés, módosító bizonylatok). Egyszerre legfeljebb ${MAX_SUMMARY_RECEIPTS} nyugta.`,
    inputSchema: objectSchema({
      receiptNumbers: {
        type: 'array',
        items: TEXT_PROPERTY,
        minItems: 1,
        maxItems: MAX_SUMMARY_RECEIPTS,
      },
      series: { ...TEXT_PROPERTY, description: 'Sorozat, például NYGT-2026.' },
      from: { type: 'integer', minimum: 1 },
      to: { type: 'integer', minimum: 1 },
      includeTest: { type: 'boolean', description: 'A tesztfiókos nyugtákat is összesíti.' },
    }),
    annotations: REMOTE_READ,
    write: false,
    run: navDailySummary,
  },
]
