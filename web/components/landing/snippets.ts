export const heroSnippet = `import { createKassza } from 'kassza'

const kassza = createKassza()

const szamla = await kassza.invoices.create({
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
  items: [{
    name: 'Póló', // [!code highlight]
    quantity: 3, // [!code highlight]
    grossUnitPrice: 5_990, // [!code highlight]
    vat: 27, // [!code highlight]
  }],
})

console.log(szamla.grossTotal)`

export const mappingSnippets = {
  beallitasok: `const kassza = createKassza()`,
  fejlec: `await kassza.invoices.create({
  orderNumber: 'REND-1001',
  paid: true,
  paymentMethod: 'bankkártya',`,
  vevo: `  buyer: {
    name: 'Nagy Péter',
    zip: '1111',
    city: 'Budapest',
    address: 'Fő utca 1.',
    email: 'peter@example.hu',
  },`,
  tetelek: `  items: [
    {
      name: 'Póló',
      quantity: 3,
      grossUnitPrice: 5_990,
      vat: 27,
    },
  ],
})`,
} as const

export const installSnippet = 'npm i kassza'

export const envSnippet = 'SZAMLAZZ_AGENT_KEY=a-te-agent-kulcsod'

export const clientSnippet = `import { createKassza } from 'kassza'

export const kassza = createKassza()

const ervenyes = await kassza.verifyCredentials()`

export const firstInvoiceSnippet = `const szamla = await kassza.invoices.create({
  orderNumber: 'REND-1002',
  buyer: {
    name: 'Vevő Kft.',
    zip: '1111',
    city: 'Budapest',
    address: 'Fő utca 1.',
    email: 'vevo@example.hu',
    taxNumber: '12345678-2-42',
  },
  items: [
    { name: 'Webfejlesztés', quantity: 10, unit: 'óra', netUnitPrice: 15_000, vat: 27 },
  ],
})

szamla.number
szamla.grossTotal
szamla.pdf`

export const errorHandlingSnippet = `import { isSzamlazzError } from 'kassza'

const bizonytalan = ['network', 'timeout', 'partial_success', 'duplicate']

try {
  await kassza.invoices.create({ orderNumber: 'REND-1002', buyer, items })
} catch (error) {
  if (!isSzamlazzError(error)) throw error
  if (!bizonytalan.includes(error.category)) throw error

  const meglevo = await kassza.invoices.find({ orderNumber: 'REND-1002' })
  if (!meglevo) throw error
}`

export const ipnSnippet = `import { ipnOkResponse, readIpnNotification } from 'kassza/ipn'

export async function POST(request: Request) {
  const ipn = await readIpnNotification(request)

  if (ipn.isFullyPaid) await rendelesFizetve(ipn.orderNumber, ipn.paidAmount)

  return ipnOkResponse()
}`
