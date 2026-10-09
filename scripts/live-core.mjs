export function mulberry32(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const VATS = [27, 27, 27, 18, 5, 5, 0, 'AAM', 'TAM']
const UNITS = ['db', 'óra', 'kg', 'hónap']

function pick(rng, list) {
  return list[Math.floor(rng() * list.length)]
}

function money(rng, max, decimals) {
  const factor = 10 ** decimals
  return Math.max(1 / factor, Math.round(rng() * max * factor) / factor)
}

export function randomCart(rng, index) {
  const foreign = rng() < 0.25
  const currency = foreign ? 'EUR' : 'HUF'
  const decimals = foreign ? 2 : rng() < 0.2 ? 2 : 0
  const count = 1 + Math.floor(rng() * 12)
  const items = Array.from({ length: count }, (_, position) => {
    const decimalQuantity = rng() < 0.3
    const quantity = decimalQuantity
      ? Math.round((0.1 + rng() * 9.9) * 1000) / 1000
      : 1 + Math.floor(rng() * 9)
    const vat = pick(rng, VATS)
    const price = money(rng, foreign ? 500 : 50_000, decimals)
    return rng() < 0.5
      ? {
          name: `Tétel ${position + 1}`,
          quantity,
          unit: pick(rng, UNITS),
          netUnitPrice: price,
          vat,
        }
      : {
          name: `Tétel ${position + 1}`,
          quantity,
          unit: pick(rng, UNITS),
          grossUnitPrice: price,
          vat,
        }
  })
  return {
    index,
    currency,
    ...(foreign
      ? { exchangeRate: Math.round((380 + rng() * 40) * 100) / 100, exchangeBank: 'MNB' }
      : {}),
    items,
  }
}

export function localTotals(cart, money) {
  const totals = money.summarizeItems(
    cart.items.map((item) => money.calculateInvoiceItem(item, cart.currency)),
  )
  return { net: totals.netAmount, gross: totals.grossAmount }
}

export function serverTotals(headers) {
  const read = (name) => {
    const value = headers.get(name)
    if (value === null || value.trim() === '') return undefined
    const parsed = Number(value.replace(',', '.'))
    return Number.isFinite(parsed) ? parsed : undefined
  }
  const net = read('szlahu_nettovegosszeg')
  const gross = read('szlahu_bruttovegosszeg')
  return net === undefined || gross === undefined ? undefined : { net, gross }
}

export function compareTotals(local, server, tolerance = 0.005) {
  if (!server) return 'inconclusive'
  return Math.abs(local.net - server.net) <= tolerance &&
    Math.abs(local.gross - server.gross) <= tolerance
    ? 'match'
    : 'mismatch'
}

export function throttle(fetchImpl, delayMs) {
  let next = 0
  return async (input, init) => {
    const wait = next - Date.now()
    next = Math.max(next, Date.now()) + delayMs
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
    return fetchImpl(input, init)
  }
}

export function capturingFetch(fetchImpl) {
  const captured = { headers: undefined }
  const wrapped = async (input, init) => {
    const response = await fetchImpl(input, init)
    captured.headers = new Headers(response.headers)
    return response
  }
  return { fetch: wrapped, captured }
}

export const PROBE_LENGTHS = [1, 10, 50, 100, 200, 256, 500, 1000]
export const PROBE_CHARACTERS = {
  ekezet: 'Árvíztűrő tükörfúrógép ŐŰőű',
  emoji: 'Kávé ☕ 🧾',
  tab: 'a\tb',
  sortores: 'első\nmásodik',
  nbsp: 'a b',
  xml: '<Kiss & "Fia"> \'Bt.\'',
  zeroWidth: 'a​b',
}

export async function assertTestAccount(kassza, orderNumber) {
  const proforma = await kassza.invoices.create({
    type: 'proforma',
    orderNumber,
    buyer: {
      name: 'Kassza szonda',
      zip: '1111',
      city: 'Budapest',
      address: 'Szonda utca 1.',
      sendEmail: false,
    },
    items: [{ name: 'Szonda', netUnitPrice: 1, vat: 27 }],
    downloadPdf: false,
  })
  const details = await kassza.invoices.get(proforma.number, { includePdf: false })
  await kassza.invoices.deleteProforma(proforma.number).catch(() => undefined)
  if (details.header.test !== true) {
    throw new Error('A kulcs nem tesztfiókhoz tartozik. Élő fiókon ez a szkript nem futhat.')
  }
}
