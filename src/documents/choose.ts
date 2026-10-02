import { SzamlazzError } from '../core/errors'
import { isHuf } from '../money/vat'

export const RECEIPT_MAX_GROSS_HUF = 900_000

export interface ChooseDocumentBuyer {
  readonly taxNumber?: string | undefined
  readonly euTaxNumber?: string | undefined
  readonly isBusiness?: boolean | undefined
}

export interface ChooseDocumentInput {
  readonly grossTotal: number
  readonly currency?: string | undefined
  readonly exchangeRate?: number | undefined
  readonly buyer?: ChooseDocumentBuyer | undefined
  readonly paidByFulfillment?: boolean | undefined
  readonly invoiceRequested?: boolean | undefined
  readonly cashRegisterRequired?: boolean | undefined
}

export type DocumentChoice = 'receipt' | 'invoice' | 'cash-register'

export interface DocumentDecision {
  readonly type: DocumentChoice
  readonly reasons: readonly string[]
  readonly grossTotalHuf: number
}

const forintFormatter = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 2 })

function validation(message: string): SzamlazzError {
  return new SzamlazzError(message, { category: 'validation' })
}

function grossInHuf(input: ChooseDocumentInput): number {
  if (!Number.isFinite(input.grossTotal) || input.grossTotal < 0) {
    throw validation(
      `A bruttó végösszeg (grossTotal) nemnegatív szám legyen, kapott: ${input.grossTotal}`,
    )
  }
  if (isHuf(input.currency)) return input.grossTotal
  const rate = input.exchangeRate
  if (rate === undefined || !Number.isFinite(rate) || rate <= 0) {
    throw validation(
      `Devizás (${input.currency}) összegnél add meg az árfolyamot (exchangeRate), mert a 900 000 Ft-os határt forintban kell nézni.`,
    )
  }
  return input.grossTotal * rate
}

function isBusinessBuyer(buyer: ChooseDocumentBuyer | undefined): boolean {
  if (!buyer) return false
  return (
    buyer.isBusiness === true ||
    Boolean(buyer.taxNumber?.trim()) ||
    Boolean(buyer.euTaxNumber?.trim())
  )
}

export function chooseDocument(input: ChooseDocumentInput): DocumentDecision {
  const grossTotalHuf = grossInHuf(input)
  const invoiceReasons: string[] = []
  if (isBusinessBuyer(input.buyer)) {
    invoiceReasons.push(
      'A vevő adóalany vagy jogi személy (adószámot adott meg), ezért számlát kell kiállítani.',
    )
  }
  if (grossTotalHuf >= RECEIPT_MAX_GROSS_HUF) {
    invoiceReasons.push(
      `Az ellenérték (${forintFormatter.format(grossTotalHuf)} Ft) eléri a 900 000 Ft-ot, ezért számlát kell kiállítani.`,
    )
  }
  if (input.paidByFulfillment === false) {
    invoiceReasons.push(
      'A teljes ellenértéket nem fizetik meg legkésőbb a teljesítésig, ezért számlát kell kiállítani.',
    )
  }
  if (input.invoiceRequested === true) {
    invoiceReasons.push('A vevő számlát kér, ezért számlát kell kiállítani.')
  }
  if (invoiceReasons.length > 0) return { type: 'invoice', reasons: invoiceReasons, grossTotalHuf }
  if (input.cashRegisterRequired === true) {
    return {
      type: 'cash-register',
      reasons: [
        'A tevékenység online pénztárgép- vagy e-pénztárgép-köteles, ezért nyugtát csak pénztárgéppel lehet adni, számítógéppel előállítottat (Számla Agent) nem.',
        'Ha a kasszával szeretnéd bizonylatolni, állíts ki számlát a vevő nevére.',
      ],
      grossTotalHuf,
    }
  }
  return {
    type: 'receipt',
    reasons: [
      'A vevő nem adóalany és nem jogi személy, az ellenérték 900 000 Ft alatt van, a teljesítésig kifizetik, és nem kér számlát, ezért nyugta adható.',
    ],
    grossTotalHuf,
  }
}
