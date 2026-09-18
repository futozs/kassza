import { createKassza } from 'kassza'
import { simulator } from 'kassza-sandbox'

const kassza = createKassza({
  timeoutMs: 10_000,
  maxAttempts: 3,
  retryDelayMs: 250,
  hooks: {
    onRequest: ({ action, attempt }) => console.info(`→ ${action}, ${attempt}. próbálkozás`),
    onResponse: ({ action, status, durationMs }) =>
      console.info(`← ${action}: HTTP ${status}, ${durationMs} ms`),
    onError: ({ action, error, willRetry }) =>
      console.warn(`✕ ${action}: ${error.category}${willRetry ? ', újrapróbálás' : ''}`),
  },
})

const szamla = await kassza.invoices.create({
  buyer: { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' },
  items: [{ name: 'Szolgáltatás', netUnitPrice: 10_000, vat: 27 }],
})

simulator.failNext('getInvoicePdf', 'network')
const { pdf } = await kassza.invoices.getPdf(szamla.number, { signal: AbortSignal.timeout(5_000) })
console.log('A PDF a második próbálkozásra megérkezett:', pdf)
