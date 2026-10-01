import { ButtonLink } from './button-link'
import { CodeSwitch, type CodeTab } from './code-switch'
import { InstallCommand } from './install-command'
import { Accent, Eyebrow, LandingContainer } from './section-heading'
import { installSnippet } from './snippets'

export interface HeroFacts {
  readonly operations: number
  readonly examples: number
  readonly recipes: number
  readonly version: string
}

const TAGS = ['típusos', 'nulla függőség', 'nyílt forráskód'] as const

export function Hero({
  tabs,
  xmlLines,
  facts,
}: {
  tabs: readonly CodeTab[]
  xmlLines: number
  facts: HeroFacts
}) {
  const factList: readonly string[] = [
    `${facts.operations}/${facts.operations} Agent művelet`,
    `${facts.examples} futtatható példa`,
    `${facts.recipes} kész recept`,
    `v${facts.version} · MIT`,
  ]
  return (
    <section aria-labelledby="hero-title" className="border-b border-rule">
      <LandingContainer className="grid items-center gap-14 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-16 lg:py-24">
        <div className="flex min-w-0 flex-col items-start">
          <div className="flex flex-wrap gap-2">
            {TAGS.map((tag) => (
              <Eyebrow key={tag}>{tag}</Eyebrow>
            ))}
          </div>
          <h1
            id="hero-title"
            className="mt-6 font-display text-[length:var(--text-display-s)] leading-[1.04] font-semibold tracking-[-0.03em] text-balance text-ink [overflow-wrap:anywhere]"
          >
            Számlázz és nyugtázz <Accent>TypeScriptből.</Accent>
          </h1>
          <p className="mt-6 max-w-[33rem] text-[length:var(--text-lede)] leading-relaxed text-pretty text-ink-2">
            A kassza a Számlázz.hu Számla Agent kliense. Te megadod a vevőt és a tételeket, ő
            elkészíti a hibátlan XML-t, kiszámolja az összegeket, és nem enged dupla számlát
            kiállítani.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href="/docs/alapok/telepites">Első lépések</ButtonLink>
            <ButtonLink href="/sandbox" variant="secondary">
              Kipróbálom a sandboxban
            </ButtonLink>
          </div>
          <InstallCommand command={installSnippet} className="mt-6" />
          <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted">
            {factList.map((fact) => (
              <li key={fact} className="tnum">
                {fact}
              </li>
            ))}
          </ul>
        </div>

        <CodeSwitch
          tabs={tabs}
          caption={
            <>
              Ugyanaz a számla két nyelven. A {xmlLines} soros XML-t a kassza építi fel helyetted,
              kötött sorrendben, hivatalos kerekítéssel.
            </>
          }
        />
      </LandingContainer>
    </section>
  )
}
