import { type PdfDocument, renderPdf } from './pdf'
import {
  AgentFault,
  formatAmount,
  money,
  pdfElement,
  type SimResponse,
  xmlResponse,
} from './respond'
import { SELLER, type SimulatorStore } from './store'
import type { InvoiceTypeCode, SimBuyer, SimInvoice, SimItem, SimPayment } from './types'
import { bool, child, children, number, text, type XmlElement, type XmlTree } from './xml'

export const INVOICE_RESPONSE = {
  root: 'xmlszamlavalasz',
  namespace: 'http://www.szamlazz.hu/xmlszamlavalasz',
} as const

export const PROFORMA_DELETE_RESPONSE = {
  root: 'xmlszamladbkdelvalasz',
  namespace: 'http://www.szamlazz.hu/xmlszamladbkdelvalasz',
} as const

const TYPE_TITLES: Readonly<Record<InvoiceTypeCode, string>> = {
  SZ: 'SZÁMLA',
  D: 'DÍJBEKÉRŐ',
  ES: 'ELŐLEGSZÁMLA',
  VS: 'VÉGSZÁMLA',
  HS: 'HELYESBÍTŐ SZÁMLA',
  SS: 'SZTORNÓ SZÁMLA',
  SL: 'SZÁLLÍTÓLEVÉL',
}

function sum(items: readonly SimItem[], pick: (item: SimItem) => number): number {
  return money(items.reduce((total, item) => total + pick(item), 0))
}

export function invoiceTotals(invoice: SimInvoice): {
  net: number
  vat: number
  gross: number
  outstanding: number
} {
  const gross = sum(invoice.items, (item) => item.gross)
  const paid = money(invoice.payments.reduce((total, payment) => total + payment.amount, 0))
  return {
    net: sum(invoice.items, (item) => item.net),
    vat: sum(invoice.items, (item) => item.vat),
    gross,
    outstanding: invoice.typeCode === 'SS' ? 0 : money(Math.max(0, gross - paid)),
  }
}

export function invoicePdf(invoice: SimInvoice): Uint8Array {
  const totals = invoiceTotals(invoice)
  const doc: PdfDocument = {
    title:
      invoice.eInvoice && invoice.typeCode === 'SZ' ? 'E-SZÁMLA' : TYPE_TITLES[invoice.typeCode],
    number: invoice.number,
    meta: [
      `Kelt: ${invoice.issueDate}`,
      `Teljesítés: ${invoice.fulfillmentDate}`,
      `Fizetési határidő: ${invoice.dueDate}`,
      `Fizetési mód: ${invoice.paymentMethod}`,
    ],
    parties: [
      {
        label: 'Eladó',
        lines: [
          SELLER.name,
          `${SELLER.zip} ${SELLER.city}, ${SELLER.address}`,
          `Adószám: ${SELLER.taxNumber}`,
        ],
      },
      {
        label: 'Vevő',
        lines: [
          invoice.buyer.name,
          `${invoice.buyer.zip} ${invoice.buyer.city}, ${invoice.buyer.address}`,
          ...(invoice.buyer.taxNumber ? [`Adószám: ${invoice.buyer.taxNumber}`] : []),
        ],
      },
    ],
    rows: invoice.items.map((item) => ({
      name: item.name,
      quantity: `${item.quantity} ${item.unit}`,
      unitPrice: formatAmount(item.netUnitPrice, invoice.currency),
      vat: item.vatCode,
      net: formatAmount(item.net, invoice.currency),
      gross: formatAmount(item.gross, invoice.currency),
    })),
    totals: [
      ['Nettó összesen', formatAmount(totals.net, invoice.currency)],
      ['ÁFA összesen', formatAmount(totals.vat, invoice.currency)],
      ['Bruttó végösszeg', formatAmount(totals.gross, invoice.currency)],
    ],
    note: invoice.referencedInvoiceNumber
      ? `Hivatkozott bizonylat: ${invoice.referencedInvoiceNumber}`
      : invoice.comment,
  }
  return renderPdf(doc)
}

function documentHeaders(invoice: SimInvoice): (readonly [string, string])[] {
  const totals = invoiceTotals(invoice)
  return [
    ['szlahu_szamlaszam', encodeURIComponent(invoice.number)],
    ['szlahu_nettovegosszeg', String(totals.net)],
    ['szlahu_bruttovegosszeg', String(totals.gross)],
    ['szlahu_kintlevoseg', String(totals.outstanding)],
  ]
}

