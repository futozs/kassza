import { AGENT_ERROR_CODES, type CreateInvoiceInput, createKassza } from 'kassza'
import { calculateInvoiceItem } from 'kassza/money'

const SAMPLE_UNIT_PRICE = 5_990
const SAMPLE_QUANTITY = 3
const SAMPLE_VAT = 27
const SAMPLE_AGENT_KEY = 'a-te-agent-kulcsod'
const INVOICE_XML_FIELD = 'action-xmlagentxmlfile'
const XML_ERROR_CODE = 57
const AMOUNT_TAGS = /<(nettoEgysegar|nettoErtek|afaErtek|bruttoErtek)>/

export const sampleInvoice = {
  orderNumber: 'REND-1001',
  paid: true,
  paymentMethod: 'bankkártya',
  buyer: {
    name: 'Nagy Péter',
    zip: '1111',
    city: 'Budapest',
    address: 'Fő utca 1.',
    email: 'peter@example.hu',
  },
  items: [
    { name: 'Póló', quantity: SAMPLE_QUANTITY, grossUnitPrice: SAMPLE_UNIT_PRICE, vat: SAMPLE_VAT },
  ],
} satisfies CreateInvoiceInput

export interface RoundingSample {
  readonly unitPrice: number
  readonly quantity: number
  readonly vat: number
  readonly gross: number
  readonly net: number
  readonly vatAmount: number
  readonly naiveNet: number
  readonly naiveVat: number
  readonly naiveGross: number
}

export function roundingSample(): RoundingSample {
  const official = calculateInvoiceItem({
    quantity: SAMPLE_QUANTITY,
    grossUnitPrice: SAMPLE_UNIT_PRICE,
    vat: SAMPLE_VAT,
  })
  const gross = SAMPLE_UNIT_PRICE * SAMPLE_QUANTITY
  const naiveNet = Math.round(gross / (1 + SAMPLE_VAT / 100))
  const naiveVat = Math.round((naiveNet * SAMPLE_VAT) / 100)
  return {
    unitPrice: SAMPLE_UNIT_PRICE,
    quantity: SAMPLE_QUANTITY,
    vat: SAMPLE_VAT,
    gross: official.grossAmount,
    net: official.netAmount,
    vatAmount: official.vatAmount,
    naiveNet,
    naiveVat,
    naiveGross: naiveNet + naiveVat,
  }
}

class CapturedRequest extends Error {
  readonly xml: string

  constructor(xml: string) {
    super('A mintához elég az elkészült kérés, a Számlázz.hu nem kap hívást.')
    this.xml = xml
  }
}

async function readXmlField(body: unknown): Promise<string> {
  if (!(body instanceof FormData)) throw new Error('A kassza nem FormData kérést küldött.')
  const field = body.get(INVOICE_XML_FIELD)
  if (field === null) throw new Error(`Hiányzik a(z) ${INVOICE_XML_FIELD} mező a kérésből.`)
  return typeof field === 'string' ? field : field.text()
}

function findCapturedXml(error: unknown): string | undefined {
  if (error instanceof CapturedRequest) return error.xml
  if (error instanceof Error && error.cause !== undefined) return findCapturedXml(error.cause)
  return undefined
}

export async function renderSampleInvoiceXml(): Promise<string> {
  const kassza = createKassza({
    agentKey: SAMPLE_AGENT_KEY,
    cookieStore: false,
    fetch: async (_input, init) => {
      throw new CapturedRequest(await readXmlField(init?.body))
    },
  })
  try {
    await kassza.invoices.create(sampleInvoice)
  } catch (error) {
    const xml = findCapturedXml(error)
    if (xml !== undefined) return xml
    throw error
  }
  throw new Error('A minta XML nem készült el.')
}

export type InvoiceXmlSection = 'beallitasok' | 'fejlec' | 'vevo' | 'tetelek'

export function extractXmlSection(xml: string, tag: InvoiceXmlSection): string {
  const match = new RegExp(`^([ \\t]*)<${tag}>[\\s\\S]*?^\\1</${tag}>`, 'm').exec(xml)
  if (!match) throw new Error(`A(z) <${tag}> blokk hiányzik a minta XML-ből.`)
  const indent = match[1]?.length ?? 0
  return match[0]
    .split('\n')
    .map((line) => line.slice(Math.min(indent, line.length - line.trimStart().length)))
    .join('\n')
}

export function markAmountLines(xmlSection: string): string {
  return xmlSection
    .split('\n')
    .map((line) => (AMOUNT_TAGS.test(line) ? `${line}<!-- [!code highlight] -->` : line))
    .join('\n')
}

export interface SampleError {
  readonly code: number
  readonly category: string
  readonly message: string
  readonly hint: string | undefined
}

export function xmlErrorSample(): SampleError {
  const info = AGENT_ERROR_CODES[XML_ERROR_CODE]
  if (!info) throw new Error(`A(z) ${XML_ERROR_CODE}-es hibakód hiányzik a kasszából.`)
  return {
    code: XML_ERROR_CODE,
    category: info.category,
    message: `[${XML_ERROR_CODE}] ${info.message}`,
    hint: info.hint,
  }
}
