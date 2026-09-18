import Link from 'next/link'
import { ButtonLink } from './button-link'
import { CoverageBars } from './coverage-bars'
import { LandingContainer, SectionHeading } from './section-heading'

interface Operation {
  readonly name: string
  readonly method: string
  readonly href: string
}

interface OperationGroup {
  readonly title: string
  readonly operations: readonly Operation[]
}

const GROUPS: readonly OperationGroup[] = [
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

export const OPERATION_COUNT: number = GROUPS.reduce(
  (sum, group) => sum + group.operations.length,
  0,
)

function TornEdge({ position }: { position: 'top' | 'bottom' }) {
  const id = `receipt-teeth-${position}`
  return (
    <svg
      aria-hidden="true"
      className="block h-2.5 w-full"
      preserveAspectRatio="none"
      style={position === 'top' ? { transform: 'scaleY(-1)' } : undefined}
    >
      <defs>
        <pattern id={id} width="16" height="10" patternUnits="userSpaceOnUse">
          <path d="M0 0 H16 L8 10 Z" fill="var(--receipt)" />
        </pattern>
      </defs>
      <rect width="100%" height="10" fill={`url(#${id})`} />
    </svg>
  )
}

function OperationRow({ operation }: { operation: Operation }) {
  return (
    <li>
      <Link
        href={operation.href}
        className="-mx-2 flex flex-col gap-0.5 rounded-[var(--radius-sm)] px-2 py-2 transition-colors duration-150 ease-out hover:bg-receipt-hover focus-visible:outline-receipt-accent sm:flex-row sm:items-baseline sm:gap-2"
      >
        <span className="font-medium whitespace-nowrap text-receipt-ink">{operation.name}</span>
        <span
          aria-hidden="true"
          className="hidden min-w-4 flex-1 translate-y-[-0.3em] border-b border-dotted border-receipt-rule sm:block"
        />
        <span className="font-mono text-[0.8rem] whitespace-nowrap text-receipt-muted">
          {operation.method}
        </span>
      </Link>
    </li>
  )
}

function Receipt() {
  return (
    <div className="mx-auto w-full max-w-[30rem] [filter:drop-shadow(0_18px_28px_var(--receipt-shadow))] lg:mx-0">
      <TornEdge position="top" />
      <div className="bg-receipt px-5 py-6 text-receipt-ink sm:px-8">
        <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-receipt-rule pb-4 font-mono text-xs text-receipt-muted">
          <span className="font-semibold tracking-[0.08em] text-receipt-ink uppercase">kassza</span>
          <span>Számla Agent műveletek</span>
        </div>
        {GROUPS.map((group) => (
          <div key={group.title} className="mt-5">
            <p className="flex items-baseline justify-between font-mono text-xs text-receipt-muted">
              <span className="tracking-[0.08em] uppercase">{group.title}</span>
              <span className="tnum">{group.operations.length} db</span>
            </p>
            <ul className="mt-1.5">
              {group.operations.map((operation) => (
                <OperationRow key={operation.href} operation={operation} />
              ))}
            </ul>
          </div>
        ))}
        <div className="mt-6 flex items-baseline justify-between gap-4 border-t-[3px] border-double border-receipt-rule pt-4 pb-1 font-mono">
          <span className="text-sm font-semibold tracking-[0.08em] uppercase">Összesen</span>
          <span className="tnum text-lg font-bold">{OPERATION_COUNT} művelet</span>
        </div>
      </div>
      <TornEdge position="bottom" />
    </div>
  )
}

export function OperationsSection() {
  return (
    <section aria-labelledby="muveletek" className="border-t border-rule">
      <LandingContainer className="grid gap-14 py-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center lg:gap-20 lg:py-28">
        <div className="flex min-w-0 flex-col items-start">
          <SectionHeading
            id="muveletek"
            title={`Mind a ${OPERATION_COUNT} Agent művelet, egy csomagban.`}
          >
            Számla, díjbekérő, előleg- és végszámla, helyesbítő számla, szállítólevél, nyugta,
            sztornó, befizetés, PDF, számlaadatok és adószám a NAV-tól. Minden műveletnél megvan a
            kérés, a válasz és egy minta a kóddal meg a ténylegesen elküldött XML-lel.
          </SectionHeading>
          <CoverageBars total={OPERATION_COUNT} />
          <div className="mt-8">
            <ButtonLink href="/docs" variant="secondary">
              Dokumentáció
            </ButtonLink>
          </div>
        </div>
        <Receipt />
      </LandingContainer>
    </section>
  )
}
