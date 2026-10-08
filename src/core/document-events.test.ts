import { afterEach, describe, expect, test, vi } from 'vitest'
import { fakeKassza } from '../../tests/fake-agent'
import type { CreateInvoiceInput } from '../invoices/create-types'
import { createMockKassza } from '../testing'
import {
  type DocumentEvent,
  DocumentHookError,
  emitDocumentEvent,
  isDocumentHookError,
} from './document-events'
import type { KasszaWarning } from './warnings'

const INVOICE: CreateInvoiceInput = {
  orderNumber: 'HOOK-1',
  buyer: { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' },
  items: [{ name: 'Termék', grossUnitPrice: 12_700, vat: 27 }],
}

const EVENT = {
  kind: 'receipt',
  action: 'created',
  number: 'NY-1',
  document: { number: 'NY-1' },
} as unknown as DocumentEvent

const failingHook = () => {
  throw new Error('a napló nem érhető el')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('emitDocumentEvent', () => {
  test('hook nélkül nem csinál semmit', async () => {
    await expect(emitDocumentEvent(undefined, EVENT, { mode: 'throw' })).resolves.toBeUndefined()
  })

  test("alapból ('warn') console.warn-nal jelez, és nem dob", async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await expect(emitDocumentEvent(failingHook, EVENT)).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0]?.[0])).toContain('NY-1')
  })

  test('onWarning esetén oda jelez a console helyett', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const warnings: KasszaWarning[] = []
    await emitDocumentEvent(failingHook, EVENT, { onWarning: (w) => warnings.push(w) })
    expect(warn).not.toHaveBeenCalled()
    expect(warnings).toMatchObject([{ kind: 'document', operation: 'receipt.created' }])
  })

  test("'throw' módban DocumentHookError-t dob, amely tartalmazza a bizonylatot", async () => {
    const error = await emitDocumentEvent(failingHook, EVENT, { mode: 'throw' }).catch(
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(DocumentHookError)
    expect(isDocumentHookError(error)).toBe(true)
    const hookError = error as DocumentHookError
    expect(hookError.name).toBe('DocumentHookError')
    expect(hookError.number).toBe('NY-1')
    expect(hookError.document).toBe(EVENT.document)
    expect(hookError.event).toBe(EVENT)
    expect(String((hookError.cause as Error).message)).toBe('a napló nem érhető el')
    expect(hookError.message).toContain('ne állítsd ki újra')
  })

  test('függvény módban a kezelő kapja meg a hibát; ha az is dob, DocumentHookError lesz', async () => {
    const handler = vi.fn()
    await emitDocumentEvent(failingHook, EVENT, { mode: handler })
    expect(handler).toHaveBeenCalledWith(expect.any(Error), EVENT)

    const rethrow = vi.fn(async () => {
      throw new Error('a tartalék mentés sem sikerült')
    })
    await expect(emitDocumentEvent(failingHook, EVENT, { mode: rethrow })).rejects.toMatchObject({
      name: 'DocumentHookError',
      cause: { message: 'a tartalék mentés sem sikerült' },
    })
    expect(isDocumentHookError(new Error('x'))).toBe(false)
  })
})

describe('onDocumentError a kliensben', () => {
  test("'throw' módban a createOnce a hibát adja, a számla mégis elkészült", async () => {
    const { agent, kassza } = fakeKassza(
      {},
      { hooks: { onDocument: failingHook, onDocumentError: 'throw' } },
    )

    const error = await kassza.invoices.createOnce(INVOICE).catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(DocumentHookError)
    expect((error as DocumentHookError).number).toBe('KASSZA-2026-1')
    expect(agent.invoices.size).toBe(1)
    const again = await kassza.invoices.createOnce(INVOICE)
    expect(again).toMatchObject({ created: false, number: 'KASSZA-2026-1' })
  })

  test('a nyugta, a sztornó és a befizetés is a beállított mód szerint jelez', async () => {
    const warnings: KasszaWarning[] = []
    const { kassza } = fakeKassza(
      {},
      { hooks: { onDocument: failingHook, onWarning: (warning) => warnings.push(warning) } },
    )
    const invoice = await kassza.invoices.create(INVOICE)
    await kassza.invoices.registerPayment({ invoiceNumber: invoice.number, amount: 12_700 })
    await kassza.invoices.reverse(invoice.number)
    const receipt = await kassza.receipts.create({
      items: [{ name: 'Kávé', grossUnitPrice: 890, vat: 27 }],
    })
    await kassza.receipts.reverse(receipt.number)

    expect(warnings.map((warning) => warning.operation)).toEqual([
      'invoice.created',
      'invoice.payment',
      'invoice.reversed',
      'receipt.created',
      'receipt.reversed',
    ])
  })

  test('a mock kassza ugyanígy viselkedik', async () => {
    const kassza = createMockKassza({
      hooks: { onDocument: failingHook, onDocumentError: 'throw' },
    })
    await expect(kassza.invoices.create(INVOICE)).rejects.toBeInstanceOf(DocumentHookError)
    expect(kassza.invoiceRecords.size).toBe(1)
  })
})
