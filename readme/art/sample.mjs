export const SAMPLE_CODE = [
  "import { createKassza } from 'kassza'",
  '',
  'const kassza = createKassza()',
  '',
  'const szamla = await kassza.invoices.create({',
  "  orderNumber: 'REND-1001',",
  "  paymentMethod: 'átutalás',",
  '  paymentDueInDays: 8,',
  '  buyer: {',
  "    name: 'Vevő Kft.',",
  "    zip: '1111',",
  "    city: 'Budapest',",
  "    address: 'Fő utca 1.',",
  "    email: 'vevo@example.hu',",
  "    taxNumber: '12345676-2-41',",
  '  },',
  '  items: [',
  "    { name: 'Webfejlesztés', quantity: 10, unit: 'óra', netUnitPrice: 15_000, vat: 27 },",
  "    { name: 'Tárhely, 12 hónap', netUnitPrice: 24_000, vat: 27 },",
  '  ],',
  '})',
  '',
  'console.log(szamla.number)',
  'console.log({ netto: szamla.netTotal, brutto: szamla.grossTotal })',
]

const SAMPLE_INPUT = {
  orderNumber: 'REND-1001',
  paymentMethod: 'átutalás',
  paymentDueInDays: 8,
  issueDate: '2026-09-18',
  buyer: {
    name: 'Vevő Kft.',
    zip: '1111',
    city: 'Budapest',
    address: 'Fő utca 1.',
    email: 'vevo@example.hu',
    taxNumber: '12345676-2-41',
  },
  items: [
    { name: 'Webfejlesztés', quantity: 10, unit: 'óra', netUnitPrice: 15_000, vat: 27 },
    { name: 'Tárhely, 12 hónap', netUnitPrice: 24_000, vat: 27 },
  ],
}

async function loadKassza() {
  try {
    return await import('kassza')
  } catch (error) {
    throw new Error(
      'A showcase XML-jéhez a lefordított csomag kell. Futtasd előbb: npm run build',
      {
        cause: error,
      },
    )
  }
}

export async function sampleInvoiceXml() {
  const { createKassza } = await loadKassza()
  let xml = null
  const kassza = createKassza({
    agentKey: 'readme',
    fetch: async (_url, init) => {
      const [document] = init.body.values()
      xml = await document.text()
      throw new Error('A README showcase kérése rögzítve.')
    },
  })
  try {
    await kassza.invoices.create(SAMPLE_INPUT)
  } catch (error) {
    if (xml === null) throw error
  }
  return xml
    .replace(
      /<szamlaagentkulcs>[^<]*<\/szamlaagentkulcs>/,
      '<szamlaagentkulcs>••••••••</szamlaagentkulcs>',
    )
    .trimEnd()
    .split('\n')
}
