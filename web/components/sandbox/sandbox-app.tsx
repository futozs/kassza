'use client'

import {
  BookOpen,
  Check,
  Link2,
  LoaderCircle,
  Play,
  RotateCcw,
  Square,
  TriangleAlert,
} from 'lucide-react'
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { useShortcutLabel } from '@/lib/use-shortcut-label'
import type { ExampleGroup } from '@/sandbox/examples/catalog'
import { formatPreview } from '@/sandbox/runtime/serialize'
import type { EditorMarker } from './code-editor'
import { AccountPanel, ConsolePanel, NetworkPanel } from './output-panels'
import { useSandboxRunner } from './use-sandbox-runner'

export interface SandboxExample {
  readonly slug: string
  readonly title: string
  readonly group: ExampleGroup
  readonly description: string
  readonly docs?: string | undefined
  readonly code: string
}

export interface SandboxManifest {
  readonly runner: string
  readonly types: string
  readonly monaco: string
}

const CUSTOM = 'sajat'
const DRAFT_PREFIX = 'kassza.sandbox.v1.'

function PlainCode({ code }: { code: string }) {
  return (
    <pre
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden bg-[var(--code-background)] py-4 pr-6 pl-[4.25rem] font-mono text-[13.5px] leading-[22px] whitespace-pre-wrap text-[var(--code-foreground)]"
    >
      {code}
    </pre>
  )
}

const CodeEditor = dynamic(() => import('./code-editor').then((mod) => mod.CodeEditor), {
  ssr: false,
})

function readDraft(slug: string): string | null {
  try {
    return window.localStorage.getItem(DRAFT_PREFIX + slug)
  } catch {
    return null
  }
}

function writeDraft(slug: string, code: string | null): void {
  try {
    if (code === null) window.localStorage.removeItem(DRAFT_PREFIX + slug)
    else window.localStorage.setItem(DRAFT_PREFIX + slug, code)
  } catch {
    return
  }
}

type OutputTab = 'konzol' | 'halozat' | 'fiok'

