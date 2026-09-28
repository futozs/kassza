'use client'

import type { AGENT_ACTIONS } from 'kassza'
import { AlertTriangle, ChevronRight, CircleX, Mail, RotateCcw, Unplug } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { cn } from '@/lib/cn'
import type { ConsoleEntry, RunResult } from '@/sandbox/runtime/protocol'
import type { SimulatedCall } from '@/sandbox/simulator'
import { PreviewValue } from './preview-value'
import type { RunStatus, SandboxLogEntry } from './use-sandbox-runner'
import { XmlCode } from './xml-code'

const ACTION_LABELS: Readonly<Record<keyof typeof AGENT_ACTIONS, string>> = {
  createInvoice: 'Számla létrehozás',
  reverseInvoice: 'Számla sztornó',
  registerPayment: 'Befizetés rögzítése',
  getInvoicePdf: 'PDF lekérés',
  getInvoiceXml: 'Számla adatai',
  deleteProforma: 'Díjbekérő törlése',
  createReceipt: 'Nyugta létrehozás',
  reverseReceipt: 'Nyugta sztornó',
  getReceipt: 'Nyugta lekérdezés',
  sendReceipt: 'Nyugta kiküldés',
  queryTaxpayer: 'Adószám lekérdezés',
}

function EmptyState({ title, children }: { title: string; children: string }) {
  return (
    <div className="flex h-full flex-col items-start justify-center gap-1.5 px-6 py-10">
      <p className="font-medium text-ink">{title}</p>
      <p className="max-w-sm text-sm text-muted">{children}</p>
    </div>
  )
}

const levelStyles: Readonly<Record<ConsoleEntry['level'], string>> = {
  log: '',
  debug: 'text-muted',
  info: 'text-[var(--info-ink)]',
  warn: 'bg-warning-bg/70 text-warning-ink',
  error: 'bg-danger-bg/70 text-danger-ink',
}

function LogArguments({
  entry,
  pdfUrls,
  defaultOpen,
}: {
  entry: SandboxLogEntry
  pdfUrls: Readonly<Record<string, string>>
  defaultOpen: boolean
}) {
  const nodes: ReactNode[] = []
  for (const [position, arg] of entry.args.entries()) {
    nodes.push(
      <span key={`${entry.id}.${position}`} className="mr-2 inline">
        <PreviewValue preview={arg} pdfUrls={pdfUrls} topLevel defaultOpen={defaultOpen} />
      </span>,
    )
  }
  return <>{nodes}</>
}

export function ConsolePanel({
  entries,
  status,
  pdfUrls,
}: {
  entries: readonly SandboxLogEntry[]
  status: RunStatus
  pdfUrls: Readonly<Record<string, string>>
}) {
  if (status === 'idle') {
    return (
      <EmptyState title="Még nem futtattad a kódot.">
        Nyomd meg a Futtatás gombot (⌘/Ctrl + Enter). A kód a böngésződben fut, semmilyen kérés nem
        hagyja el a gépedet.
      </EmptyState>
    )
  }
  const defaultOpen = entries.length < 12
  return (
    <div className="font-mono text-[0.8rem] leading-relaxed">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className={cn('flex gap-2 border-b border-rule/70 px-4 py-1.5', levelStyles[entry.level])}
        >
          {entry.level === 'warn' ? (
            <AlertTriangle className="mt-1 size-3.5 shrink-0" aria-label="Figyelmeztetés" />
          ) : entry.level === 'error' ? (
            <CircleX className="mt-1 size-3.5 shrink-0" aria-label="Hiba" />
          ) : (
            <span className="mt-1 size-3.5 shrink-0" aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1 break-words">
            <LogArguments entry={entry} pdfUrls={pdfUrls} defaultOpen={defaultOpen} />
          </div>
        </div>
      ))}
      {status === 'done' && entries.length === 0 ? (
        <p className="px-4 py-3 font-sans text-sm text-muted">
          A kód lefutott, de nem írt a konzolra.
        </p>
      ) : null}
    </div>
  )
}

export function RunNotice({
  entries,
  result,
  status,
  pdfUrls,
}: {
  entries: readonly SandboxLogEntry[]
  result: RunResult | undefined
  status: RunStatus
  pdfUrls: Readonly<Record<string, string>>
}) {
  if (result?.error) {
    return (
      <div className="flex gap-2 border-b border-danger-border bg-danger-bg px-4 py-3 text-danger-ink">
        <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1 font-mono text-[0.8rem] leading-relaxed break-words">
          <p className="mb-1 font-sans text-xs font-semibold tracking-wide uppercase">
            Kezeletlen hiba{result.error.line ? ` · ${result.error.line}. sor` : ''}
          </p>
          <PreviewValue preview={result.error.preview} pdfUrls={pdfUrls} topLevel defaultOpen />
        </div>
      </div>
    )
  }
  if (status === 'timeout') {
    return (
      <p className="flex gap-2 border-b border-warning-border bg-warning-bg px-4 py-3 text-sm text-warning-ink">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />A futás 20 másodperc
        után leállt. Végtelen ciklus vagy le nem záródó Promise lehet a kódban.
      </p>
    )
  }
  const last = entries.at(-1)
  if (status !== 'failed' || result || !last) return null
  const message = last.args.map((arg) => (arg.t === 'string' ? arg.v : '')).join(' ')
  return (
    <p
      className={cn(
        'flex gap-2 border-b px-4 py-3 text-sm',
        last.level === 'warn'
          ? 'border-warning-border bg-warning-bg text-warning-ink'
          : 'border-danger-border bg-danger-bg text-danger-ink',
      )}
    >
      {last.level === 'warn' ? (
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      ) : (
        <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      )}
      {message}
    </p>
  )
}

