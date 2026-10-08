import type { InvoicesApi, ReceiptsApi } from '../client'
import { isSzamlazzError, SzamlazzError, type SzamlazzErrorCategory } from '../core/errors'
import type { InvoiceOnceResult } from '../invoices/create-once'
import type { CreateInvoiceInput } from '../invoices/create-types'
import type { Journal } from '../journal/journal'
import { calculateReceiptItems } from '../receipts/create'
import type { ReceiptOnceResult } from '../receipts/create-once'
import type { CreateReceiptInput } from '../receipts/types'

export const MAX_BATCH_CONCURRENCY = 4
export const DEFAULT_BATCH_RATE_PER_MINUTE = 30

export type BatchDocument =
  | { readonly kind: 'invoice'; readonly input: CreateInvoiceInput }
  | { readonly kind: 'receipt'; readonly input: CreateReceiptInput }

export interface BatchItem {
  readonly key: string
  readonly document: () => BatchDocument | Promise<BatchDocument>
}

export interface BatchProgress {
  readonly total: number
  readonly done: number
  readonly created: number
  readonly existing: number
  readonly previewed: number
  readonly failed: number
  readonly skipped: number
  readonly key: string
  readonly status: BatchItemStatus
}

export type BatchItemStatus = 'created' | 'existing' | 'previewed' | 'failed' | 'skipped'

export interface BatchItemResult {
  readonly key: string
  readonly status: BatchItemStatus
  readonly kind?: 'invoice' | 'receipt' | undefined
  readonly number?: string | undefined
  readonly grossTotal?: number | undefined
  readonly error?: unknown
  readonly reason?: string | undefined
}

export interface BatchResult {
  readonly dryRun: boolean
  readonly items: readonly BatchItemResult[]
  readonly created: readonly BatchItemResult[]
  readonly existing: readonly BatchItemResult[]
  readonly previewed: readonly BatchItemResult[]
  readonly failed: readonly BatchItemResult[]
  readonly skipped: readonly BatchItemResult[]
  readonly stopped?: { readonly reason: string; readonly error?: unknown } | undefined
  readonly grossTotal: number
}

export interface BatchApi {
  readonly invoices: Pick<InvoicesApi, 'createOnce' | 'preview'>
  readonly receipts: Pick<ReceiptsApi, 'createOnce'>
}

export interface RunBatchOptions {
  readonly items: readonly BatchItem[]
  readonly concurrency?: number | undefined
  readonly ratePerMinute?: number | undefined
  readonly dryRun?: boolean | undefined
  readonly journal?: Journal | undefined
  readonly signal?: AbortSignal | undefined
  readonly onProgress?: ((progress: BatchProgress) => void) | undefined
  readonly recoveryDelayMs?: number | undefined
}

const STOPPING_CATEGORIES: ReadonlySet<SzamlazzErrorCategory> = new Set([
  'rate_limit',
  'auth',
  'account',
  'configuration',
  'maintenance',
  'attempt_limit',
  'store_unavailable',
])

function invalid(message: string): SzamlazzError {
  return new SzamlazzError(message, { category: 'validation' })
}

function resolveConcurrency(value: number | undefined): number {
  if (value === undefined) return 1
  if (!Number.isInteger(value) || value < 1 || value > MAX_BATCH_CONCURRENCY) {
    throw new SzamlazzError(
      `A concurrency 1 és ${MAX_BATCH_CONCURRENCY} közötti egész legyen, kapott: ${value}. A Számlázz.hu a párhuzamos kérések kerülését kéri.`,
      { category: 'configuration' },
    )
  }
  return value
}

function resolveRate(value: number | undefined): number {
  if (value === undefined) return DEFAULT_BATCH_RATE_PER_MINUTE
  if (!Number.isFinite(value) || value <= 0) {
    throw new SzamlazzError(`A ratePerMinute pozitív szám legyen, kapott: ${value}`, {
      category: 'configuration',
    })
  }
  return value
}

function assertKeys(items: readonly BatchItem[]): void {
  const seen = new Set<string>()
  for (const item of items) {
    const key = item.key?.trim()
    if (!key) throw invalid('Minden tételhez adj meg kulcsot (key), ez lesz a rendelésszám.')
    if (seen.has(key)) throw invalid(`A(z) ${key} kulcs kétszer szerepel a listában.`)
    seen.add(key)
  }
}

function withOrderNumber<T extends { readonly orderNumber?: string | undefined }>(
  input: T,
  key: string,
): T {
  const own = input.orderNumber?.trim()
  if (own && own !== key) {
    throw invalid(
      `A(z) ${key} tétel rendelésszáma (${own}) eltér a kulcstól. A batch a kulcsot használja rendelésszámként, hogy az újrafuttatás ne állítson ki duplát.`,
    )
  }
  return { ...input, orderNumber: key }
}

