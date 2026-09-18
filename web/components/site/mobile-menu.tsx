'use client'

import { Dialog } from '@base-ui/react/dialog'
import type * as PageTree from 'fumadocs-core/page-tree'
import { ArrowLeft, ArrowUpRight, ChevronRight, Menu, X } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { SidebarTree } from '@/components/docs/sidebar-tree'
import { cn } from '@/lib/cn'
import { isNavLinkActive, navLinks, site } from '@/lib/site'
import { Wordmark } from './logo'
import { ThemeToggle } from './theme-toggle'

export function MobileMenu({ tree }: { tree?: PageTree.Root | undefined }) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<'docs' | 'main'>(tree ? 'docs' : 'main')

  useEffect(() => {
    if (open) setPanel(tree ? 'docs' : 'main')
  }, [open, tree])

  const close = () => setOpen(false)

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger
        aria-label="Menü megnyitása"
        className="inline-flex size-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-surface-2 lg:hidden"
      >
        <Menu className="size-5" aria-hidden="true" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[var(--z-modal)] bg-overlay transition-opacity duration-200 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0 lg:hidden" />
        <Dialog.Popup className="fixed inset-y-0 left-0 z-[var(--z-modal)] flex w-[min(21rem,86vw)] flex-col bg-paper-raised shadow-[var(--shadow-overlay)] transition-transform duration-300 ease-out outline-none data-[ending-style]:-translate-x-full data-[starting-style]:-translate-x-full lg:hidden">
          <Dialog.Title className="sr-only">Navigáció</Dialog.Title>
          <div className="flex h-[var(--navbar-height)] shrink-0 items-center justify-between border-b border-rule px-3">
            <Link href="/" onClick={close} aria-label="kassza főoldal" className="px-1">
              <Wordmark />
            </Link>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <Dialog.Close
                aria-label="Menü bezárása"
                className="inline-flex size-9 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X className="size-5" aria-hidden="true" />
              </Dialog.Close>
            </div>
          </div>

          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2">
            {panel === 'docs' && tree ? (
              <>
                <button
                  type="button"
                  onClick={() => setPanel('main')}
                  className="mb-2 flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-2 text-left text-[0.95rem] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Vissza a főmenühöz
                </button>
                <SidebarTree tree={tree} onNavigate={close} />
              </>
            ) : (
              <nav aria-label="Fő navigáció">
                <ul className="flex flex-col gap-0.5">
                  {navLinks.map((link) => {
                    const active = isNavLinkActive(pathname, link.match)
                    return (
                      <li key={link.href}>
                        <Link
                          href={link.href}
                          onClick={close}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex min-h-11 items-center rounded-[var(--radius-sm)] px-3 text-[1rem] font-medium',
                            active ? 'bg-accent-soft text-accent' : 'text-ink hover:bg-surface-2',
                          )}
                        >
                          {link.label}
                        </Link>
                      </li>
                    )
                  })}
                  {tree ? (
                    <li>
                      <button
                        type="button"
                        onClick={() => setPanel('docs')}
                        className="flex min-h-11 w-full items-center justify-between rounded-[var(--radius-sm)] px-3 text-left text-[1rem] font-medium text-ink hover:bg-surface-2"
                      >
                        A dokumentáció tartalma
                        <ChevronRight className="size-4 text-muted" aria-hidden="true" />
                      </button>
                    </li>
                  ) : null}
                </ul>
                <div className="my-3 h-px bg-rule" />
                <ul className="flex flex-col gap-0.5">
                  {[
                    { href: site.repo, label: 'GitHub' },
                    { href: site.npm, label: 'npm' },
                    { href: site.changelog, label: `Változásnapló (v${site.version})` },
                  ].map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-h-11 items-center justify-between rounded-[var(--radius-sm)] px-3 text-[1rem] text-ink-2 hover:bg-surface-2 hover:text-ink"
                      >
                        {link.label}
                        <ArrowUpRight className="size-4 text-muted" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
