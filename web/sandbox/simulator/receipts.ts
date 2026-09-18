import { bytesToBase64 } from 'kassza'
import { renderPdf } from './pdf'
import { AgentFault, formatAmount, money, type SimResponse, xmlResponse } from './respond'
import { SELLER, type SimulatorStore } from './store'
import type { SimReceipt, SimReceiptItem, SimReceiptPayment } from './types'
import { bool, child, children, number, text, type XmlElement, type XmlTree } from './xml'

export const RECEIPT_RESPONSE = {
  root: 'xmlnyugtavalasz',
  namespace: 'http://www.szamlazz.hu/xmlnyugtavalasz',
} as const

export const RECEIPT_SEND_RESPONSE = {
  root: 'xmlnyugtasendvalasz',
  namespace: 'http://www.szamlazz.hu/xmlnyugtasendvalasz',
} as const

function total(items: readonly SimReceiptItem[], pick: (item: SimReceiptItem) => number): number {
  return money(items.reduce((sum, item) => sum + pick(item), 0))
}

function receiptPdf(receipt: SimReceipt): Uint8Array {
  return renderPdf({
    title: receipt.typeCode === 'SN' ? 'SZTORNÓ NYUGTA' : 'NYUGTA',
    number: receipt.number,
    meta: [`Kelt: ${receipt.issueDate}`, `Fizetési mód: ${receipt.paymentMethod}`],
    parties: [
      {
        label: 'Eladó',
        lines: [
          SELLER.name,
          `${SELLER.zip} ${SELLER.city}, ${SELLER.address}`,
          `Adószám: ${SELLER.taxNumber}`,
        ],
      },
    ],
    rows: receipt.items.map((item) => ({
      name: item.name,
      quantity: `${item.quantity} ${item.unit}`,
      unitPrice: formatAmount(item.netUnitPrice, receipt.currency),
      vat: item.vatCode,
      net: formatAmount(item.net, receipt.currency),
      gross: formatAmount(item.gross, receipt.currency),
    })),
    totals: [
      [
        'Nettó',
        formatAmount(
          total(receipt.items, (item) => item.net),
          receipt.currency,
        ),
      ],
      [
        'ÁFA',
        formatAmount(
          total(receipt.items, (item) => item.vat),
          receipt.currency,
        ),
      ],
      [
        'Fizetendő',
        formatAmount(
          total(receipt.items, (item) => item.gross),
          receipt.currency,
        ),
      ],
    ],
    note: receipt.reversedNumber
      ? `Sztornózott nyugta: ${receipt.reversedNumber}`
      : receipt.comment,
  })
}

function vatTag(code: string): XmlTree[] {
  const numeric = Number(code)
  return Number.isFinite(numeric)
    ? [['afakulcs', numeric]]
    : [
        ['afatipus', code],
        ['afakulcs', 0],
      ]
}