export function invoiceResult(
  invoice: SimInvoice,
  withPdf: boolean,
  effects: readonly string[] = [],
): SimResponse {
  const totals = invoiceTotals(invoice)
  return xmlResponse(
    INVOICE_RESPONSE.root,
    INVOICE_RESPONSE.namespace,
    [
      ['sikeres', true],
      ['szamlaszam', invoice.number],
      ['szamlanetto', totals.net],
      ['szamlabrutto', totals.gross],
      ['kintlevoseg', totals.outstanding],
      withPdf && pdfElement(invoicePdf(invoice)),
    ],
    { headers: documentHeaders(invoice), effects },
  )
}

function parseItems(root: XmlElement): SimItem[] {
  return children(child(root, 'tetelek'), 'tetel').map((element) => {
    const vatCode = text(element, 'afakulcs') ?? '0'
    const numeric = Number(vatCode)
    return {
      name: text(element, 'megnevezes') ?? '',
      identifier: text(element, 'azonosito'),
      quantity: number(element, 'mennyiseg') ?? 1,
      unit: text(element, 'mennyisegiEgyseg') ?? 'db',
      netUnitPrice: number(element, 'nettoEgysegar') ?? 0,
      vatCode,
      vatPercent: Number.isFinite(numeric) ? numeric : 0,
      net: number(element, 'nettoErtek') ?? 0,
      vat: number(element, 'afaErtek') ?? 0,
      gross: number(element, 'bruttoErtek') ?? 0,
      comment: text(element, 'megjegyzes'),
    }
  })
}

function assertItemAmounts(items: readonly SimItem[]): void {
  items.forEach((item) => {
    if (Math.abs(item.net + item.vat - item.gross) > 0.011) throw new AgentFault(261)
    if (Math.abs((item.net * item.vatPercent) / 100 - item.vat) > 1.01) throw new AgentFault(260)
    if (Math.abs(item.netUnitPrice * item.quantity - item.net) > 1.01) throw new AgentFault(259)
  })
}

function parseBuyer(root: XmlElement): SimBuyer {
  const buyer = child(root, 'vevo')
  return {
    name: text(buyer, 'nev') ?? '',
    country: text(buyer, 'orszag'),
    zip: text(buyer, 'irsz') ?? '',
    city: text(buyer, 'telepules') ?? '',
    address: text(buyer, 'cim') ?? '',
    email: text(buyer, 'email'),
    taxNumber: text(buyer, 'adoszam'),
    euTaxNumber: text(buyer, 'adoszamEU'),
    identifier: text(buyer, 'azonosito'),
    phone: text(buyer, 'telefonszam'),
  }
}

function resolveTypeCode(header: XmlElement | undefined): InvoiceTypeCode {
  if (bool(header, 'dijbekero')) return 'D'
  if (bool(header, 'elolegszamla')) return 'ES'
  if (bool(header, 'vegszamla')) return 'VS'
  if (bool(header, 'helyesbitoszamla')) return 'HS'
  if (bool(header, 'szallitolevel')) return 'SL'
  return 'SZ'
}

function nextInvoiceNumber(
  store: SimulatorStore,
  typeCode: InvoiceTypeCode,
  prefix: string,
  eInvoice: boolean,
): string {
  const year = store.today().slice(0, 4)
  if (typeCode === 'D') return `D-${prefix}-${year}-${store.sequence(`D-${prefix}-${year}`)}`
  if (typeCode === 'SL') return `SL-${prefix}-${year}-${store.sequence(`SL-${prefix}-${year}`)}`
  const sequence = store.sequence(`SZ-${prefix}-${year}`)
  return `${eInvoice ? 'E-' : ''}${prefix}-${year}-${sequence}`
}

