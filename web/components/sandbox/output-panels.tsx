'use client'

import type { AGENT_ACTIONS } from 'kassza'
import { AlertTriangle, ChevronRight, CircleX, Info, Mail, RotateCcw, Unplug } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { cn } from '@/lib/cn'
import type { ConsoleEntry, RunResult } from '@/sandbox/runtime/protocol'
import type { AccountSnapshot, SimulatedCall } from '@/sandbox/simulator'
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

function EmptyState({ title, children }: { title: string; children: string }) {
  return (
    <div className="flex h-full flex-col items-start justify-center gap-1.5 px-6 py-10">
      <p className="font-medium text-ink">{title}</p>
      <p className="max-w-sm text-sm text-muted">{children}</p>
    </div>
  )
}

export function ConsolePanel({
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
  const expandByDefault = entries.length < 12
  if (status === 'idle') {
    return (
      <EmptyState title="Még nem futtattad a kódot.">
        Nyomd meg a Futtatás gombot (⌘/Ctrl + Enter). A kassza a böngésződben fut, egy szimulált
        Számlázz.hu ellen, így semmilyen kérés nem hagyja el a gépedet.
      </EmptyState>
    )
  }
  return (
    <div className="font-mono text-[0.8rem] leading-relaxed" role="log" aria-live="polite">
      {entries.map((entry) => (
        <div
          key={entry.id}
          className={cn('flex gap-2 border-b border-rule/70 px-4 py-1.5', levelStyles[entry.level])}
        >
          {entry.level === 'warn' ? (
            <AlertTriangle className="mt-1 size-3.5 shrink-0" aria-label="Figyelmeztetés" />
          ) : entry.level === 'error' ? (
            <CircleX className="mt-1 size-3.5 shrink-0" aria-label="Hiba" />
          ) : entry.level === 'info' ? (
            <Info className="mt-1 size-3.5 shrink-0" aria-label="Információ" />
          ) : (
            <span className="mt-1 size-3.5 shrink-0" aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1 break-words">
            <LogArguments entry={entry} pdfUrls={pdfUrls} defaultOpen={expandByDefault} />
          </div>
        </div>
      ))}
      {result?.error ? (
        <div className="flex gap-2 border-b border-danger-border bg-danger-bg px-4 py-3 text-danger-ink">
          <CircleX className="mt-1 size-3.5 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="mb-1 font-sans text-xs font-semibold tracking-wide uppercase">
              Kezeletlen hiba{result.error.line ? ` · ${result.error.line}. sor` : ''}
            </p>
            <PreviewValue preview={result.error.preview} pdfUrls={pdfUrls} topLevel defaultOpen />
          </div>
        </div>
      ) : null}
      {status === 'timeout' ? (
        <div className="border-b border-warning-border bg-warning-bg px-4 py-3 font-sans text-sm text-warning-ink">
          A futás 20 másodperc után leállt. Végtelen ciklus vagy le nem záródó Promise lehet a
          kódban.
        </div>
      ) : null}
      {status === 'done' && entries.length === 0 ? (
        <p className="px-4 py-3 font-sans text-sm text-muted">
          A kód lefutott, de nem írt a konzolra.
        </p>
      ) : null}
    </div>
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

const typeLabels: Readonly<Record<string, string>> = {
  SZ: 'Számla',
  D: 'Díjbekérő',
  ES: 'Előlegszámla',
  VS: 'Végszámla',
  HS: 'Helyesbítő',
  SS: 'Sztornó',
  SL: 'Szállítólevél',
  NY: 'Nyugta',
  SN: 'Sztornó nyugta',
}

const amount = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 2 })

export function AccountPanel({ account }: { account: AccountSnapshot | undefined }) {
  if (!account) {
    return (
      <EmptyState title="A szimulált fiók üres.">
        Futtatás után itt látod, milyen bizonylatok jöttek létre, mennyi a hátralék, és mi lett
        sztornózva vagy törölve. Minden futtatás tiszta fiókkal indul.
      </EmptyState>
    )
  }
  return (
    <div className="flex flex-col gap-6 p-4 text-sm">
      <section>
        <h3 className="mb-2 font-semibold text-ink">Eladó</h3>
        <p className="text-ink-2">
          {account.seller.name} · {account.seller.taxNumber}
        </p>
        <p className="text-muted">
          Regisztrált számlaelőtagok:{' '}
          {account.invoicePrefixes.map((prefix) => (
            <code
              key={prefix}
              className="mr-1 rounded border border-rule bg-surface px-1 font-mono text-xs text-ink"
            >
              {prefix}
            </code>
          ))}
        </p>
      </section>
      <section>
        <h3 className="mb-2 font-semibold text-ink">Számlák ({account.invoices.length})</h3>
        {account.invoices.length === 0 ? (
          <p className="text-muted">Nem jött létre számla.</p>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-md)] border border-rule">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Szám</th>
                  <th className="px-3 py-2 font-medium">Típus</th>
                  <th className="px-3 py-2 text-right font-medium">Bruttó</th>
                  <th className="px-3 py-2 text-right font-medium">Befizetve</th>
                  <th className="px-3 py-2 font-medium">Állapot</th>
                </tr>
              </thead>
              <tbody>
                {account.invoices.map((invoice) => {
                  const gross = invoice.items.reduce((sum, item) => sum + item.gross, 0)
                  const paid = invoice.payments.reduce((sum, payment) => sum + payment.amount, 0)
                  return (
                    <tr key={invoice.number} className="border-t border-rule">
                      <td className="px-3 py-2 font-mono whitespace-nowrap text-ink">
                        {invoice.number}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {typeLabels[invoice.typeCode]}
                      </td>
                      <td className="tnum px-3 py-2 text-right whitespace-nowrap">
                        {amount.format(gross)}{' '}
                        {invoice.currency === 'HUF' ? 'Ft' : invoice.currency}
                      </td>
                      <td className="tnum px-3 py-2 text-right whitespace-nowrap">
                        {amount.format(paid)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-muted">
                        {invoice.deleted ? 'törölve' : invoice.reversed ? 'sztornózva' : 'érvényes'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section>
        <h3 className="mb-2 font-semibold text-ink">Nyugták ({account.receipts.length})</h3>
        {account.receipts.length === 0 ? (
          <p className="text-muted">Nem jött létre nyugta.</p>
        ) : (
          <div className="overflow-x-auto rounded-[var(--radius-md)] border border-rule">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">Szám</th>
                  <th className="px-3 py-2 font-medium">Típus</th>
                  <th className="px-3 py-2 text-right font-medium">Bruttó</th>
                  <th className="px-3 py-2 font-medium">Kiküldve</th>
                </tr>
              </thead>
              <tbody>
                {account.receipts.map((receipt) => (
                  <tr key={receipt.number} className="border-t border-rule">
                    <td className="px-3 py-2 font-mono whitespace-nowrap text-ink">
                      {receipt.number}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{typeLabels[receipt.typeCode]}</td>
                    <td className="tnum px-3 py-2 text-right whitespace-nowrap">
                      {amount.format(receipt.items.reduce((sum, item) => sum + item.gross, 0))}
                    </td>
                    <td className="px-3 py-2 text-muted">{receipt.sentTo.join(', ') || '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