function receiptTree(receipt: SimReceipt): XmlTree {
  const buckets = new Map<string, SimReceiptItem[]>()
  for (const item of receipt.items)
    buckets.set(item.vatCode, [...(buckets.get(item.vatCode) ?? []), item])
  return [
    'nyugta',
    [
      [
        'alap',
        [
          ['id', receipt.id],
          receipt.callId ? ['hivasAzonosito', receipt.callId] : undefined,
          ['nyugtaszam', receipt.number],
          ['tipus', receipt.typeCode],
          ['stornozott', receipt.reversed],
          receipt.reversedNumber ? ['stornozottNyugtaszam', receipt.reversedNumber] : undefined,
          ['kelt', receipt.issueDate],
          ['fizmod', receipt.paymentMethod],
          ['penznem', receipt.currency],
          receipt.exchangeBank ? ['devizabank', receipt.exchangeBank] : undefined,
          receipt.exchangeRate ? ['devizaarf', receipt.exchangeRate] : undefined,
          receipt.comment ? ['megjegyzes', receipt.comment] : undefined,
          receipt.customerLedgerId ? ['fokonyvVevo', receipt.customerLedgerId] : undefined,
          ['teszt', true],
          receipt.orderNumber ? ['rendelesSzam', receipt.orderNumber] : undefined,
        ],
      ],
      [
        'tetelek',
        receipt.items.map(
          (item) =>
            [
              'tetel',
              [
                item.identifier ? ['azonosito', item.identifier] : undefined,
                ['megnevezes', item.name],
                ['mennyiseg', item.quantity],
                ['mennyisegiEgyseg', item.unit],
                ['nettoEgysegar', item.netUnitPrice],
                ['netto', item.net],
                ...vatTag(item.vatCode),
                ['afa', item.vat],
                ['brutto', item.gross],
                item.ledgerRevenue || item.ledgerVat
                  ? [
                      'fokonyv',
                      [
                        ['arbevetel', item.ledgerRevenue ?? ''],
                        ['afa', item.ledgerVat ?? ''],
                      ],
                    ]
                  : undefined,
              ],
            ] satisfies XmlTree,
        ),
      ],
      receipt.payments.length > 0
        ? [
            'kifizetesek',
            receipt.payments.map(
              (payment) =>
                [
                  'kifizetes',
                  [
                    ['fizetoeszkoz', payment.method],
                    ['osszeg', payment.amount],
                    payment.description ? ['leiras', payment.description] : undefined,
                  ],
                ] satisfies XmlTree,
            ),
          ]
        : undefined,
      [
        'osszegek',
        [
          ...[...buckets.entries()].map(
            ([code, items]) =>
              [
                'afakulcsossz',
                [
                  ...vatTag(code),
                  ['netto', total(items, (item) => item.net)],
                  ['afa', total(items, (item) => item.vat)],
                  ['brutto', total(items, (item) => item.gross)],
                ],
              ] satisfies XmlTree,
          ),
          [
            'totalossz',
            [
              ['netto', total(receipt.items, (item) => item.net)],
              ['afa', total(receipt.items, (item) => item.vat)],
              ['brutto', total(receipt.items, (item) => item.gross)],
            ],
          ],
        ],
      ],
    ],
  ]
}

function receiptResponse(
  receipt: SimReceipt,
  withPdf: boolean,
  effects: readonly string[] = [],
): SimResponse {
  return xmlResponse(
    RECEIPT_RESPONSE.root,
    RECEIPT_RESPONSE.namespace,
    [
      ['sikeres', true],
      ['hibakod', ''],
      ['hibauzenet', ''],
      withPdf ? ['nyugtaPdf', bytesToBase64(receiptPdf(receipt))] : undefined,
      receiptTree(receipt),
    ],
    { effects },
  )
}

function assertCallIdUnused(store: SimulatorStore, callId: string | undefined): void {
  if (callId && store.receipts.some((receipt) => receipt.callId === callId))
    throw new AgentFault(338)
}

export function handleCreateReceipt(store: SimulatorStore, root: XmlElement): SimResponse {
  const settings = child(root, 'beallitasok')
  const header = child(root, 'fejlec')
  const prefix = text(header, 'elotag') ?? ''
  if (!/^[A-Z0-9]+$/.test(prefix)) throw new AgentFault(337)
  if (store.invoicePrefixes.has(prefix)) throw new AgentFault(336)
  const callId = text(header, 'hivasAzonosito')
  assertCallIdUnused(store, callId)

  const items: SimReceiptItem[] = children(child(root, 'tetelek'), 'tetel').map((element) => {
    const vatCode = text(element, 'afakulcs') ?? '0'
    const numeric = Number(vatCode)
    const ledger = child(element, 'fokonyv')
    return {
      name: text(element, 'megnevezes') ?? '',
      identifier: text(element, 'azonosito'),
      quantity: number(element, 'mennyiseg') ?? 1,
      unit: text(element, 'mennyisegiEgyseg') ?? 'db',
      netUnitPrice: number(element, 'nettoEgysegar') ?? 0,
      vatCode,
      vatPercent: Number.isFinite(numeric) ? numeric : 0,
      net: number(element, 'netto') ?? 0,
      vat: number(element, 'afa') ?? 0,
      gross: number(element, 'brutto') ?? 0,
      comment: text(element, 'megjegyzes'),
      ledgerRevenue: text(ledger, 'arbevetel'),
      ledgerVat: text(ledger, 'afa'),
    }
  })
  const currency = text(header, 'penznem') ?? 'HUF'
  if (currency === 'HUF' || currency === 'Ft') {
    items.forEach((item) => {
      if (!Number.isInteger(item.gross)) throw new AgentFault(363)
      if (Math.abs(item.net + item.vat - item.gross) > 0.011) throw new AgentFault(261)
    })
  }
  const payments: SimReceiptPayment[] = children(child(root, 'kifizetesek'), 'kifizetes').map(
    (element) => ({
      method: text(element, 'fizetoeszkoz') ?? '',
      amount: number(element, 'osszeg') ?? 0,
      description: text(element, 'leiras'),
    }),
  )
  if (payments.length > 0) {
    const paid = money(payments.reduce((sum, payment) => sum + payment.amount, 0))
    if (paid !== total(items, (item) => item.gross)) throw new AgentFault(340)
  }

  const year = store.today().slice(0, 4)
  const receipt: SimReceipt = {
    id: store.id(),
    number: `${prefix}-${year}-${store.sequence(`NY-${prefix}-${year}`)}`,
    prefix,
    callId,
    typeCode: 'NY',
    reversed: false,
    issueDate: store.today(),
    paymentMethod: text(header, 'fizmod') ?? '',
    currency,
    exchangeBank: text(header, 'devizabank'),
    exchangeRate: number(header, 'devizaarf'),
    comment: text(header, 'megjegyzes'),
    customerLedgerId: text(header, 'fokonyvVevo'),
    orderNumber: text(header, 'rendelesSzam'),
    items,
    payments,
    sentTo: [],
  }
  store.receipts.push(receipt)
  return receiptResponse(receipt, bool(settings, 'pdfLetoltes') !== false, [
    `Nyugta kiállítva: ${receipt.number}`,
  ])
}