export function handleCreateInvoice(store: SimulatorStore, root: XmlElement): SimResponse {
  const settings = child(root, 'beallitasok')
  const header = child(root, 'fejlec')
  const prefix = text(header, 'szamlaszamElotag') ?? store.defaultInvoicePrefix
  if (!store.invoicePrefixes.has(prefix)) throw new AgentFault(202)

  const items = parseItems(root)
  assertItemAmounts(items)
  const typeCode = resolveTypeCode(header)
  const orderNumber = text(header, 'rendelesSzam')
  const proformaNumber = text(header, 'dijbekeroSzamlaszam')
  const preview = bool(header, 'elonezetpdf') === true
  const eInvoice = bool(settings, 'eszamla') === true
  const withPdf = bool(settings, 'szamlaLetoltes') !== false

  if (
    proformaNumber &&
    !store.invoices.some((invoice) => invoice.typeCode === 'D' && invoice.number === proformaNumber)
  ) {
    throw new AgentFault(335)
  }
  const correctedNumber = text(header, 'helyesbitettSzamlaszam')
  if (typeCode === 'HS' && correctedNumber && !store.findInvoice({ number: correctedNumber })) {
    throw new AgentFault(7)
  }
  const advanceNumber = text(header, 'elolegSzamlaszam')
  if (typeCode === 'VS' && advanceNumber && !store.findInvoice({ number: advanceNumber })) {
    throw new AgentFault(7)
  }
  if (
    !preview &&
    orderNumber &&
    store.forbidDuplicateOrderNumbers &&
    store.invoices.some(
      (invoice) => invoice.orderNumber === orderNumber && invoice.typeCode === typeCode,
    )
  ) {
    throw new AgentFault(71)
  }

  const paymentMethod = text(header, 'fizmod') ?? 'Átutalás'
  const draft: SimInvoice = {
    id: store.id(),
    number: preview ? 'ELŐNÉZET' : nextInvoiceNumber(store, typeCode, prefix, eInvoice),
    typeCode,
    prefix,
    eInvoice,
    issueDate: text(header, 'keltDatum') ?? store.today(),
    fulfillmentDate: text(header, 'teljesitesDatum') ?? store.today(),
    dueDate: text(header, 'fizetesiHataridoDatum') ?? store.today(),
    paymentMethod,
    currency: text(header, 'penznem') ?? 'HUF',
    language: text(header, 'szamlaNyelve') ?? 'hu',
    exchangeBank: text(header, 'arfolyamBank'),
    exchangeRate: number(header, 'arfolyam'),
    comment: text(header, 'megjegyzes'),
    orderNumber,
    externalId: text(settings, 'szamlaKulsoAzon'),
    proformaNumber,
    referencedInvoiceNumber: correctedNumber ?? advanceNumber,
    buyer: parseBuyer(root),
    items,
    payments: [],
    reversed: false,
    deleted: false,
  }

  if (preview) {
    return xmlResponse(INVOICE_RESPONSE.root, INVOICE_RESPONSE.namespace, [
      ['sikeres', true],
      pdfElement(invoicePdf(draft)),
    ])
  }

  if (bool(header, 'fizetve') === true) {
    draft.payments = [
      { date: draft.issueDate, method: paymentMethod, amount: invoiceTotals(draft).gross },
    ]
  }
  store.invoices.push(draft)

  const effects: string[] = [`Bizonylat kiállítva: ${draft.number}`]
  const email = draft.buyer.email
  if (email && bool(child(root, 'vevo'), 'sendEmail') !== false && typeCode !== 'SL') {
    effects.push(`Számlaértesítő e-mail a vevőnek: ${email}`)
  }
  if (proformaNumber) effects.push(`Díjbekérő hivatkozva: ${proformaNumber}`)
  return invoiceResult(draft, withPdf, effects)
}

export function handleReverseInvoice(store: SimulatorStore, root: XmlElement): SimResponse {
  const settings = child(root, 'beallitasok')
  const header = child(root, 'fejlec')
  const original = store.findInvoice({ number: text(header, 'szamlaszam') })
  if (!original) throw new AgentFault(7)
  const withPdf = bool(settings, 'szamlaLetoltes') !== false
  if (original.typeCode === 'D' || original.typeCode === 'SL') {
    return invoiceResult(original, withPdf, [
      'A díjbekérő és a szállítólevél nem sztornózható, a válasz az eredeti bizonylat.',
    ])
  }
  if (original.reversed || original.typeCode === 'SS') {
    throw new AgentFault(undefined, 'A bizonylat már sztornózva van, vagy maga is sztornó számla.')
  }
  const eInvoice = bool(settings, 'eszamla') === true
  const reversal: SimInvoice = {
    ...original,
    id: store.id(),
    number: nextInvoiceNumber(store, 'SS', original.prefix, eInvoice),
    typeCode: 'SS',
    eInvoice,
    issueDate: text(header, 'keltDatum') ?? store.today(),
    fulfillmentDate: text(header, 'teljesitesDatum') ?? original.fulfillmentDate,
    comment: text(header, 'megjegyzes'),
    externalId: text(settings, 'szamlaKulsoAzon'),
    referencedInvoiceNumber: original.number,
    items: original.items.map((item) => ({
      ...item,
      quantity: -item.quantity,
      net: -item.net,
      vat: -item.vat,
      gross: -item.gross,
    })),
    payments: [],
    reversed: false,
  }
  original.reversed = true
  store.invoices.push(reversal)
  return invoiceResult(reversal, withPdf, [
    `Sztornó számla kiállítva: ${reversal.number} (eredeti: ${original.number})`,
  ])
}

