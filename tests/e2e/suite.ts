import { beforeAll, describe, expect, test } from 'vitest'
import type { Kassza } from '../../src/client'
import { AGENT_ACTIONS, type AgentAction } from '../../src/core/actions'
import type { SzamlazzHooks } from '../../src/core/context'
import { isSzamlazzError } from '../../src/core/errors'
import type { CreatedInvoice } from '../../src/invoices/create-types'
import type { Receipt } from '../../src/receipts/types'
import { assertTestAccount, BUYER, ITEMS, invoiceInput } from './guard'

export const E2E_ACTIONS: readonly AgentAction[] = (
  Object.keys(AGENT_ACTIONS) as AgentAction[]
).filter((action) => action !== 'connectPrincipal')

export interface E2eSuiteOptions {
  readonly createClient: (hooks: SzamlazzHooks) => Kassza
  readonly receiptPrefix: string
  readonly taxNumber: string
  readonly email: string | undefined
  readonly minPdfBytes: number
}

interface Run {
  fatal: boolean
}

interface Group {
  failed: boolean
}

type Step = (name: string, body: () => Promise<void>) => void

const FATAL_CATEGORIES: ReadonlySet<string> = new Set([
  'auth',
  'attempt_limit',
  'rate_limit',
  'maintenance',
])

const NET_TOTAL = 5000
const GROSS_TOTAL = 5690
const PARTIAL_PAYMENT = 1000
const RECEIPT_GROSS = 1270

function isPdf(bytes: Uint8Array | undefined): boolean {
  return bytes !== undefined && new TextDecoder().decode(bytes.subarray(0, 4)) === '%PDF'
}

function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`Hiányzik a korábbi lépés eredménye: ${what}.`)
  return value
}

function groupSteps(run: Run, options: { readonly critical?: boolean } = {}): Step {
  const group: Group = { failed: false }
  return (name, body) => {
    test(name, async (context) => {
      if (run.fatal || group.failed) context.skip()
      try {
        await body()
      } catch (error) {
        group.failed = true
        if (options.critical) run.fatal = true
        if (isSzamlazzError(error) && FATAL_CATEGORIES.has(error.category)) run.fatal = true
        throw error
      }
    })
  }
}