export function SandboxApp({
  examples,
  manifest,
  kasszaVersion,
}: {
  examples: readonly SandboxExample[]
  manifest: SandboxManifest
  kasszaVersion: string
}) {
  const defaultExample = examples[0]
  const [slug, setSlug] = useState(defaultExample?.slug ?? CUSTOM)
  const [code, setCode] = useState(defaultExample?.code ?? '')
  const [shared, setShared] = useState(false)
  const [tab, setTab] = useState<OutputTab>('konzol')
  const [mobileView, setMobileView] = useState<'kod' | 'kimenet'>('kod')
  const [copied, setCopied] = useState(false)
  const [editorReady, setEditorReady] = useState(false)
  const shortcut = useShortcutLabel()
  const { state, run, cancel } = useSandboxRunner(manifest.runner)
  const draftTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const initialized = useRef(false)

  const example = useMemo(() => examples.find((item) => item.slug === slug), [examples, slug])
  const groups = useMemo(() => {
    const map = new Map<ExampleGroup, SandboxExample[]>()
    for (const item of examples) map.set(item.group, [...(map.get(item.group) ?? []), item])
    return [...map.entries()]
  }, [examples])

  const execute = useCallback(
    (source: string) => {
      setTab('konzol')
      setMobileView('kimenet')
      run(source)
    },
    [run],
  )

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    const hash = window.location.hash
    if (hash.startsWith('#kod=')) {
      const decoded = decompressFromEncodedURIComponent(hash.slice(5))
      if (decoded) {
        setSlug(CUSTOM)
        setCode(decoded)
        setShared(true)
        return
      }
    }
    const requested = new URLSearchParams(window.location.search).get('pelda')
    const target = examples.find((item) => item.slug === requested) ?? defaultExample
    if (!target) return
    const source = readDraft(target.slug) ?? target.code
    setSlug(target.slug)
    setCode(source)
    execute(source)
  }, [examples, defaultExample, execute])

  const selectExample = (next: SandboxExample) => {
    const source = readDraft(next.slug) ?? next.code
    setSlug(next.slug)
    setCode(source)
    setShared(false)
    const url = new URL(window.location.href)
    url.searchParams.set('pelda', next.slug)
    url.hash = ''
    window.history.replaceState(null, '', url)
    execute(source)
  }

  const onCodeChange = (next: string) => {
    setCode(next)
    clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(() => {
      if (example && next === example.code) writeDraft(slug, null)
      else writeDraft(slug, next)
    }, 400)
  }

  const reset = () => {
    if (!example) return
    writeDraft(slug, null)
    setCode(example.code)
  }

  const share = async () => {
    const url = new URL(window.location.href)
    url.search = ''
    url.hash = `kod=${compressToEncodedURIComponent(code)}`
    try {
      await navigator.clipboard.writeText(url.toString())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.history.replaceState(null, '', url)
    }
  }

  const modified = example ? code !== example.code : false
  const running = state.status === 'running'
  const marker: EditorMarker | undefined =
    state.result?.error?.line !== undefined
      ? {
          line: state.result.error.line,
          column: state.result.error.column,
          message: formatPreview(state.result.error.preview).split('\n')[0] ?? 'Hiba',
        }
      : undefined

  const statusText =
    state.status === 'running'
      ? 'Fut…'
      : state.status === 'done'
        ? `Lefutott ${Math.round(state.result?.durationMs ?? 0)} ms alatt · ${state.calls.length} Agent hívás`
        : state.status === 'failed'
          ? 'Hibával állt le'
          : state.status === 'timeout'
            ? 'Időtúllépés miatt leállítva'
            : 'Kész a futtatásra'

  return (
    <div className="grid h-[calc(100dvh-var(--navbar-height))] grid-rows-[auto_minmax(0,1fr)_auto] bg-paper lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="hidden border-r border-rule bg-paper-raised lg:row-span-3 lg:flex lg:flex-col">
        <div className="border-b border-rule px-4 py-3">
          <p className="font-display text-lg font-bold tracking-[-0.02em] text-ink">Sandbox</p>
          <p className="text-xs leading-relaxed text-muted">
            Futtatható példák egy szimulált Számlázz.hu ellen.
          </p>
        </div>
        <nav aria-label="Példák" className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2">
          {groups.map(([group, items]) => (
            <div key={group} className="mb-3">
              <p className="px-2 pt-2 pb-1 text-[0.7rem] font-semibold tracking-[0.08em] text-muted uppercase">
                {group}
              </p>
              <ul className="flex flex-col gap-0.5">
                {items.map((item) => (
                  <li key={item.slug}>
                    <button
                      type="button"
                      onClick={() => selectExample(item)}
                      aria-current={item.slug === slug ? 'true' : undefined}
                      className={cn(
                        'w-full rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[0.875rem] leading-snug transition-colors duration-150',
                        item.slug === slug
                          ? 'bg-accent-soft font-medium text-accent'
                          : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                      )}
                    >
                      {item.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule bg-paper-raised px-3 py-2.5 sm:px-4 lg:col-start-2">
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor="pelda-valaszto">
            Példa kiválasztása
          </label>
          <select
            id="pelda-valaszto"
            value={slug}
            onChange={(event) => {
              const next = examples.find((item) => item.slug === event.target.value)
              if (next) selectExample(next)
            }}
            className="mb-1 w-full rounded-[var(--radius-md)] border border-rule bg-paper px-2 py-1.5 text-sm text-ink lg:hidden"
          >
            {slug === CUSTOM ? <option value={CUSTOM}>Megosztott kód</option> : null}
            {groups.map(([group, items]) => (
              <optgroup key={group} label={group}>
                {items.map((item) => (
                  <option key={item.slug} value={item.slug}>
                    {item.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <h1 className="hidden truncate font-semibold text-ink lg:block">
            {example?.title ?? 'Megosztott kód'}
            {modified ? (
              <span className="ml-2 text-xs font-normal text-muted">módosítva</span>
            ) : null}
          </h1>
          <p className="hidden truncate text-sm text-muted sm:block">
            {example?.description ?? 'Egy link alapján megnyitott, saját kód.'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {example?.docs ? (
            <Link
              href={example.docs}
              className="hidden h-9 items-center gap-1.5 rounded-full px-3 text-sm whitespace-nowrap text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink xl:inline-flex"
            >
              <BookOpen className="size-4" aria-hidden="true" />
              Dokumentáció
            </Link>
          ) : null}
          <button
            type="button"
            onClick={reset}
            disabled={!modified}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm whitespace-nowrap text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-45 disabled:hover:bg-transparent"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            <span className="hidden sm:inline">Visszaállítás</span>
          </button>
          <button
            type="button"
            onClick={share}
            className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm whitespace-nowrap text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            {copied ? (
              <Check className="size-4 text-tip-ink" aria-hidden="true" />
            ) : (
              <Link2 className="size-4" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{copied ? 'Link kimásolva' : 'Megosztás'}</span>
          </button>
          {running ? (
            <button
              type="button"
              onClick={cancel}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-rule-strong px-4 text-sm font-medium whitespace-nowrap text-ink transition-colors hover:bg-surface-2"
            >
              <Square className="size-3.5 fill-current" aria-hidden="true" />
              Leállítás
            </button>
          ) : (
            <button
              type="button"
              onClick={() => execute(code)}
              aria-keyshortcuts="Meta+Enter Control+Enter"
              className="inline-flex h-9 items-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold whitespace-nowrap text-brand-ink transition-[background-color,transform] duration-150 hover:bg-brand-deep active:translate-y-px dark:hover:bg-accent-hover"
            >
              <Play className="size-3.5 fill-current" aria-hidden="true" />
              Futtatás
              <kbd className="hidden rounded bg-brand-ink/15 px-1.5 py-0.5 font-sans text-[0.68rem] font-medium sm:inline">
                {shortcut.isMac ? '⌘↵' : 'Ctrl ↵'}
              </kbd>
            </button>
          )}
        </div>
        {shared ? (
          <p className="flex w-full items-center gap-2 rounded-[var(--radius-md)] border border-warning-border bg-warning-bg px-3 py-2 text-sm text-warning-ink">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            Megosztott kódot nyitottál meg. Futtatás előtt nézd át, mit csinál.
          </p>
        ) : null}
        <div
          className="flex w-full rounded-full border border-rule bg-surface p-0.5 lg:hidden"
          role="tablist"
          aria-label="Nézet"
        >
          {(['kod', 'kimenet'] as const).map((view) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={mobileView === view}
              onClick={() => setMobileView(view)}
              className={cn(
                'flex-1 rounded-full py-1.5 text-sm font-medium transition-colors',
                mobileView === view
                  ? 'bg-paper-raised text-ink shadow-[var(--shadow-whisper)]'
                  : 'text-muted',
              )}
            >
              {view === 'kod'
                ? 'Kód'
                : `Kimenet${state.entries.length ? ` (${state.entries.length})` : ''}`}
            </button>
          ))}
        </div>
      </header>

      <div className="grid min-h-0 lg:col-start-2 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,42%)]">
        <section
          aria-label="Kódszerkesztő"
          className={cn(
            'relative min-h-0 bg-[var(--code-background)]',
            mobileView === 'kimenet' && 'hidden lg:block',
          )}
        >
          {editorReady ? null : <PlainCode code={code} />}
          <CodeEditor
            value={code}
            onChange={onCodeChange}
            onRun={() => execute(code)}
            onReady={() => setEditorReady(true)}
            monacoPath={manifest.monaco}
            typesUrl={manifest.types}
            marker={marker}
          />
        </section>
        <section
          aria-label="Kimenet"
          className={cn(
            'flex min-h-0 flex-col border-rule bg-paper lg:border-l',
            mobileView === 'kod' && 'hidden lg:flex',
          )}
        >
          <div
            className="flex items-center gap-1 border-b border-rule px-2"
            role="tablist"
            aria-label="Kimenet nézetei"
          >
            {(
              [
                ['konzol', `Konzol${state.entries.length ? ` · ${state.entries.length}` : ''}`],
                ['halozat', `Számla Agent${state.calls.length ? ` · ${state.calls.length}` : ''}`],
                ['fiok', 'Szimulált fiók'],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={cn(
                  'relative px-3 py-2.5 text-sm whitespace-nowrap transition-colors',
                  tab === value
                    ? 'font-medium text-accent after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-accent'
                    : 'text-muted hover:text-ink',
                )}
              >
                {label}
              </button>
            ))}
            {running ? (
              <LoaderCircle className="ml-auto size-4 animate-spin text-muted" aria-label="Fut" />
            ) : null}
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
            {tab === 'konzol' ? (
              <ConsolePanel
                entries={state.entries}
                result={state.result}
                status={state.status}
                pdfUrls={state.pdfUrls}
              />
            ) : tab === 'halozat' ? (
              <NetworkPanel calls={state.calls} status={state.status} />
            ) : (
              <AccountPanel account={state.result?.account} />
            )}
          </div>
        </section>
      </div>

      <footer className="flex items-center gap-3 border-t border-rule bg-paper-raised px-3 py-1.5 text-xs text-muted sm:px-4 lg:col-start-2">
        <span className="inline-flex items-center gap-1.5">
          <span
            className={cn(
              'size-2 rounded-full',
              state.status === 'failed' || state.status === 'timeout'
                ? 'bg-danger-ink'
                : running
                  ? 'bg-amber'
                  : 'bg-accent',
            )}
            aria-hidden="true"
          />
          {statusText}
        </span>
        <span className="hidden truncate md:inline">
          A kód a böngésződben fut, szimulált Számlázz.hu ellen. Hálózati kérés nem megy ki.
        </span>
        <span className="tnum ml-auto whitespace-nowrap">kassza {kasszaVersion}</span>
      </footer>
    </div>
  )
}