export function handleRegisterPayment(store: SimulatorStore, root: XmlElement): SimResponse {
  const settings = child(root, 'beallitasok')
  const invoice = store.findInvoice({ number: text(settings, 'szamlaszam') })
  if (!invoice || invoice.typeCode === 'D' || invoice.typeCode === 'SL') throw new AgentFault(7)
  const entries: SimPayment[] = children(root, 'kifizetes').map((element) => ({
    date: text(element, 'datum') ?? store.today(),
    method: text(element, 'jogcim') ?? 'átutalás',
    amount: number(element, 'osszeg') ?? 0,
    description: text(element, 'leiras'),
  }))
  const additive = bool(settings, 'additiv') !== false
  invoice.payments = additive ? [...invoice.payments, ...entries] : entries
  const effects =
    entries.length === 0
      ? [`A(z) ${invoice.number} számla befizetései törölve.`]
      : entries.map(
          (entry) =>
            `Befizetés rögzítve: ${formatAmount(entry.amount, invoice.currency)} (${entry.method})`,
        )
  return invoiceResult(invoice, false, effects)
}

function referenceOf(root: XmlElement): {
  number?: string
  orderNumber?: string
  externalId?: string
} {
  const reference: { number?: string; orderNumber?: string; externalId?: string } = {}
  const invoiceNumber = text(root, 'szamlaszam')
  const orderNumber = text(root, 'rendelesSzam')
  const externalId = text(root, 'szamlaKulsoAzon')
  if (invoiceNumber) reference.number = invoiceNumber
  if (orderNumber) reference.orderNumber = orderNumber
  if (externalId) reference.externalId = externalId
  return reference
}

export function handleGetInvoicePdf(store: SimulatorStore, root: XmlElement): SimResponse {
  const invoice = store.findInvoice(referenceOf(root))
  if (!invoice) throw new AgentFault(7)
  return invoiceResult(invoice, true)
}

function addressTree(
  name: string,
  address: { country?: string | undefined; zip: string; city: string; address: string },
): XmlTree {
  return [
    name,
    [
      ['orszag', address.country ?? 'Magyarország'],
      ['irsz', address.zip],
      ['telepules', address.city],
      ['cim', address.address],
    ],
  ]
}

function vatBuckets(items: readonly SimItem[]): XmlTree[] {
  const buckets = new Map<string, SimItem[]>()
  for (const item of items) buckets.set(item.vatCode, [...(buckets.get(item.vatCode) ?? []), item])
  return [...buckets.entries()].map(([code, bucket]) => {
    const numeric = Number(code)
    return [
      'afakulcsossz',
      [
        Number.isFinite(numeric) ? undefined : ['afatipus', code],
        ['afakulcs', Number.isFinite(numeric) ? numeric : 0],
        ['netto', sum(bucket, (item) => item.net)],
        ['afa', sum(bucket, (item) => item.vat)],
        ['brutto', sum(bucket, (item) => item.gross)],
      ],
    ] satisfies XmlTree
  })
}

