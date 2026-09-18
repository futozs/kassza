import Link from 'next/link'
import { LandingContainer, SectionHeading } from './section-heading'

const RUNTIMES = [
  { name: 'Node.js', note: '22 vagy újabb' },
  { name: 'Bun', note: undefined },
  { name: 'Deno', note: undefined },
  { name: 'Cloudflare Workers', note: 'session: KV' },
  { name: 'Vercel Edge Runtime', note: 'session: Upstash Redis' },
] as const

const WEB_APIS = ['fetch', 'FormData', 'Blob', 'TextEncoder', 'crypto'] as const

const MODULES = [
  {
    path: 'kassza/testing',
    href: '/docs/kiegeszitok/teszteles',
    description: 'Mock kliens unit tesztekhez, valódi validációval és kerekítéssel.',
  },
  {
    path: 'kassza/ipn',
    href: '/docs/befizetes-rogzitese/ipn',
    description: 'A Számlázz.hu fizetési értesítésének (IPN) feldolgozása.',
  },
  {
    path: 'kassza/storage',
    href: '/docs/kiegeszitok/pdf-tarhely',
    description: 'PDF mentése S3-ra, R2-re, Vercel Blobra, UploadThingre vagy Supabase-re.',
  },
  {
    path: 'kassza/cookie-stores',
    href: '/docs/alapok/munkamenet',
    description: 'Közös session tároló Redishez és Cloudflare KV-hez.',
  },
  {
    path: 'kassza/validators',
    href: '/docs/kiegeszitok/validatorok',
    description: 'Adószám, bankszámla, IBAN, EU adószám és magyar cím ellenőrzése.',
  },
  {
    path: 'kassza/money',
    href: '/docs/kiegeszitok/penzszamitas',
    description: 'Ugyanaz a kerekítés és összegzés, külön is használható.',
  },
] as const

function Runtimes() {
  return (
    <div className="min-w-0">
      <h3 className="font-display text-xl font-bold tracking-[-0.015em] text-ink">Hol fut?</h3>
      <ul className="mt-5 border-t border-rule">
        {RUNTIMES.map((runtime) => (
          <li
            key={runtime.name}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule py-3.5"
          >
            <span className="font-display text-[1.3rem] font-semibold tracking-[-0.015em] text-ink">
              {runtime.name}
            </span>
            {runtime.note ? (
              <span className="font-mono text-xs whitespace-nowrap text-muted">{runtime.note}</span>
            ) : null}
          </li>
        ))}
      </ul>
      <p className="mt-5 max-w-[50ch] text-[0.95rem] leading-relaxed text-ink-2">
        Nincs futásidejű függősége, csak szabványos webes API-kat használ:{' '}
        {WEB_APIS.map((api, index) => (
          <span key={api}>
            <code className="font-mono text-[0.88em] text-ink">{api}</code>
            {index < WEB_APIS.length - 2 ? ', ' : index === WEB_APIS.length - 2 ? ' és ' : '.'}
          </span>
        ))}
      </p>
    </div>
  )
}

function ModuleTree() {
  return (
    <div className="min-w-0">
      <h3 className="font-display text-xl font-bold tracking-[-0.015em] text-ink">
        Kiegészítő modulok
      </h3>
      <p className="mt-2 max-w-[52ch] text-[0.95rem] leading-relaxed text-ink-2">
        Külön importálhatók, és csak akkor kerülnek a bundle-be, ha használod őket.
      </p>
      <div className="mt-6 rounded-[var(--radius-lg)] border border-rule bg-paper-raised px-4 py-5 sm:px-6">
        <p className="font-mono text-sm font-semibold text-ink">kassza</p>
        <ul className="mt-1">
          {MODULES.map((module) => (
            <li
              key={module.path}
              className="relative pt-3 pl-7 before:absolute before:top-0 before:bottom-0 before:left-1.5 before:border-l before:border-rule-strong after:absolute after:top-[1.45rem] after:left-1.5 after:w-4 after:border-t after:border-rule-strong last:before:bottom-auto last:before:h-[1.45rem]"
            >
              <Link
                href={module.href}
                className="font-mono text-sm font-medium whitespace-nowrap text-accent underline decoration-current/30 underline-offset-4 transition-[text-decoration-color] duration-200 ease-out hover:decoration-current"
              >
                <span className="sr-only">kassza</span>
                {module.path.replace('kassza', '')}
              </Link>
              <p className="mt-0.5 text-sm leading-relaxed text-muted">{module.description}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export function PlatformsSection() {
  return (
    <section aria-labelledby="futtatas" className="border-t border-rule">
      <LandingContainer className="py-20 lg:py-28">
        <SectionHeading
          id="futtatas"
          title={`Egy csomag, nulla függőség, ${RUNTIMES.length} futtatókörnyezet.`}
        >
          Ugyanaz a kód fut a szervereden, a serverless függvényedben és az edge-en. Amire nincs
          mindig szükség, az külön modulban van.
        </SectionHeading>
        <div className="mt-12 grid gap-14 lg:mt-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-20">
          <Runtimes />
          <ModuleTree />
        </div>
      </LandingContainer>
    </section>
  )
}
