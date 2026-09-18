import type { ReactNode } from 'react'
import { RoundingCalculator } from '@/components/mdx/rounding-calculator'
import { cn } from '@/lib/cn'
import { ErrorFigure } from './error-figure'
import { RetryTimeline } from './retry-timeline'
import { RoundingFigure } from './rounding-figure'
import type { RoundingSample, SampleError } from './sample-invoice'
import { LandingContainer, SectionHeading } from './section-heading'
import { SessionFigure } from './session-figure'

const forint = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 })

function Pitfall({
  id,
  title,
  children,
  className,
}: {
  id: string
  title: string
  children: ReactNode
  className?: string
}) {
  return (
    <article aria-labelledby={id} className={cn('min-w-0', className)}>
      <h3
        id={id}
        className="max-w-[26ch] font-display text-[1.6rem] leading-[1.12] font-bold tracking-[-0.022em] text-balance text-ink sm:text-[1.85rem]"
      >
        {title}
      </h3>
      {children}
    </article>
  )
}

function Body({ children }: { children: ReactNode }) {
  return <p className="mt-4 max-w-[58ch] leading-relaxed text-ink-2">{children}</p>
}

function Mono({ children }: { children: ReactNode }) {
  return <code className="font-mono text-[0.88em] text-ink">{children}</code>
}

function ErrorFields({ error }: { error: SampleError }) {
  const fields: readonly (readonly [string, string, string])[] = [
    ['error.code', String(error.code), 'text-[var(--code-token-constant)]'],
    ['error.category', `'${error.category}'`, 'text-[var(--code-token-string)]'],
    ['error.message', `'${error.message}'`, 'text-[var(--code-token-string)]'],
    ...(error.hint
      ? [['error.hint', `'${error.hint}'`, 'text-[var(--code-token-string)]'] as const]
      : []),
  ]
  return (
    <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 rounded-[var(--radius-md)] border border-rule bg-[var(--code-background)] px-4 py-3 font-mono text-[0.8rem] leading-relaxed sm:grid-cols-[auto_minmax(0,1fr)]">
      {fields.map(([name, value, tone]) => (
        <div key={name} className="contents">
          <dt className="text-[var(--code-token-parameter)]">{name}</dt>
          <dd className={cn('mb-2 min-w-0 [overflow-wrap:anywhere] sm:mb-0', tone)}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function PitfallsSection({ sample, error }: { sample: RoundingSample; error: SampleError }) {
  return (
    <section aria-labelledby="buktatok" className="border-t border-rule">
      <LandingContainer className="py-20 lg:py-28">
        <SectionHeading id="buktatok" title="Négy buktató, amit a kassza helyetted kezel.">
          Mindegyikbe belefut, aki a nyers Agent API-t hívja. A lenti összegeket és hibakódokat nem
          kézzel írtuk be: a kassza számolta ki és olvasta ki őket, amikor ez az oldal elkészült.
        </SectionHeading>

        <div className="mt-14 grid gap-12 lg:mt-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-16">
          <Pitfall id="buktato-kerekites" title="Egy forint eltérés, és a számla nem készül el.">
            <Body>
              Forintos számlán a tétel nettó értéke, áfája és bruttó értéke is egész szám, és a
              Számlázz.hu ellenőrzi, hogy összeillenek-e. Ha a visszaszámolt nettóból számolod az
              áfát, {sample.quantity} darab {forint.format(sample.unitPrice)} Ft-os pólónál{' '}
              {forint.format(sample.naiveGross)} Ft jön ki {forint.format(sample.gross)} helyett, és
              a válasz a 259–264-es hibakódok egyike. A kassza a hivatalos nettó vagy bruttó alapú
              szabállyal számol, tételenként.
            </Body>
            <figure className="mt-8 max-w-[24rem]">
              <RoundingFigure sample={sample} />
            </figure>
          </Pitfall>

          <div className="min-w-0 self-start rounded-[var(--radius-lg)] border border-rule bg-paper-raised p-5 shadow-[var(--shadow-whisper)] sm:p-7">
            <h4 className="font-display text-lg font-bold text-ink">Számold ki te is</h4>
            <p className="mt-1.5 mb-6 max-w-[52ch] text-sm leading-relaxed text-muted">
              Ez ugyanaz a <Mono>kassza/money</Mono> kód, amely a számla tételeit kerekíti. Írd át
              az árat, a mennyiséget vagy az áfakulcsot.
            </p>
            <RoundingCalculator />
          </div>
        </div>

        <div className="mt-20 grid gap-12 border-t border-rule pt-16 lg:mt-24 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)] lg:gap-16 lg:pt-20">
          <Pitfall id="buktato-dupla" title="Időtúllépés után sem lesz két számla.">
            <Body>
              Hálózati hiba vagy időtúllépés után nem tudod, elkészült-e a számla. Ha újraküldöd,
              kettő lehet belőle, ciklusban próbálkozva pedig a Számlázz.hu ki is tilthat.
            </Body>
            <Body>
              A kassza ezért csak a lekérdezéseket próbálja újra magától: alapból háromszor, 1 és 2
              másodperc várakozással. Számlát soha nem küld újra. Te a rendelésszámmal megnézed,
              megvan-e, és csak akkor állítod ki, ha nincs.
            </Body>
          </Pitfall>
          <figure className="w-full max-w-[26rem] lg:justify-self-end">
            <RetryTimeline />
          </figure>
        </div>

        <div className="mt-20 grid gap-16 border-t border-rule pt-16 md:grid-cols-2 md:gap-12 lg:mt-24 lg:gap-20 lg:pt-20">
          <Pitfall id="buktato-hibak" title="Háromféle hibaformátum helyett egy.">
            <Body>
              A Számla Agent a hibát hol HTTP fejlécben, hol XML-ben, hol <Mono>[ERR]</Mono> kezdetű
              szövegben adja vissza. A kasszában mindből <Mono>SzamlazzError</Mono> lesz, a
              Számlázz.hu hibakódjával, kategóriával és magyar javítási tippel.
            </Body>
            <figure className="mt-8 max-w-[26rem]">
              <ErrorFigure />
              <figcaption className="mt-6 text-sm text-muted">
                Az {error.code}-es hiba, ahogy a kódod megkapja:
                <ErrorFields error={error} />
              </figcaption>
            </figure>
          </Pitfall>

          <Pitfall id="buktato-session" title="Session cookie, serverlessen is.">
            <Body>
              A Számla Agent session cookie-val gyorsít: ha nem küldöd vissza, minden kérés újra
              végigmegy a hitelesítésen. A kassza eltárolja és visszaküldi, serverless környezetben
              pedig Redisben vagy Cloudflare KV-ben osztja meg a példányok között. A Számlázz.hu 90
              perc tétlenség után törli, a következő kérés ilyenkor újat nyit.
            </Body>
            <figure className="mt-8 max-w-[26rem]">
              <SessionFigure />
            </figure>
          </Pitfall>
        </div>
      </LandingContainer>
    </section>
  )
}
