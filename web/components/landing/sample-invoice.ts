import { type CreateInvoiceInput, createKassza } from 'kassza'

const SAMPLE_ITEM_NAME = 'Póló'
const SAMPLE_UNIT_PRICE = 5_990
const SAMPLE_QUANTITY = 3
const SAMPLE_VAT = 27
const SAMPLE_AGENT_KEY = 'a-te-agent-kulcsod'
const INVOICE_XML_FIELD = 'action-xmlagentxmlfile'

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
    {
      name: SAMPLE_ITEM_NAME,
      quantity: SAMPLE_QUANTITY,
      grossUnitPrice: SAMPLE_UNIT_PRICE,
      vat: SAMPLE_VAT,
    },
  ],
} satisfies CreateInvoiceInput

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