function wait(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(signal?.reason)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function invoiceGross(result: InvoiceOnceResult): number | undefined {
  return result.invoice?.grossTotal ?? result.details?.totals.grossAmount
}

async function previewDocument(
  api: BatchApi,
  document: BatchDocument,
  key: string,
  signal: AbortSignal | undefined,
): Promise<BatchItemResult> {
  if (document.kind === 'invoice') {
    const preview = await api.invoices.preview(withOrderNumber(document.input, key), { signal })
    return {
      key,
      status: 'previewed',
      kind: 'invoice',
      grossTotal: preview.grossTotal,
    }
  }
  const input = withOrderNumber(document.input, key)
  if (input.items.length === 0) throw invalid(`A(z) ${key} nyugtán nincs tétel.`)
  const gross = calculateReceiptItems(input.items, input.currency ?? 'HUF').reduce(
    (sum, item) => sum + item.amounts.grossAmount,
    0,
  )
  return { key, status: 'previewed', kind: 'receipt', grossTotal: Math.round(gross * 100) / 100 }
}

async function issueDocument(
  api: BatchApi,
  document: BatchDocument,
  key: string,
  options: RunBatchOptions,
): Promise<BatchItemResult> {
  const onceOptions = { signal: options.signal, recoveryDelayMs: options.recoveryDelayMs }
  if (document.kind === 'invoice') {
    const input = withOrderNumber(document.input, key)
    const run = (): Promise<InvoiceOnceResult> => api.invoices.createOnce(input, onceOptions)
    const result = options.journal ? await options.journal.trackInvoice(key, run) : await run()
    return {
      key,
      status: result.created ? 'created' : 'existing',
      kind: 'invoice',
      number: result.number,
      grossTotal: invoiceGross(result),
    }
  }
  const input = withOrderNumber(document.input, key)
  const run = (): Promise<ReceiptOnceResult> => api.receipts.createOnce(input, onceOptions)
  const result = options.journal
    ? ((await options.journal.trackReceipt(key, run)) as ReceiptOnceResult)
    : await run()
  return {
    key,
    status: result.created ? 'created' : 'existing',
    kind: 'receipt',
    number: result.receipt.number,
    grossTotal: result.receipt.totals.grossAmount,
  }
}

function stopReason(error: unknown): string | undefined {
  if (!isSzamlazzError(error) || !STOPPING_CATEGORIES.has(error.category)) return undefined
  return `A(z) ${error.category} hiba miatt a batch leállt, a hátralévő tételek nem futottak le: ${error.message}`
}

export async function runBatch(api: BatchApi, options: RunBatchOptions): Promise<BatchResult> {
  const concurrency = resolveConcurrency(options.concurrency)
  const intervalMs = 60_000 / resolveRate(options.ratePerMinute)
  assertKeys(options.items)
  const dryRun = options.dryRun === true
  const results: BatchItemResult[] = new Array(options.items.length)
  const counts = { created: 0, existing: 0, previewed: 0, failed: 0, skipped: 0 }
  let done = 0
  let cursor = 0
  let nextStart = Date.now()
  const control: { stopped: { reason: string; error?: unknown } | undefined } = {
    stopped: undefined,
  }
  const currentStop = (): { reason: string; error?: unknown } | undefined => control.stopped

  const record = (index: number, result: BatchItemResult): void => {
    results[index] = result
    counts[result.status] += 1
    done += 1
    try {
      options.onProgress?.({
        total: options.items.length,
        done,
        ...counts,
        key: result.key,
        status: result.status,
      })
    } catch {
      return
    }
  }

  const processItem = async (index: number, item: BatchItem): Promise<void> => {
    const key = item.key.trim()
    try {
      const document = await item.document()
      const result = dryRun
        ? await previewDocument(api, document, key, options.signal)
        : await issueDocument(api, document, key, options)
      record(index, result)
    } catch (error) {
      if (options.signal?.aborted && error === options.signal.reason) {
        control.stopped ??= { reason: 'A batch futását megszakították.', error }
        record(index, { key, status: 'skipped', reason: 'Megszakítva.' })
        return
      }
      const reason = stopReason(error)
      if (reason) control.stopped ??= { reason, error }
      record(index, { key, status: 'failed', error })
    }
  }

  const worker = async (): Promise<void> => {
    for (;;) {
      if (control.stopped || options.signal?.aborted) return
      const index = cursor
      cursor += 1
      const item = options.items[index]
      if (!item) return
      const delay = nextStart - Date.now()
      nextStart = Math.max(nextStart, Date.now()) + intervalMs
      try {
        await wait(delay, options.signal)
      } catch (error) {
        control.stopped ??= { reason: 'A batch futását megszakították.', error }
        record(index, { key: item.key.trim(), status: 'skipped', reason: 'Megszakítva.' })
        return
      }
      const stop = currentStop()
      if (stop) {
        record(index, { key: item.key.trim(), status: 'skipped', reason: stop.reason })
        return
      }
      await processItem(index, item)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, options.items.length) }, worker))
  if (options.signal?.aborted) control.stopped ??= { reason: 'A batch futását megszakították.' }
  options.items.forEach((item, index) => {
    if (results[index]) return
    record(index, {
      key: item.key.trim(),
      status: 'skipped',
      reason: control.stopped?.reason ?? 'Nem futott le.',
    })
  })
  const by = (status: BatchItemStatus): BatchItemResult[] =>
    results.filter((result) => result.status === status)
  const grossTotal = results
    .filter((result) => result.status !== 'failed' && result.status !== 'skipped')
    .reduce((sum, result) => sum + (result.grossTotal ?? 0), 0)
  return {
    dryRun,
    items: results,
    created: by('created'),
    existing: by('existing'),
    previewed: by('previewed'),
    failed: by('failed'),
    skipped: by('skipped'),
    stopped: control.stopped,
    grossTotal: Math.round(grossTotal * 100) / 100,
  }
}