function statusLabel(call: SimulatedCall): { text: string; tone: string } {
  if (call.status === 'network-error') return { text: 'Hálózati hiba', tone: 'text-danger-ink' }
  if (call.status === 'timeout') return { text: 'Időtúllépés', tone: 'text-danger-ink' }
  const failed =
    call.responseHeaders.some(
      ([name]) => name === 'szlahu_error_code' || name === 'szlahu_error',
    ) ||
    /<sikeres>false<\/sikeres>/.test(call.responseBody) ||
    call.responseBody.startsWith('[ERR]')
  if (call.status >= 400) return { text: `HTTP ${call.status}`, tone: 'text-danger-ink' }
  return failed
    ? { text: `${call.status} · hiba`, tone: 'text-warning-ink' }
    : { text: String(call.status), tone: 'text-tip-ink' }
}

function CallRow({ call, defaultOpen }: { call: SimulatedCall; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const [view, setView] = useState<'request' | 'response'>('request')
  const status = statusLabel(call)
  return (
    <li className="border-b border-rule">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-surface-2"
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            'size-4 shrink-0 text-muted transition-transform duration-150',
            open && 'rotate-90',
          )}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-ink">{ACTION_LABELS[call.action]}</span>
          <span className="block truncate font-mono text-[0.72rem] text-muted">
            POST /szamla/ · {call.field}
          </span>
        </span>
        <span className={cn('tnum shrink-0 font-mono text-xs', status.tone)}>{status.text}</span>
      </button>
      {open ? (
        <div className="px-4 pb-4">
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <RotateCcw className="size-3" aria-hidden="true" />
              {call.sessionReused ? 'Session cookie újrahasznosítva' : 'Új session'}
            </span>
            {call.attachments.length > 0 ? <span>{call.attachments.length} melléklet</span> : null}
          </div>
          {call.effects.length > 0 ? (
            <ul className="mb-3 flex flex-col gap-1">
              {call.effects.map((effect) => (
                <li key={effect} className="flex items-start gap-2 text-xs text-ink-2">
                  {effect.includes('e-mail') ? (
                    <Mail className="mt-0.5 size-3 shrink-0 text-accent" aria-hidden="true" />
                  ) : effect.includes('hálózati') || effect.includes('időtúllépés') ? (
                    <Unplug className="mt-0.5 size-3 shrink-0 text-danger-ink" aria-hidden="true" />
                  ) : (
                    <span
                      className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent"
                      aria-hidden="true"
                    />
                  )}
                  {effect}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="overflow-hidden rounded-[var(--radius-md)] border border-rule bg-[var(--code-background)]">
            <div
              className="flex border-b border-rule"
              role="tablist"
              aria-label="Kérés vagy válasz"
            >
              {(['request', 'response'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  role="tab"
                  aria-selected={view === item}
                  onClick={() => setView(item)}
                  className={cn(
                    'relative px-3 py-2 font-mono text-xs transition-colors',
                    view === item
                      ? 'text-accent after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent'
                      : 'text-muted hover:text-ink',
                  )}
                >
                  {item === 'request' ? 'Elküldött XML' : 'Válasz'}
                </button>
              ))}
            </div>
            <div className="scrollbar-thin max-h-[26rem] overflow-auto p-3">
              {view === 'request' ? (
                <XmlCode code={call.requestXml} />
              ) : (
                <>
                  {call.responseHeaders.length > 0 ? (
                    <div className="mb-3 border-b border-rule pb-2 font-mono text-[0.72rem] leading-relaxed">
                      {call.responseHeaders.map(([name, value]) => (
                        <div key={`${name}-${value}`} className="break-all">
                          <span className="text-[var(--code-token-function)]">{name}</span>
                          <span className="text-muted">: </span>
                          <span className="text-[var(--code-token-string)]">{value}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {call.responseKind === 'xml' ? (
                    <XmlCode code={call.responseBody} />
                  ) : (
                    <code className="block font-mono text-[0.78rem] whitespace-pre-wrap text-ink-2">
                      {call.responseBody || 'Nem érkezett válasz.'}
                    </code>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </li>
  )
}

export function NetworkPanel({
  calls,
  status,
}: {
  calls: readonly SimulatedCall[]
  status: RunStatus
}) {
  if (status === 'idle') {
    return (
      <EmptyState title="Még nem futtattad a kódot.">
        Nyomd meg a Futtatás gombot (⌘/Ctrl + Enter). A kassza a böngésződben fut, egy szimulált
        Számlázz.hu ellen, így semmilyen kérés nem hagyja el a gépedet.
      </EmptyState>
    )
  }
  if (calls.length === 0) {
    return (
      <EmptyState
        title={status === 'running' ? 'Várakozás az első kérésre…' : 'Nem volt Számla Agent hívás.'}
      >
        Itt látod a kassza által ténylegesen elküldött XML-t és a szimulált Számlázz.hu válaszát, a
        fejlécekkel és a session cookie-val együtt.
      </EmptyState>
    )
  }
  return (
    <ol>
      {calls.map((call) => (
        <CallRow key={call.id} call={call} defaultOpen={call.id === calls[0]?.id} />
      ))}
    </ol>
  )
}
