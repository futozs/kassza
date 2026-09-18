import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'
import { LandingContainer, SectionHeading } from './section-heading'

export interface Step {
  readonly id: string
  readonly title: string
  readonly body: ReactNode
  readonly link: { readonly href: string; readonly label: string }
  readonly code: readonly { readonly id: string; readonly node: ReactNode }[]
}

export function StepsSection({ steps }: { steps: readonly Step[] }) {
  return (
    <section aria-labelledby="hasznalat" className="border-t border-rule bg-surface">
      <LandingContainer className="py-20 lg:py-28">
        <SectionHeading id="hasznalat" title="Négy lépés, és élesben számlázol.">
          Telepítés, Agent kulcs, első számla, hibakezelés. Minden lépés mellett ott a kód, amit be
          is másolhatsz.
        </SectionHeading>

        <ol className="mt-12 flex flex-col lg:mt-16">
          {steps.map((step, index) => (
            <li
              key={step.id}
              aria-labelledby={`lepes-${step.id}`}
              className="grid gap-6 border-t border-rule-strong py-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-14 lg:py-14"
            >
              <div className="flex min-w-0 flex-col items-start lg:sticky lg:top-[calc(var(--navbar-height)+2rem)] lg:self-start">
                <span
                  aria-hidden="true"
                  className="tnum font-display text-[2.75rem] leading-none font-extrabold tracking-[-0.04em] text-accent"
                >
                  {index + 1}
                </span>
                <h3
                  id={`lepes-${step.id}`}
                  className="mt-4 font-display text-2xl font-bold tracking-[-0.018em] text-ink"
                >
                  <span className="sr-only">{index + 1}. lépés: </span>
                  {step.title}
                </h3>
                <div className="mt-3 max-w-[48ch] leading-relaxed text-ink-2">{step.body}</div>
                <Link
                  href={step.link.href}
                  className="mt-5 inline-flex items-center gap-1.5 text-[0.95rem] font-medium whitespace-nowrap text-accent underline decoration-current/35 underline-offset-4 transition-[text-decoration-color] duration-200 ease-out hover:decoration-current"
                >
                  {step.link.label}
                  <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                </Link>
              </div>
              <div className="flex min-w-0 flex-col gap-4 [&_.codeblock]:mb-0 [&_.codeblock]:bg-paper-raised max-sm:[&_pre]:text-[0.8rem]">
                {step.code.map((block) => (
                  <Fragment key={block.id}>{block.node}</Fragment>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </LandingContainer>
    </section>
  )
}
