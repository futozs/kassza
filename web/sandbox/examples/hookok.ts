import { createKassza } from 'kassza'
import { simulator } from 'kassza-sandbox'

const naplo: string[] = []

const kassza = createKassza({
  timeoutMs: 10_000,
  maxAttempts: 3,
  retryDelayMs: 250,
  hooks: {
    onRequest: ({ action, attempt }) => naplo.push(`→ ${action}, ${attempt}. próbálkozás`),
    onResponse: ({ action, status, durationMs }) =>
      naplo.push(`← ${action}: HTTP ${status}, ${durationMs} ms`),
    onError: ({ action, error, willRetry }) =>
      naplo.push(`✕ ${action}: ${error.category}${willRetry ? ', újrapróbálás' : ''}`),
  },
})

const szamla = await kassza.invoices.create({
  buyer: { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' },
  items: [{ name: 'Szolgáltatás', netUnitPrice: 10_000, vat: 27 }],
})

simulator.failNext('getInvoicePdf', 'network')
await kassza.invoices.getPdf(szamla.number, { signal: AbortSignal.timeout(5_000) })
