import { site } from '@/lib/site'
import { ButtonLink } from './button-link'
import { LandingContainer } from './section-heading'

export function ClosingSection() {
  return (
    <section aria-labelledby="kezdd-el" className="pb-20 lg:pb-28">
      <LandingContainer>
        <div className="flex flex-col items-start gap-8 rounded-[1.25rem] border border-tint-edge/60 bg-tint px-6 py-10 sm:px-12 sm:py-14 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-[36rem]">
            <h2
              id="kezdd-el"
              className="font-display text-[length:var(--text-section)] leading-[1.1] font-semibold tracking-[-0.025em] text-balance text-ink"
            >
              Próbáld ki most, Agent kulcs nélkül.
            </h2>
            <p className="mt-4 text-[length:var(--text-lede)] leading-relaxed text-pretty text-ink-2">
              A sandbox a böngészőben futtatja a példákat, és megmutatja, pontosan milyen XML megy a
              Számlázz.hu felé.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/sandbox">Sandbox megnyitása</ButtonLink>
            <ButtonLink href={site.repo} variant="secondary" external>
              GitHub
            </ButtonLink>
          </div>
        </div>
      </LandingContainer>
    </section>
  )
}
