export interface Operation {
  readonly name: string
  readonly method: string
  readonly href: string
}

export interface OperationGroup {
  readonly title: string
  readonly operations: readonly Operation[]
}

export const OPERATION_GROUPS: readonly OperationGroup[] = [
  {
    title: 'Számlák',
    operations: [
      { name: 'Számla létrehozás', method: 'invoices.create()', href: '/docs/szamla-letrehozas' },
      { name: 'Számla sztornó', method: 'invoices.reverse()', href: '/docs/szamla-sztorno' },
      {
        name: 'Befizetés rögzítése',
        method: 'invoices.registerPayment()',
        href: '/docs/befizetes-rogzitese',
      },
      { name: 'Bizonylat PDF-ben', method: 'invoices.getPdf()', href: '/docs/bizonylat-pdf' },
      { name: 'Számla adatai', method: 'invoices.get()', href: '/docs/szamla-adatai' },
      {
        name: 'Díjbekérő törlése',
        method: 'invoices.deleteProforma()',
        href: '/docs/dijbekero-torlese',
      },
    ],
  },
  {
    title: 'Nyugták',
    operations: [
      { name: 'Nyugta létrehozás', method: 'receipts.create()', href: '/docs/nyugta-letrehozas' },
      { name: 'Nyugta sztornó', method: 'receipts.reverse()', href: '/docs/nyugta-sztorno' },
      { name: 'Nyugta lekérdezés', method: 'receipts.get()', href: '/docs/nyugta-lekerdezes' },
      { name: 'Nyugta kiküldés', method: 'receipts.send()', href: '/docs/nyugta-kikuldes' },
    ],
  },
  {
    title: 'NAV',
    operations: [
      { name: 'Adószám lekérdezés', method: 'taxpayer.query()', href: '/docs/adoszam-lekerdezes' },
    ],
  },
]

export const OPERATION_COUNT: number = OPERATION_GROUPS.reduce(
  (sum, group) => sum + group.operations.length,
  0,
)
