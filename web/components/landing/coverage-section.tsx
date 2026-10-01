import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { CoverageBars } from './coverage-bars'
import { OPERATION_COUNT, OPERATION_GROUPS } from './operations'
import { Accent, LandingSection, SectionHeading } from './section-heading'

export function CoverageSection() {
  return (
    <LandingSection id="muveletek" className="border-y border-rule bg-surface">
      <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-20">
        <div className="flex min-w-0 flex-col">
          <SectionHeading
            id="muveletek"
            align="start"
            eyebrow="Teljes lefedettség"
            title={
              <>
                Mind a {OPERATION_COUNT} művelet. <Accent>Nem csak a számla.</Accent>
              </>
            }
          >
            Díjbekérő, végszámla, nyugta, sztornó, befizetés, PDF és adószám-lekérdezés: minden,
            amit a Számla Agent tud, egy típusos függvényhívás.
          </SectionHeading>
          <CoverageBars total={OPERATION_COUNT} />
        </div>

        <div className="grid min-w-0 content-start gap-4 sm:grid-cols-2">
          {OPERATION_GROUPS.map((group) => (
            <section
              key={group.title}
              aria-label={group.title}
              className="rounded-[var(--radius-lg)] border border-rule bg-paper p-5 first:sm:row-span-2"
            >
              <h3 className="text-sm font-semibold text-ink">{group.title}</h3>
              <ul className="mt-3 flex flex-col">
                {group.operations.map((operation) => (
                  <li key={operation.href} className="border-t border-rule first:border-t-0">
                    <Link
                      href={operation.href}
                      className="group flex items-center justify-between gap-3 py-2.5 text-[0.92rem] text-ink-2 transition-colors duration-200 hover:text-accent"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate">{operation.name}</span>
                        <code className="truncate font-mono text-[0.75rem] text-muted">
                          {operation.method}
                        </code>
                      </span>
                      <ArrowRight
                        className="size-3.5 shrink-0 text-rule-strong transition-[color,transform] duration-200 group-hover:translate-x-0.5 group-hover:text-accent"
                        aria-hidden="true"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </LandingSection>
  )
}
