'use client'

import { Dialog } from '@base-ui/react/dialog'
import type { SortedResult } from 'fumadocs-core/search'
import { useDocsSearch } from 'fumadocs-core/search/client'
import { staticClient } from 'fumadocs-core/search/client/orama-static'
import { CornerDownLeft, FileText, Hash, LoaderCircle, Search, TextSearch, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type KeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

const client = staticClient({ from: '/api/search' })

const SUGGESTIONS = [
  { url: '/docs/alapok/telepites', title: 'Telepítés', group: 'Alapok' },
  { url: '/docs/szamla-letrehozas/keres', title: 'Számla létrehozása: kérés', group: 'Számlák' },
  { url: '/docs/nyugta-letrehozas/keres', title: 'Nyugta létrehozása: kérés', group: 'Nyugták' },
  { url: '/docs/alapok/hibakezeles', title: 'Hibakezelés, hibakódok', group: 'Alapok' },
  { url: '/sandbox', title: 'Sandbox: futtasd a kódot a böngészőben', group: 'Eszközök' },
] as const

interface ResultItem {
  id: string
  url: string
  type: SortedResult['type']
  content: string
  breadcrumbs: string[]
}

interface ResultGroup {
  title: string
  items: ResultItem[]
}

function renderHighlighted(content: string): ReactNode[] {
  const clean = content.replace(/`/g, '').replace(/\*\*/g, '')
  const nodes: ReactNode[] = []
  let offset = 0
  for (const part of clean.split(/(<mark>.*?<\/mark>)/g)) {
    const match = /^<mark>(.*)<\/mark>$/.exec(part)
    nodes.push(
      match ? (
        <mark key={`m${offset}`} className="rounded-[0.15em] bg-amber-soft px-0.5 text-ink">
          {match[1]}
        </mark>
      ) : (
        part
      ),
    )
    offset += part.length
  }
  return nodes
}

function groupResults(results: SortedResult[]): ResultGroup[] {
  const groups: ResultGroup[] = []
  for (const result of results) {
    const breadcrumbs = (result.breadcrumbs ?? []).map(String)
    const title = breadcrumbs[0] ?? 'Dokumentáció'
    const item: ResultItem = {
      id: result.id,
      url: result.url,
      type: result.type,
      content: String(result.content),
      breadcrumbs,
    }
    const last = groups.at(-1)
    if (last && last.title === title) last.items.push(item)
    else groups.push({ title, items: [item] })
  }
  return groups
}

export function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const { search, setSearch, query } = useDocsSearch({ client, delayMs: 80 })
  const listRef = useRef<HTMLDivElement>(null)

  const groups = useMemo(
    () => (Array.isArray(query.data) ? groupResults(query.data) : []),
    [query.data],
  )
  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups])
  const showSuggestions = search.trim() === ''
  const itemCount = showSuggestions ? SUGGESTIONS.length : flat.length
  const resultsKey = `${search}|${flat.map((item) => item.id).join(',')}`
  const [cursor, setCursor] = useState({ key: resultsKey, index: 0 })
  const activeIndex = cursor.key === resultsKey ? cursor.index : 0
  const setActiveIndex = (index: number) => setCursor({ key: resultsKey, index })

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function navigate(url: string) {
    onOpenChange(false)
    router.push(url)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (itemCount === 0) return
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((activeIndex + 1) % itemCount)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((activeIndex - 1 + itemCount) % itemCount)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const target = showSuggestions ? SUGGESTIONS[activeIndex] : flat[activeIndex]
      if (target) navigate(target.url)
    }
  }

  let runningIndex = -1

  return (
    <Dialog.Root open={open} onOpenChange={(next) => onOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[var(--z-modal)] bg-overlay backdrop-blur-[2px] transition-opacity duration-200 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          aria-label="Keresés a dokumentációban"
          className="fixed top-[max(1rem,10vh)] left-1/2 z-[var(--z-modal)] flex max-h-[min(40rem,calc(100dvh-2rem))] w-[min(42rem,calc(100vw-1.5rem))] -translate-x-1/2 flex-col overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-paper-raised shadow-[var(--shadow-overlay)] transition-[opacity,transform] duration-200 ease-out outline-none data-[ending-style]:scale-[0.98] data-[ending-style]:opacity-0 data-[starting-style]:scale-[0.98] data-[starting-style]:opacity-0"
        >
          <Dialog.Title className="sr-only">Keresés a dokumentációban</Dialog.Title>
          <div className="flex items-center gap-3 border-b border-rule px-4">
            {query.isLoading ? (
              <LoaderCircle
                className="size-5 shrink-0 animate-spin text-muted"
                aria-hidden="true"
              />
            ) : (
              <Search className="size-5 shrink-0 text-accent" aria-hidden="true" />
            )}
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Keresés a dokumentációban…"
              aria-label="Keresőkifejezés"
              aria-controls="search-results"
              autoComplete="off"
              spellCheck={false}
              className="h-14 min-w-0 flex-1 bg-transparent text-[1.05rem] text-ink outline-none placeholder:text-muted"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="shrink-0 rounded-full px-2 py-1 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                Törlés
              </button>
            ) : null}
            <Dialog.Close
              aria-label="Bezárás"
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <X className="size-4" aria-hidden="true" />
            </Dialog.Close>
          </div>

          <div
            ref={listRef}
            id="search-results"
            className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-2 py-2"
          >
            {showSuggestions ? (
              <section aria-label="Gyakori oldalak">
                <p className="px-3 pt-2 pb-1.5 text-xs font-semibold text-muted">Gyakori oldalak</p>
                <ul>
                  {SUGGESTIONS.map((item, index) => (
                    <li key={item.url}>
                      <button
                        type="button"
                        data-active={index === activeIndex}
                        data-index={index}
                        onMouseMove={() => {
                          if (index !== activeIndex) setActiveIndex(index)
                        }}
                        onClick={() => navigate(item.url)}
                        className="group flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-ink-2 data-[active=true]:bg-accent-soft data-[active=true]:text-ink"
                      >
                        <FileText
                          className="size-4 shrink-0 text-muted group-data-[active=true]:text-accent"
                          aria-hidden="true"
                        />
                        <span className="min-w-0 flex-1 truncate">{item.title}</span>
                        <span className="hidden text-xs text-muted sm:inline">{item.group}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {!showSuggestions &&
            Array.isArray(query.data) &&
            flat.length === 0 &&
            !query.isLoading ? (
              <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                <TextSearch className="size-8 text-muted" aria-hidden="true" />
                <p className="font-medium text-ink">Nincs találat erre: „{search}”</p>
                <p className="max-w-sm text-sm text-muted">
                  Próbálj rövidebb kifejezést, például a metódus nevét (
                  <code className="font-mono">getPdf</code>) vagy egy hibakódot (
                  <code className="font-mono">57</code>).
                </p>
              </div>
            ) : null}

            {!showSuggestions
              ? groups.map((group) => (
                  <section key={`${group.title}-${group.items[0]?.id}`} aria-label={group.title}>
                    <p className="px-3 pt-3 pb-1.5 text-xs font-semibold text-muted">
                      {group.title}
                    </p>
                    <ul>
                      {group.items.map((item) => {
                        runningIndex += 1
                        const index = runningIndex
                        const isPage = item.type === 'page'
                        return (
                          <li key={item.id}>
                            <button
                              type="button"
                              data-active={index === activeIndex}
                              data-index={index}
                              onMouseMove={() => {
                                if (index !== activeIndex) setActiveIndex(index)
                              }}
                              onClick={() => navigate(item.url)}
                              className={cn(
                                'group flex w-full items-start gap-3 rounded-[var(--radius-md)] px-3 py-2.5 text-left text-ink-2 data-[active=true]:bg-accent-soft data-[active=true]:text-ink',
                                !isPage && 'pl-8',
                              )}
                            >
                              {isPage ? (
                                <FileText
                                  className="mt-0.5 size-4 shrink-0 text-muted group-data-[active=true]:text-accent"
                                  aria-hidden="true"
                                />
                              ) : (
                                <Hash
                                  className="mt-0.5 size-4 shrink-0 text-muted group-data-[active=true]:text-accent"
                                  aria-hidden="true"
                                />
                              )}
                              <span className="min-w-0 flex-1">
                                <span
                                  className={cn('line-clamp-2', isPage && 'font-medium text-ink')}
                                >
                                  {renderHighlighted(item.content)}
                                </span>
                                {isPage && item.breadcrumbs.length > 1 ? (
                                  <span className="mt-0.5 block truncate text-xs text-muted">
                                    {item.breadcrumbs.join(' › ')}
                                  </span>
                                ) : null}
                              </span>
                              <CornerDownLeft
                                className="mt-0.5 hidden size-4 shrink-0 text-muted group-data-[active=true]:block"
                                aria-hidden="true"
                              />
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                ))
              : null}
          </div>

          <div className="hidden items-center gap-5 border-t border-rule bg-surface px-4 py-2.5 text-xs text-muted sm:flex">
            <span className="flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              navigáció
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>↵</Kbd>
              megnyitás
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>esc</Kbd>
              bezárás
            </span>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-rule-strong border-b-2 bg-paper-raised px-1 text-[0.7rem] leading-none text-ink-2">
      {children}
    </kbd>
  )
}
