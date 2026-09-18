import type { ReactNode } from 'react'
import { ButtonLink } from './button-link'
import { InstallCommand } from './install-command'
import type { RoundingSample } from './sample-invoice'
import { LandingContainer } from './section-heading'
import { installSnippet } from './snippets'

const forint = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 })

interface HeroProps {
  code: ReactNode
  sample: RoundingSample
  version: string
}

export function Hero({ code, sample, version }: HeroProps) {
  return (
    <section aria-labelledby="hero-title" className="border-b border-rule">
      <LandingContainer className="grid gap-10 pt-10 pb-16 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-12 lg:pt-16 lg:pb-24 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:gap-14">
        <div className="flex min-w-0 flex-col items-start">
          <h1
            id="hero-title"
            className="font-display text-[length:var(--text-display-s)] leading-[1.02] font-extrabold tracking-[-0.035em] text-balance text-ink [overflow-wrap:anywhere]"
          >
            A Számla Agent XML-t vár.{' '}
            <span className="block text-accent">Te írj TypeScriptet.</span>
          </h1>
          <p className="mt-6 max-w-[34rem] text-[length:var(--text-lede)] leading-relaxed text-ink-2">
            A kassza nem hivatalos TypeScript wrapper a Számlázz.hu Számla Agenthez. A Számlázz.hu
            XML-t vár; te típusos objektumot adsz át, a kassza pedig elkészíti a helyes kérést.
          </p>
          <InstallCommand command={installSnippet} className="mt-8" />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <ButtonLink href="/docs/alapok/telepites">Első lépések</ButtonLink>
            <ButtonLink href="/sandbox" variant="secondary">
              Próbáld ki a sandboxban
            </ButtonLink>
          </div>
          <p className="tnum mt-7 font-mono text-xs leading-relaxed text-muted">
            v{version} · MIT licenc · 0 futásidejű függőség · nem hivatalos
          </p>
        </div>

        <div className="flex min-w-0 flex-col gap-3 [&_.codeblock]:mb-0 [&_.codeblock]:shadow-[var(--shadow-lift)] [&_pre]:text-[0.84rem]">
          {code}
          <p className="text-sm leading-relaxed text-muted">
            Ebből a kassza kiszámolja:{' '}
            <span className="tnum font-mono whitespace-nowrap text-ink-2">
              nettó {forint.format(sample.net)} Ft
            </span>
            ,{' '}
            <span className="tnum font-mono whitespace-nowrap text-ink-2">
              áfa {forint.format(sample.vatAmount)} Ft
            </span>
            ,{' '}
            <span className="tnum font-mono whitespace-nowrap text-ink-2">
              bruttó {forint.format(sample.gross)} Ft
            </span>
            .{' '}
            <a
              href="#ket-nyelven"
              className="whitespace-nowrap text-accent underline decoration-current/40 underline-offset-4 hover:decoration-current"
            >
              Mutasd az XML-t
            </a>
          </p>
        </div>
      </LandingContainer>
    </section>
  )
}
