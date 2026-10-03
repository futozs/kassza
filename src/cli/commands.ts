import type { KasszaDefaults } from '../client'
import { el } from '../core/xml/serialize'
import type { CreateInvoiceInput } from '../invoices/create-types'
import { buildCreateInvoiceXml } from '../invoices/create-xml'
import type { InvoiceReference } from '../invoices/reference'
import { buildCreateReceiptXml } from '../receipts/create'
import type { CreateReceiptInput, Receipt } from '../receipts/types'
import { describeNavReport, navDailyReports } from '../reports/nav'
import { CliUsageError, flagValue, hasFlag, type ParsedArgs } from './args'
import { CliError, type CliIo, cliKassza, isRecord, printJson, readDefaults, readJson } from './io'

const MASKED_CREDENTIALS = [el('szamlaagentkulcs', '***')]
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

export async function verifyCommand(io: CliIo): Promise<number> {
  if (await cliKassza(io).verifyCredentials()) {
    io.stdout('Az Agent kulcs érvényes: a Számlázz.hu elfogadta.\n')
    return 0
  }
  io.stderr(
    'A Számlázz.hu elutasította az Agent kulcsot (3). Ellenőrizd, hogy kisbetűs-e, és jó fiókhoz tartozik-e.\n',
  )
  return 1
}

interface PreviewSource {
  readonly defaults: KasszaDefaults
  readonly input: unknown
}

function assertDocumentShape(input: unknown, type: 'invoice' | 'receipt'): void {
  if (!isRecord(input)) throw new CliError('A bizonylat adatainak objektumnak kell lenniük.')
  if (!Array.isArray(input.items))
    throw new CliError('Az items mezőnek tételek tömbjének kell lennie.')
  if (type === 'invoice' && !isRecord(input.buyer)) {
    throw new CliError('Számlához a buyer (vevő) objektum kötelező.')
  }
}

function previewSource(value: unknown, defaults: KasszaDefaults | undefined): PreviewSource {
  if (!isRecord(value)) throw new CliError('A bemeneti JSON-nak objektumnak kell lennie.')
  if (isRecord(value.input)) {
    const embedded = isRecord(value.defaults) ? (value.defaults as KasszaDefaults) : {}
    return { defaults: defaults ?? embedded, input: value.input }
  }
  return { defaults: defaults ?? {}, input: value }
}

export async function xmlPreviewCommand(io: CliIo, args: ParsedArgs): Promise<number> {
  const path = args.positionals[2]
  if (path === undefined) {
    throw new CliUsageError('Add meg a bemeneti JSON fájlt: kassza xml preview <fájl.json|->')
  }
  const type = flagValue(args, 'type') ?? 'invoice'
  if (type !== 'invoice' && type !== 'receipt') {
    throw new CliUsageError(`A --type értéke invoice vagy receipt lehet, kapott: ${type}`)
  }
  const defaultsPath = flagValue(args, 'defaults')
  const source = previewSource(
    await readJson(io, path),
    defaultsPath === undefined ? undefined : await readDefaults(io, defaultsPath),
  )
  assertDocumentShape(source.input, type)
  const xml =
    type === 'invoice'
      ? buildCreateInvoiceXml(
          MASKED_CREDENTIALS,
          source.defaults.invoice ?? {},
          source.input as CreateInvoiceInput,
          io.now?.() ?? new Date(),
        )
      : buildCreateReceiptXml(
          MASKED_CREDENTIALS,
          source.defaults.receipt ?? {},
          source.input as CreateReceiptInput,
        )
  io.stdout(xml)
  return 0
}

function invoiceReferenceOf(args: ParsedArgs): InvoiceReference {
  const number = args.positionals[2]
  const orderNumber = flagValue(args, 'order')
  const externalId = flagValue(args, 'external')
  const given = [number, orderNumber, externalId].filter((value) => value !== undefined)
  if (given.length !== 1) {
    throw new CliUsageError(
      'Pontosan egyet adj meg: kassza invoice get <számlaszám> | --order <rendelésszám> | --external <azonosító>',
    )
  }
  if (number !== undefined) return number
  if (orderNumber !== undefined) return { orderNumber }
  return { externalId: externalId ?? '' }
}