export function handleGetInvoiceXml(store: SimulatorStore, root: XmlElement): SimResponse {
  const invoice = store.findInvoice(referenceOf(root))
  if (!invoice) throw new AgentFault(7)
  const totals = invoiceTotals(invoice)
  return xmlResponse('szamla', 'http://www.szamlazz.hu/szamla', [
    [
      'szallito',
      [
        ['id', 1],
        ['nev', SELLER.name],
        addressTree('cim', SELLER),
        ['adoszam', SELLER.taxNumber],
        [
          'bank',
          [
            ['nev', SELLER.bank],
            ['bankszamla', SELLER.bankAccount],
          ],
        ],
      ],
    ],
    [
      'alap',
      [
        ['id', invoice.id],
        ['szamlaszam', invoice.number],
        ['forras', 1],
        ['tipus', invoice.typeCode],
        ['eszamla', invoice.eInvoice ? 2 : 0],
        invoice.referencedInvoiceNumber
          ? ['hivszamlaszam', invoice.referencedInvoiceNumber]
          : undefined,
        invoice.proformaNumber ? ['hivdijbekszam', invoice.proformaNumber] : undefined,
        ['kelt', invoice.issueDate],
        ['telj', invoice.fulfillmentDate],
        ['fizh', invoice.dueDate],
        ['fizmod', invoice.paymentMethod],
        ['keszpenz', /készpénz/i.test(invoice.paymentMethod)],
        invoice.orderNumber ? ['rendelesszam', invoice.orderNumber] : undefined,
        ['nyelv', invoice.language],
        ['devizanem', invoice.currency],
        invoice.exchangeBank ? ['devizabank', invoice.exchangeBank] : undefined,
        invoice.exchangeRate ? ['devizaarf', invoice.exchangeRate] : undefined,
        invoice.comment ? ['megjegyzes', invoice.comment] : undefined,
        ['penzforg', false],
        ['kata', false],
        invoice.buyer.email ? ['email', invoice.buyer.email] : undefined,
        ['teszt', true],
        ['sztornozott', invoice.reversed],
      ],
    ],
    [
      'vevo',
      [
        ['id', invoice.id + 50_000],
        ['nev', invoice.buyer.name],
        invoice.buyer.identifier ? ['azonosito', invoice.buyer.identifier] : undefined,
        addressTree('cim', invoice.buyer),
        invoice.buyer.email ? ['email', invoice.buyer.email] : undefined,
        invoice.buyer.taxNumber ? ['adoszam', invoice.buyer.taxNumber] : undefined,
        invoice.buyer.euTaxNumber ? ['adoszameu', invoice.buyer.euTaxNumber] : undefined,
      ],
    ],
    [
      'tetelek',
      invoice.items.map((item, index) => {
        const numeric = Number(item.vatCode)
        return [
          'tetel',
          [
            ['nev', item.name],
            item.identifier ? ['azonosito', item.identifier] : undefined,
            ['mennyiseg', item.quantity],
            ['mennyisegiegyseg', item.unit],
            ['nettoegysegar', item.netUnitPrice],
            ['afakulcs', Number.isFinite(numeric) ? numeric : 0],
            Number.isFinite(numeric) ? undefined : ['afatipus', item.vatCode],
            ['netto', item.net],
            ['afa', item.vat],
            ['brutto', item.gross],
            item.comment ? ['megjegyzes', item.comment] : undefined,
            ['sztetordering', index + 1],
          ],
        ] satisfies XmlTree
      }),
    ],
    [
      'osszegek',
      [
        ...vatBuckets(invoice.items),
        [
          'totalossz',
          [
            ['netto', totals.net],
            ['afa', totals.vat],
            ['brutto', totals.gross],
          ],
        ],
      ],
    ],
    invoice.payments.length > 0
      ? [
          'kifizetesek',
          invoice.payments.map(
            (payment) =>
              [
                'kifizetes',
                [
                  ['datum', payment.date],
                  ['jogcim', payment.method],
                  ['osszeg', payment.amount],
                  payment.description ? ['megjegyzes', payment.description] : undefined,
                ],
              ] satisfies XmlTree,
          ),
        ]
      : undefined,
    bool(root, 'pdf') === true ? pdfElement(invoicePdf(invoice)) : undefined,
  ])
}

export function handleDeleteProforma(store: SimulatorStore, root: XmlElement): SimResponse {
  const header = child(root, 'fejlec')
  const number = text(header, 'szamlaszam')
  const orderNumber = text(header, 'rendelesszam')
  const proforma = store.invoices.findLast(
    (invoice) =>
      invoice.typeCode === 'D' &&
      !invoice.deleted &&
      (number ? invoice.number === number : invoice.orderNumber === orderNumber),
  )
  if (!proforma) throw new AgentFault(335)
  proforma.deleted = true
  return xmlResponse(
    PROFORMA_DELETE_RESPONSE.root,
    PROFORMA_DELETE_RESPONSE.namespace,
    [
      ['sikeres', true],
      ['hibakod', ''],
      ['hibauzenet', ''],
    ],
    { effects: [`Díjbekérő törölve: ${proforma.number}`] },
  )
}
