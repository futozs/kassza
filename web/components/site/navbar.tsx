'use client'

import type * as PageTree from 'fumadocs-core/page-tree'
import { ArrowUpRight, Search } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/cn'
import { isNavLinkActive, navLinks, site } from '@/lib/site'
import { useShortcutLabel } from '@/lib/use-shortcut-label'
import { Wordmark } from './logo'
import { MobileMenu } from './mobile-menu'
import { useSearch } from './search-context'
import { ThemeToggle } from './theme-toggle'

export function Navbar({ tree }: { tree?: PageTree.Root }) {
  const pathname = usePathname()
  const { openSearch } = useSearch()
  const shortcut = useShortcutLabel().mod

  return (
    <header className="sticky top-0 z-[var(--z-sticky)] h-[var(--navbar-height)] bg-paper-raised/92 shadow-[0_1px_0_var(--rule)] backdrop-blur-md supports-[not(backdrop-filter:blur(1px))]:bg-paper-raised">
      <a
        href="#tartalom"
        className="absolute top-2 left-2 z-[var(--z-tooltip)] -translate-y-20 rounded-[var(--radius-md)] bg-brand px-3 py-2 text-sm font-medium text-brand-ink focus-visible:translate-y-0"
      >
        Ugrás a tartalomra
      </a>
      <div className="flex h-full items-center gap-1 px-2 sm:px-4">
        <MobileMenu tree={tree} />
        <Link
          href="/"
          aria-label="kassza főoldal"
          className="mr-3 rounded-[var(--radius-md)] px-1 py-1 lg:mr-5"
        >
          <Wordmark />
        </Link>

        <nav aria-label="Fő navigáció" className="hidden items-center gap-0.5 lg:flex">
          {navLinks.map((link) => {
            const active = isNavLinkActive(pathname, link.match)
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-[var(--radius-md)] px-3 py-1.5 text-[0.95rem] font-medium whitespace-nowrap transition-colors duration-150 ease-out',
                  active ? 'text-accent' : 'text-ink hover:text-accent',
                )}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <a
            href={site.changelog}
            target="_blank"
            rel="noreferrer"
            className="tnum mr-1 hidden rounded-full border border-rule px-2.5 py-1 font-mono text-xs text-ink-2 transition-colors hover:border-rule-strong hover:text-ink xl:inline-flex"
            title="Változásnapló"
          >
            v{site.version}
          </a>
          <a
            href={site.repo}
            target="_blank"
            rel="noreferrer"
            className="hidden items-center gap-1 rounded-[var(--radius-md)] px-3 py-1.5 text-[0.95rem] font-medium whitespace-nowrap text-ink transition-colors hover:text-accent lg:inline-flex"
          >
            GitHub
            <ArrowUpRight className="size-3.5 text-muted" aria-hidden="true" />
          </a>
          <ThemeToggle className="hidden lg:inline-flex" />
          <button
            type="button"
            onClick={openSearch}
            aria-label="Keresés a dokumentációban"
            aria-keyshortcuts="Meta+K Control+K"
            className="group ml-1 hidden h-9 w-52 items-center gap-2 rounded-full border border-rule bg-surface px-3 text-left text-sm text-muted transition-[border-color,background-color] duration-200 ease-out hover:border-rule-strong hover:bg-paper-raised sm:inline-flex"
          >
            <Search className="size-4 shrink-0 text-ink-2" aria-hidden="true" />
            <span className="flex-1">Keresés</span>
            <span className="flex items-center gap-1">
              <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-rule-strong border-b-2 bg-paper-raised px-1 text-[0.68rem] leading-none text-ink-2">
                {shortcut}
              </kbd>
              <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-rule-strong border-b-2 bg-paper-raised px-1 text-[0.68rem] leading-none text-ink-2">
                K
              </kbd>
            </span>
          </button>
          <button
            type="button"
            onClick={openSearch}
            aria-label="Keresés a dokumentációban"
            className="inline-flex size-10 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink sm:hidden"
          >
            <Search className="size-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  )
}