export async function invoiceGetCommand(io: CliIo, args: ParsedArgs): Promise<number> {
  const reference = invoiceReferenceOf(args)
  const invoice = await cliKassza(io).invoices.find(reference, { includePdf: false })
  if (!invoice) {
    io.stderr('Nincs ilyen számla a Számlázz.hu fiókban.\n')
    return 1
  }
  printJson(io, invoice)
  return 0
}

export async function receiptGetCommand(io: CliIo, args: ParsedArgs): Promise<number> {
  const number = args.positionals[2]
  const orderNumber = flagValue(args, 'order')
  if ((number === undefined) === (orderNumber === undefined)) {
    throw new CliUsageError(
      'Pontosan egyet adj meg: kassza receipt get <nyugtaszám> | --order <rendelésszám>',
    )
  }
  const receipt = await cliKassza(io).receipts.find(
    number !== undefined
      ? { receiptNumber: number, downloadPdf: false }
      : { orderNumber: orderNumber ?? '', downloadPdf: false },
  )
  if (!receipt) {
    io.stderr('Nincs ilyen nyugta a Számlázz.hu fiókban.\n')
    return 1
  }
  printJson(io, receipt)
  return 0
}

function optionalDateFlag(args: ParsedArgs, name: string): string | undefined {
  const value = flagValue(args, name)
  if (value !== undefined && !DATE_PATTERN.test(value)) {
    throw new CliUsageError(`A --${name} értékét ÉÉÉÉ-HH-NN formában add meg, kapott: ${value}`)
  }
  return value
}

function receiptListOf(value: unknown, path: string): Receipt[] {
  const list = isRecord(value) && Array.isArray(value.receipts) ? value.receipts : value
  if (!Array.isArray(list)) {
    throw new CliError(
      `A(z) ${path} fájlban nyugták tömbjét (vagy { "receipts": [...] } objektumot) várjuk.`,
    )
  }
  return list.map((entry, index) => {
    const valid =
      isRecord(entry) &&
      typeof entry.number === 'string' &&
      typeof entry.issueDate === 'string' &&
      typeof entry.currency === 'string' &&
      (entry.type === 'receipt' || entry.type === 'reversal') &&
      Array.isArray(entry.items)
    if (!valid) {
      throw new CliError(
        `A(z) ${index + 1}. elem nem kassza nyugta (number, issueDate, currency, type és items mező kell).`,
      )
    }
    return entry as unknown as Receipt
  })
}

export async function navSummaryCommand(io: CliIo, args: ParsedArgs): Promise<number> {
  const path = flagValue(args, 'file')
  if (path === undefined) {
    throw new CliUsageError('Add meg a nyugtákat tartalmazó JSON fájlt: --file <nyugták.json|->')
  }
  const from = optionalDateFlag(args, 'from')
  const to = optionalDateFlag(args, 'to')
  if (from !== undefined && to !== undefined && from > to) {
    throw new CliUsageError('A --from nem lehet későbbi a --to dátumnál.')
  }
  const receipts = receiptListOf(await readJson(io, path), path).filter(
    (receipt) =>
      (from === undefined || receipt.issueDate >= from) &&
      (to === undefined || receipt.issueDate <= to),
  )
  const reports = navDailyReports(receipts, { includeTest: hasFlag(args, 'include-test') })
  if (hasFlag(args, 'json')) {
    printJson(io, reports)
    return 0
  }
  io.stdout(
    reports.length === 0
      ? 'Nincs összesíthető nyugta a megadott időszakban.\n'
      : `${reports.map((report) => describeNavReport(report)).join('\n\n')}\n`,
  )
  return 0
}
