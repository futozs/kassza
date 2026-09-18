import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { LandingContainer, SectionHeading } from './section-heading'

export interface MappingRow {
  readonly id: string
  readonly title: string
  readonly note: ReactNode
  readonly xml: ReactNode
  readonly ts: ReactNode
}

const CODE_CELL = 'min-w-0 [&_.codeblock]:mb-0 [&_pre]:text-[0.8rem]'

const XML_LABEL = 'Amit a Számla Agent vár'
const TS_LABEL = 'Amit te írsz'

function ColumnLabel({ children, className }: { children: string; className?: string }) {
  return <p className={cn('mb-2 text-xs font-medium text-muted', className)}>{children}</p>
}

export function ComparisonSection({ rows }: { rows: readonly MappingRow[] }) {
  return (
    <section aria-labelledby="ket-nyelven">
      <LandingContainer className="py-20 lg:py-28">
        <SectionHeading id="ket-nyelven" title="Ugyanaz a számla, két nyelven.">
          Egyik oldalon az XML, amelyet a kassza a fenti hívásból ténylegesen előállít és elküld a
          Számla Agentnek, a másikon az, amit ehhez te írsz. A sorrendet, a dátumokat és a
          kerekített összegeket a kassza tölti ki.
        </SectionHeading>

        <ol className="mt-10 flex flex-col lg:mt-14">
          {rows.map((row) => (
            <li
              key={row.id}
              aria-labelledby={`sor-${row.id}`}
              className="grid gap-5 border-t border-rule py-9 first:border-t-0 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,1fr)] lg:gap-x-6 lg:py-11 lg:first:border-t"
            >
              <div className="flex min-w-0 flex-col gap-1.5 lg:col-span-2 lg:flex-row lg:items-baseline lg:gap-8">
                <h3
                  id={`sor-${row.id}`}
                  className="shrink-0 font-display text-xl font-bold tracking-[-0.015em] text-ink lg:w-40"
                >
                  {row.title}
                </h3>
                <p className="max-w-[68ch] text-[0.95rem] leading-relaxed text-ink-2">{row.note}</p>
              </div>
              <div className={CODE_CELL}>
                <ColumnLabel>{XML_LABEL}</ColumnLabel>
                {row.xml}
              </div>
              <div className={CODE_CELL}>
                <ColumnLabel>{TS_LABEL}</ColumnLabel>
                {row.ts}
              </div>
            </li>
          ))}
        </ol>
      </LandingContainer>
    </section>
  )
}
