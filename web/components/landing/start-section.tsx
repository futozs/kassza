import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Accent, LandingSection, SectionHeading } from './section-heading'

export interface StartStep {
  readonly title: string
  readonly body: ReactNode
  readonly code: ReactNode
  readonly link: { readonly href: string; readonly label: string }
}

export function StartSection({ steps }: { steps: readonly StartStep[] }) {
  return (
    <LandingSection id="kezdes">
      <SectionHeading
        id="kezdes"
        eyebrow="Kezdés"
        title={
          <>
            Három lépés <Accent>az első számláig.</Accent>
          </>
        }
      />
      <ol className="start-steps mt-14 grid gap-4 lg:grid-cols-3">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="flex min-w-0 flex-col rounded-[var(--radius-lg)] border border-rule bg-paper p-6 sm:p-7"
          >
            <span className="tnum font-mono text-sm font-medium text-accent">0{index + 1}</span>
            <h3 className="mt-3 text-[1.05rem] font-semibold text-ink">{step.title}</h3>
            <div className="mt-2 text-[0.95rem] leading-relaxed text-ink-2">{step.body}</div>
            <div className="mt-5 flex-1">{step.code}</div>
            <Link
              href={step.link.href}
              className="group mt-5 inline-flex items-center gap-1.5 self-start text-sm font-medium text-accent"
            >
              {step.link.label}
              <ArrowRight
                className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ol>
    </LandingSection>
  )
}
