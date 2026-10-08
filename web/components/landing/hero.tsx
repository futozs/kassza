import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { type HeroInvoice, HeroStage } from './hero-stage'
import { LandingContainer } from './landing-container'

function Line({ index, children }: { index: number; children: ReactNode }) {
  return (
    <span className="hero-line">
      <span className="hero-line-inner" style={{ '--i': index } as CSSProperties}>
        {children}
      </span>
    </span>
  )
}

export function Hero({
  invoice,
  version,
  operations,
}: {
  invoice: HeroInvoice
  version: string
  operations: number
}) {
  return (
    <section aria-labelledby="hero-title" className="hero relative isolate">
      <noscript>
        <style>{'.hs-scene *,.hs-scene *::after{animation:none!important}'}</style>
      </noscript>
      <LandingContainer className="flex flex-col items-center pt-14 pb-20 text-center sm:pt-20 lg:pt-24 lg:pb-24">
        <Link
          href="/docs"
          className="hero-fade hero-pill group"
          style={{ '--i': 0 } as CSSProperties}
        >
          <span className="hero-pill-tag tnum">v{version}</span>
          Mind a {operations} Számla Agent művelet
          <ArrowRight
            className="size-3.5 text-muted transition-transform duration-300 group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </Link>

        <h1 id="hero-title" className="hero-title mt-8">
          <Line index={1}>Számlázz és nyugtázz</Line>
          <Line index={2}>
            <span className="hero-accent">TypeScriptből.</span>
          </Line>
        </h1>

        <p
          className="hero-fade mt-7 max-w-[36rem] text-[clamp(1.05rem,0.5vw+0.95rem,1.25rem)] leading-relaxed text-pretty text-ink-2"
          style={{ '--i': 4 } as CSSProperties}
        >
          Egy függvényhívás, és a számla kész a Számlázz.hu-n.
        </p>

        <div
          className="hero-fade mt-9 flex flex-wrap items-center justify-center gap-3"
          style={{ '--i': 5 } as CSSProperties}
        >
          <Link href="/docs/alapok/telepites" className="pill-button pill-button--primary group">
            Kezdd el
            <ArrowRight
              className="size-4 transition-transform duration-300 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
          <Link href="/sandbox" className="pill-button pill-button--secondary">
            Kipróbálom
          </Link>
        </div>

        <div className="mt-16 w-full sm:mt-20">
          <HeroStage invoice={invoice} />
        </div>
      </LandingContainer>
    </section>
  )
}