export function handleReverseReceipt(store: SimulatorStore, root: XmlElement): SimResponse {
  const settings = child(root, 'beallitasok')
  const header = child(root, 'fejlec')
  const original = store.findReceipt({ number: text(header, 'nyugtaszam') })
  if (!original || original.typeCode === 'SN') throw new AgentFault(339)
  const callId = text(header, 'hivasAzonosito')
  assertCallIdUnused(store, callId)
  const year = store.today().slice(0, 4)
  const reversal: SimReceipt = {
    ...original,
    id: store.id(),
    number: `${original.prefix}-${year}-${store.sequence(`NY-${original.prefix}-${year}`)}`,
    callId,
    typeCode: 'SN',
    reversed: false,
    reversedNumber: original.number,
    issueDate: store.today(),
    items: original.items.map((item) => ({
      ...item,
      quantity: -item.quantity,
      net: -item.net,
      vat: -item.vat,
      gross: -item.gross,
    })),
    payments: original.payments.map((payment) => ({ ...payment, amount: -payment.amount })),
    sentTo: [],
  }
  original.reversed = true
  store.receipts.push(reversal)
  return receiptResponse(reversal, bool(settings, 'pdfLetoltes') !== false, [
    `Sztornó nyugta kiállítva: ${reversal.number} (eredeti: ${original.number})`,
  ])
}

export function handleGetReceipt(store: SimulatorStore, root: XmlElement): SimResponse {
  const settings = child(root, 'beallitasok')
  const header = child(root, 'fejlec')
  const receipt = store.findReceipt({
    number: text(header, 'nyugtaszam'),
    orderNumber: text(header, 'rendelesSzam'),
  })
  if (!receipt) throw new AgentFault(339)
  return receiptResponse(receipt, bool(settings, 'pdfLetoltes') !== false)
}

export function handleSendReceipt(store: SimulatorStore, root: XmlElement): SimResponse {
  const receipt = store.findReceipt({ number: text(child(root, 'fejlec'), 'nyugtaszam') })
  if (!receipt) throw new AgentFault(339)
  const emailBlock = child(root, 'emailKuldes')
  const recipients = (text(emailBlock, 'email') ?? '').split(',').filter(Boolean)
  receipt.sentTo.push(...recipients)
  return xmlResponse(
    RECEIPT_SEND_RESPONSE.root,
    RECEIPT_SEND_RESPONSE.namespace,
    [
      ['sikeres', true],
      ['hibakod', ''],
      ['hibauzenet', ''],
    ],
    {
      effects: [
        `Nyugta e-mailben: ${recipients.join(', ')}`,
        `Tárgy: ${text(emailBlock, 'emailTargy') ?? ''}`,
      ],
    },
  )
}
