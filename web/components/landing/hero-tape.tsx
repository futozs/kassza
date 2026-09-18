import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { LandingContainer } from './section-heading'

export interface SiteStats {
  readonly operations: number
  readonly pages: number
  readonly examples: number
  readonly recipes: number
}

interface TapeItem {
  readonly value: number
  readonly label: string
  readonly href?: string
}

function tapeItems(stats: SiteStats): readonly TapeItem[] {
  return [
    { value: stats.operations, label: 'Agent művelet', href: '#muveletek' },
    { value: 0, label: 'futásidejű függőség' },
    { value: stats.pages, label: 'dokumentációs oldal', href: '/docs' },
    { value: stats.examples, label: 'futtatható példa', href: '/sandbox' },
    { value: stats.recipes, label: 'kész recept', href: '/docs/receptek' },
  ]
}

function TapeFigure({ item }: { item: TapeItem }) {
  return (
    <>
      <span className="tnum block font-display text-[1.75rem] leading-none font-bold tracking-[-0.02em] text-ink transition-colors duration-200 ease-out group-hover:text-accent">
        {item.value}
      </span>
      <span className="mt-2 flex items-center gap-1 text-sm whitespace-nowrap text-muted">
        <span className="decoration-rule-strong underline-offset-4 group-hover:text-ink-2 group-hover:underline">
          {item.label}
        </span>
        {item.href ? (
          <ArrowRight
            className="size-3.5 shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        ) : null}
      </span>
    </>
  )
}

export function HeroTape({ stats }: { stats: SiteStats }) {
  return (
    <div className="border-t border-dashed border-rule-strong bg-paper/85">
      <LandingContainer>
        <ul className="grid grid-cols-2 gap-x-6 gap-y-5 py-5 sm:grid-cols-3 lg:grid-cols-5 lg:py-6 short:py-3">
          {tapeItems(stats).map((item) => (
            <li key={item.label} className="min-w-0">
              {item.href ? (
                <Link
                  href={item.href}
                  className="group -m-2 block rounded-[var(--radius-md)] p-2 active:translate-y-px"
                >
                  <TapeFigure item={item} />
                </Link>
              ) : (
                <div className="-m-2 p-2">
                  <TapeFigure item={item} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </LandingContainer>
    </div>
  )
}
