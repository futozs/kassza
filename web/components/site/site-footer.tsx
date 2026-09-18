import { ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import { site } from '@/lib/site'
import { LogoMark } from './logo'

const columns = [
  {
    title: 'Dokumentáció',
    links: [
      { href: '/docs', label: 'Bevezetés' },
      { href: '/docs/alapok/telepites', label: 'Telepítés' },
      { href: '/docs/szamla-letrehozas/keres', label: 'Számla létrehozás' },
      { href: '/docs/nyugta-letrehozas/keres', label: 'Nyugta létrehozás' },
      { href: '/docs/alapok/hibakezeles', label: 'Hibakódok' },
    ],
  },
  {
    title: 'Eszközök',
    links: [
      { href: '/sandbox', label: 'Sandbox' },
      { href: '/docs/receptek', label: 'Receptek' },
      { href: '/docs/kiegeszitok/teszteles', label: 'Mock kliens' },
      { href: '/llms.txt', label: 'llms.txt' },
    ],
  },
  {
    title: 'Projekt',
    links: [
      { href: site.repo, label: 'GitHub', external: true },
      { href: site.npm, label: 'npm', external: true },
      { href: site.changelog, label: 'Változásnapló', external: true },
      { href: site.issues, label: 'Hibabejelentés', external: true },
    ],
  },
] as const

export function SiteFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="border-t border-rule bg-surface">
      <div className="mx-auto grid max-w-[var(--docs-max)] gap-10 px-5 pt-12 pb-8 sm:px-8 md:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))]">
        <div className="max-w-xs">
          <Link href="/" className="inline-flex items-center gap-2.5" aria-label="kassza főoldal">
            <LogoMark className="size-7" />
            <span className="font-display text-lg font-extrabold tracking-[-0.03em] text-ink">
              kassza
            </span>
          </Link>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Nyílt forráskódú TypeScript kliens a Számlázz.hu Számla Agenthez. MIT licenc.
          </p>
        </div>
        {columns.map((column) => (
          <div key={column.title}>
            <p className="text-sm font-semibold text-ink">{column.title}</p>
            <ul className="mt-3 flex flex-col gap-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  {'external' in link ? (
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm whitespace-nowrap text-ink-2 transition-colors hover:text-accent"
                    >
                      {link.label}
                      <ArrowUpRight className="size-3.5 text-muted" aria-hidden="true" />
                    </a>
                  ) : (
                    <Link
                      href={link.href}
                      className="text-sm whitespace-nowrap text-ink-2 transition-colors hover:text-accent"
                    >
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mx-auto max-w-[var(--docs-max)] px-5 pb-10 sm:px-8">
        <p className="border-t border-rule pt-6 text-xs leading-relaxed text-muted">
          A kassza nem hivatalos projekt, és nem kapcsolódik a KBOSS.hu Kft.-hez (Számlázz.hu). A
          Számla Agent hivatalos dokumentációja a{' '}
          <a
            href={site.officialDocs}
            target="_blank"
            rel="noreferrer"
            className="text-ink-2 underline decoration-rule-strong underline-offset-2 hover:text-accent"
          >
            docs.szamlazz.hu
          </a>{' '}
          oldalon érhető el. © {year} futozs
        </p>
      </div>
    </footer>
  )
}
