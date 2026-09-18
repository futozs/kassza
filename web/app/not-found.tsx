import { ArrowRight, BookOpen, FlaskConical } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Navbar } from '@/components/site/navbar'
import { SiteFooter } from '@/components/site/site-footer'

export const metadata: Metadata = {
  title: 'Az oldal nem található',
  robots: { index: false, follow: true },
}

const receiptLines = [
  { label: 'Kért oldal', value: 'nincs meg' },
  { label: 'Státusz', value: '404' },
  { label: 'Kiállítva', value: 'sosem' },
] as const

const ZIGZAG_PATH =
  'M0 0H320V6L306.667 16L293.333 6L280 16L266.667 6L253.333 16L240 6L226.667 16L213.333 6L200 16L186.667 6L173.333 16L160 6L146.667 16L133.333 6L120 16L106.667 6L93.333 16L80 6L66.667 16L53.333 6L40 16L26.667 6L13.333 16L0 6Z'

function MissingReceipt() {
  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[20rem] rotate-[1.5deg]">
      <div className="rounded-t-[var(--radius-lg)] border border-b-0 border-receipt-edge bg-receipt px-7 pt-7 pb-4 text-brand-deep shadow-lift">
        <div className="flex items-center justify-between font-mono text-[0.7rem] tracking-[0.14em] uppercase opacity-65">
          <span>kassza</span>
          <span>Nyugta</span>
        </div>
        <p className="mt-6 font-display text-[5.5rem] leading-none font-extrabold tracking-[-0.05em] [font-variation-settings:'opsz'_96]">
          404
        </p>
        <dl className="mt-6 flex flex-col gap-2.5 border-t border-dashed border-brand-deep/25 pt-5 font-mono text-[0.8rem]">
          {receiptLines.map((line) => (
            <div key={line.label} className="flex items-baseline gap-2">
              <dt className="flex flex-1 items-baseline gap-2 opacity-65 after:min-w-4 after:flex-1 after:border-b after:border-dotted after:border-current">
                {line.label}
              </dt>
              <dd>{line.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex items-baseline justify-between border-t border-dashed border-brand-deep/25 pt-4 font-mono text-sm font-semibold">
          <span>Végösszeg</span>
          <span>0 Ft</span>
        </div>
        <div className="mt-5 flex items-center gap-3">
          <span className="h-2 flex-1 rounded-full bg-brand-deep/20" />
          <span className="h-2 w-10 rounded-full bg-amber" />
        </div>
      </div>
      <svg
        viewBox="0 0 320 16"
        preserveAspectRatio="none"
        aria-hidden="true"
        className="block h-4 w-full fill-receipt"
      >
        <path d={ZIGZAG_PATH} />
      </svg>
    </div>
  )
}

export default function NotFound() {
  return (
    <>
      <Navbar />
      <main
        id="tartalom"
        className="mx-auto grid w-full max-w-[var(--docs-max)] items-center gap-14 px-5 py-16 sm:px-8 md:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] md:py-28"
      >
        <div className="max-w-[38rem]">
          <p className="font-mono text-[0.8rem] font-medium tracking-[0.12em] text-accent uppercase">
            404 · Nem található
          </p>
          <h1 className="mt-4 font-display text-[length:var(--text-display-s)] leading-[1.04] font-bold tracking-[-0.03em] text-balance text-ink">
            Ezt az oldalt nem találjuk a kasszában.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-ink-2">
            Lehet, hogy elavult a link, vagy elgépelődött a cím. A dokumentációban a keresővel
            gyorsan megtalálod, amit keresel, a sandboxban pedig rögtön futtathatod a példákat.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/docs"
              className="group inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-brand px-4.5 py-2.5 text-[0.95rem] font-medium text-brand-ink shadow-whisper transition-[background-color,transform] duration-[var(--dur-short)] ease-[var(--ease-out)] hover:bg-brand-deep active:translate-y-px dark:hover:bg-accent-hover"
            >
              <BookOpen className="size-4" aria-hidden="true" />
              Dokumentáció
              <ArrowRight
                className="size-4 transition-transform duration-[var(--dur-short)] ease-[var(--ease-out)] group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
            <Link
              href="/sandbox"
              className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-rule-strong bg-paper-raised px-4.5 py-2.5 text-[0.95rem] font-medium text-ink transition-[border-color,background-color,transform] duration-[var(--dur-short)] ease-[var(--ease-out)] hover:border-accent hover:bg-accent-soft active:translate-y-px"
            >
              <FlaskConical className="size-4 text-accent" aria-hidden="true" />
              Sandbox
            </Link>
            <Link
              href="/"
              className="px-2 py-2.5 text-[0.95rem] font-medium text-ink-2 underline decoration-rule-strong underline-offset-4 transition-colors hover:text-accent hover:decoration-accent"
            >
              Vissza a főoldalra
            </Link>
          </div>
        </div>
        <MissingReceipt />
      </main>
      <SiteFooter />
    </>
  )
}