export function defineE2eSuite(options: E2eSuiteOptions): void {
  const seen = new Set<AgentAction>()
  const run: Run = { fatal: false }
  const runId = Date.now().toString(36).toUpperCase()
  const orderNumber = (label: string): string => `E2E-${runId}-${label}`
  let kassza: Kassza

  beforeAll(() => {
    kassza = options.createClient({
      onRequest: (event) => {
        seen.add(event.action)
      },
    })
  })

  describe('fiókellenőrzés: csak tesztfiókon mehet tovább', () => {
    const step = groupSteps(run, { critical: true })

    step('az Agent kulcs érvényes', async () => {
      await expect(kassza.verifyCredentials()).resolves.toBe(true)
    })

    step('a díjbekérő létrejön, a fiók tesztfiók, és a díjbekérő törölhető', async () => {
      await assertTestAccount(kassza, orderNumber('DIJ'))
    })
  })

  describe('számla életciklus', () => {
    const step = groupSteps(run)
    const data: { invoice?: CreatedInvoice; reversal?: string; once?: string } = {}
    const invoiceOrder = orderNumber('SZLA')
    const invoiceExternalId = `${invoiceOrder}-X`

    step('a számlaelőnézet PDF-et és helyes összegeket ad, számla létrehozása nélkül', async () => {
      const preview = await kassza.invoices.preview(invoiceInput(orderNumber('ELONEZET')))
      expect(isPdf(preview.pdf)).toBe(true)
      expect(preview.pdf.byteLength).toBeGreaterThanOrEqual(options.minPdfBytes)
      expect(preview.netTotal).toBe(NET_TOTAL)
      expect(preview.grossTotal).toBe(GROSS_TOTAL)
    })

    step('a számla létrejön, a PDF-fel és a helyes összegekkel', async () => {
      const invoice = await kassza.invoices.create(
        invoiceInput(invoiceOrder, { externalId: invoiceExternalId, downloadPdf: true }),
      )
      data.invoice = invoice
      expect(invoice.number).not.toBe('')
      expect(invoice.netTotal).toBe(NET_TOTAL)
      expect(invoice.grossTotal).toBe(GROSS_TOTAL)
      expect(invoice.items).toHaveLength(ITEMS.length)
      expect(isPdf(invoice.pdf)).toBe(true)
    })

    step('a számla lekérdezhető számlaszámmal, rendelésszámmal és külső azonosítóval', async () => {
      const { number } = required(data.invoice, 'számla')
      const byNumber = await kassza.invoices.get(number, { includePdf: true })
      expect(byNumber.header).toMatchObject({
        number,
        type: 'invoice',
        test: true,
        orderNumber: invoiceOrder,
      })
      expect(byNumber.buyer.name).toBe(BUYER.name)
      expect(byNumber.items).toHaveLength(ITEMS.length)
      expect(byNumber.items.map((item) => item.vat)).toEqual([27, 5])
      expect(byNumber.totals.netAmount).toBe(NET_TOTAL)
      expect(byNumber.totals.grossAmount).toBe(GROSS_TOTAL)
      expect(isPdf(byNumber.pdf)).toBe(true)

      const byOrder = await kassza.invoices.get(
        { orderNumber: invoiceOrder },
        { includePdf: false },
      )
      expect(byOrder.header.number).toBe(number)
      const byExternalId = await kassza.invoices.get(
        { externalId: invoiceExternalId },
        { includePdf: false },
      )
      expect(byExternalId.header.number).toBe(number)
    })

    step('a számla PDF-je letölthető', async () => {
      const { number, grossTotal } = required(data.invoice, 'számla')
      const pdf = await kassza.invoices.getPdf(number)
      expect(isPdf(pdf.pdf)).toBe(true)
      expect(pdf.pdf.byteLength).toBeGreaterThanOrEqual(options.minPdfBytes)
      if (pdf.grossTotal !== undefined) expect(pdf.grossTotal).toBe(grossTotal)
    })

    step('a befizetés hozzáadható, lecserélhető és törölhető', async () => {
      const { number, grossTotal } = required(data.invoice, 'számla')
      const paymentsOf = async (): Promise<number[]> =>
        (await kassza.invoices.get(number, { includePdf: false })).payments.map(
          (payment) => payment.amount,
        )

      const partial = await kassza.invoices.registerPayment({
        invoiceNumber: number,
        amount: PARTIAL_PAYMENT,
        method: 'átutalás',
      })
      expect(partial.invoiceNumber).toBe(number)

      await kassza.invoices.registerPayment({
        invoiceNumber: number,
        amount: PARTIAL_PAYMENT,
        method: 'átutalás',
      })
      expect(await paymentsOf()).toEqual([PARTIAL_PAYMENT, PARTIAL_PAYMENT])

      await kassza.invoices.registerPayment({
        invoiceNumber: number,
        amount: grossTotal,
        method: 'átutalás',
        additive: false,
      })
      expect(await paymentsOf()).toEqual([grossTotal])

      await kassza.invoices.clearPayments(number)
      expect(await paymentsOf()).toEqual([])
    })

    step('a createOnce másodszorra ugyanazt a számlát adja vissza', async () => {
      const input = invoiceInput(orderNumber('EGYSZER'))
      const first = await kassza.invoices.createOnce(input)
      data.once = first.number
      expect(first.created).toBe(true)
      expect(first.number).not.toBe('')
      const second = await kassza.invoices.createOnce(input)
      expect(second.created).toBe(false)
      expect(second.number).toBe(first.number)
    })

    step('a számla sztornózható', async () => {
      const { number } = required(data.invoice, 'számla')
      const reversal = await kassza.invoices.reverse({
        invoiceNumber: number,
        eInvoice: false,
        downloadPdf: false,
      })
      data.reversal = reversal.number
      expect(reversal.number).not.toBe('')
      expect(reversal.number).not.toBe(number)
      const details = await kassza.invoices.get(reversal.number, { includePdf: false })
      expect(details.header.type).toBe('reversal')
    })
  })

  describe('hibakezelés a valódi válaszokon', () => {
    const step = groupSteps(run)

    step('az ismeretlen számlaszám not_found hiba', async () => {
      await expect(kassza.invoices.get(`KASSZA-E2E-NEMLETEZIK-${runId}`)).rejects.toMatchObject({
        category: 'not_found',
      })
    })
  })

  describe('nyugták', () => {
    const step = groupSteps(run)
    const data: { receipt?: Receipt } = {}
    const receiptOrder = orderNumber('NYGTA')

    step('a nyugta létrejön, a PDF-fel és a helyes összegekkel', async () => {
      const receipt = await kassza.receipts.create({
        prefix: options.receiptPrefix,
        paymentMethod: 'bankkártya',
        orderNumber: receiptOrder,
        downloadPdf: true,
        items: [{ name: 'E2E nyugtatétel', quantity: 1, grossUnitPrice: RECEIPT_GROSS, vat: 27 }],
      })
      data.receipt = receipt
      expect(receipt.number).not.toBe('')
      expect(receipt.type).toBe('receipt')
      expect(receipt.isTest).toBe(true)
      expect(receipt.items).toHaveLength(1)
      expect(receipt.totals.grossAmount).toBe(RECEIPT_GROSS)
      expect(isPdf(receipt.pdf)).toBe(true)
    })

    step('a nyugta lekérdezhető nyugtaszámmal és rendelésszámmal', async () => {
      const { number } = required(data.receipt, 'nyugta')
      const byNumber = await kassza.receipts.get({ receiptNumber: number, downloadPdf: false })
      expect(byNumber.number).toBe(number)
      expect(byNumber.totals.grossAmount).toBe(RECEIPT_GROSS)
      const byOrder = await kassza.receipts.get({ orderNumber: receiptOrder, downloadPdf: false })
      expect(byOrder.number).toBe(number)
    })

    if (options.email === undefined) {
      test.skip('a nyugta e-mailben elküldhető (SZAMLAZZ_E2E_EMAIL nélkül kimarad)', () => {})
    } else {
      const email = options.email
      step('a nyugta e-mailben elküldhető', async () => {
        const { number } = required(data.receipt, 'nyugta')
        await expect(
          kassza.receipts.send({
            receiptNumber: number,
            emails: email,
            subject: 'Kassza e2e teszt nyugta',
            text: 'Ez a kassza automatikus e2e tesztjének üzenete.',
          }),
        ).resolves.toBeUndefined()
      })
    }

    step('a nyugta sztornózható', async () => {
      const { number } = required(data.receipt, 'nyugta')
      const reversal = await kassza.receipts.reverse({ receiptNumber: number, downloadPdf: false })
      expect(reversal.type).toBe('reversal')
      expect(reversal.reversedReceiptNumber).toBe(number)
      const original = await kassza.receipts.get({ receiptNumber: number, downloadPdf: false })
      expect(original.isReversed).toBe(true)
    })
  })

  describe('adózó lekérdezés', () => {
    const step = groupSteps(run)

    step('az ismert adószám érvényes adózóként jön vissza', async () => {
      const taxpayer = await kassza.taxpayer.query(options.taxNumber)
      expect(taxpayer.valid).toBe(true)
      expect(taxpayer.name).toBeTruthy()
      expect(taxpayer.taxNumber?.taxpayerId).toBe(options.taxNumber.replace(/\D/g, '').slice(0, 8))
    })
  })

  describe('lefedettség', () => {
    test(`mind a ${E2E_ACTIONS.length} Számla Agent művelet lefutott legalább egyszer`, () => {
      const missing = E2E_ACTIONS.filter((action) => !seen.has(action))
      expect(
        missing,
        `Ezek a műveletek nem futottak le: ${missing.join(', ')}. Nézd meg a fenti hibákat és kihagyott lépéseket.`,
      ).toEqual([])
    })
  })
}
