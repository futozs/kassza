import { site } from '@/lib/site'
import { ButtonLink } from './button-link'
import { LandingContainer } from './section-heading'

export function ClosingSection() {
  return (
    <section aria-labelledby="kezdd-el" className="border-t border-rule">
      <LandingContainer className="grid gap-12 pt-20 pb-24 lg:grid-cols-[minmax(0,7fr)_minmax(0,4fr)] lg:items-end lg:gap-20 lg:pt-28 lg:pb-32">
        <div className="flex min-w-0 flex-col items-start">
          <h2
            id="kezdd-el"
            className="max-w-[18ch] font-display text-[length:var(--text-display-s)] leading-[1.04] font-extrabold tracking-[-0.032em] text-balance text-ink [overflow-wrap:anywhere]"
          >
            Próbáld ki kulcs nélkül, a böngészőben.
          </h2>
          <p className="mt-6 max-w-[54ch] text-[length:var(--text-lede)] leading-relaxed text-ink-2">
            A sandbox a Számlázz.hu Számla Agent szimulátorán futtatja a példákat, és megmutatja a
            pontosan elküldött XML-t. A dokumentációban a teljes API, a receptek és a gyakori
            integrációk is megvannak. Ha meggyőzött, egy{' '}
            <code className="font-mono text-[0.9em] whitespace-nowrap text-ink">npm i kassza</code>, és jöhet az éles
            Agent kulcs.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href="/sandbox">Sandbox megnyitása</ButtonLink>
            <ButtonLink href="/docs/alapok/telepites" variant="secondary">
              Telepítés
            </ButtonLink>
            <ButtonLink href="/docs/receptek" variant="secondary">
              Receptek
            </ButtonLink>
            <ButtonLink href={site.repo} variant="quiet" external>
              GitHub
            </ButtonLink>
          </div>
        </div>

        <aside
          aria-label="Jogi megjegyzés"
          className="min-w-0 border-t border-rule-strong pt-5 text-sm leading-relaxed text-muted lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6"
        >
          <p className="font-semibold text-ink-2">Nem hivatalos projekt.</p>
          <p className="mt-2">
            A kasszát független fejlesztő készíti, nyílt forráskóddal, MIT licenccel. A Számlázz.hu
            (KBOSS.hu Kft.) nem támogatja és nem felel érte. Az előfizetés, a cégadatok és a
            számlázási beállítások a Számlázz.hu fiókodban maradnak, a Számla Agent hivatalos
            leírása a{' '}
            <a
              href={site.officialDocs}
              target="_blank"
              rel="noreferrer"
              className="whitespace-nowrap text-ink-2 underline decoration-rule-strong underline-offset-2 hover:text-accent"
            >
              docs.szamlazz.hu
            </a>{' '}
            oldalon van.
          </p>
        </aside>
      </LandingContainer>
    </section>
  )
}
