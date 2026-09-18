import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { ButtonLink } from './button-link'
import { HeroTape, type SiteStats } from './hero-tape'
import { InstallCommand } from './install-command'
import { type RoundingSample, SAMPLE_ITEM_NAME, sampleInvoice } from './sample-invoice'
import { LandingContainer } from './section-heading'
import { installSnippet } from './snippets'

interface HeroProps {
  code: ReactNode
  sample: RoundingSample
  version: string
  stats: SiteStats
}

function RecipesAnnouncement({ count }: { count: number }) {
  return (
    <Link
      href="/docs/receptek"
      className="group inline-flex max-w-full items-center gap-2.5 rounded-full border border-rule-strong bg-paper-raised py-1 pr-3 pl-1 text-sm text-ink-2 transition-[border-color,color] duration-200 ease-out hover:border-ink-2 hover:text-ink active:translate-y-px"
    >
      <span className="shrink-0 rounded-full bg-amber px-2 py-0.5 font-mono text-[0.7rem] font-bold tracking-[0.1em] text-[var(--amber-tag-ink)]">
        ÚJ
      </span>
      <span className="truncate">{count} kész recept: Stripe, IPN, Workers</span>
      <ArrowRight
        className="size-3.5 shrink-0 text-accent transition-transform duration-200 ease-out group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  )
}

export function Hero({ code, sample, version, stats }: HeroProps) {
  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-[calc(100svh-var(--navbar-height))] flex-col border-b border-rule"
    >
      <div
        aria-hidden="true"
        className="hero-backdrop pointer-events-none absolute inset-0 -z-10"
      />
      <LandingContainer className="grid flex-1 content-center items-center gap-12 py-10 sm:py-14 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-10 lg:py-12 xl:gap-14 short:py-6">
        <div className="flex min-w-0 flex-col items-start">
          <RecipesAnnouncement count={stats.recipes} />
          <h1
            id="hero-title"
            className="mt-7 font-display short:mt-5 text-[length:var(--text-display-s)] leading-[1.02] font-extrabold tracking-[-0.035em] text-balance text-ink [overflow-wrap:anywhere]"
          >
            A Számlázz.hu Agent XML-t vár.{' '}
            <span className="block text-accent">Te írj TypeScriptet.</span>
          </h1>
          <p className="mt-6 max-w-[34rem] text-[length:var(--text-lede)] leading-relaxed text-ink-2 short:mt-4">
            A kassza nem hivatalos TypeScript wrapper a Számlázz.hu Számla Agenthez. A Számlázz.hu
            XML-t vár; te típusos objektumot adsz át, a kassza pedig elkészíti a helyes kérést.
          </p>
          <InstallCommand command={installSnippet} className="mt-8 short:mt-5" />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <ButtonLink href="/docs/alapok/telepites">Első lépések</ButtonLink>
            <ButtonLink href="/sandbox" variant="secondary">
              Próbáld ki a sandboxban
            </ButtonLink>
          </div>
          <p className="tnum mt-7 font-mono text-xs leading-relaxed text-muted short:hidden">
            v{version} · MIT licenc · nem hivatalos
          </p>
        </div>

        <div className="relative min-w-0">
          <div className="hero-code">{code}</div>
          <p className="mt-5 max-w-[32rem] text-sm leading-relaxed text-muted xl:mt-4 short:hidden">
            A számla összegeit a kassza hivatalos kerekítése adja, pont úgy, ahogy a Számlázz.hu
            ellenőrzi.{' '}
            <a
              href="#ket-nyelven"
              className="whitespace-nowrap text-accent underline decoration-current/40 underline-offset-4 hover:decoration-current"
            >
              Mutasd az XML-t
            </a>
          </p>
        </div>
      </LandingContainer>
      <HeroTape stats={stats} />
    </section>
  )
}
