'use client'

import { ChevronRight, FileText } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { cn } from '@/lib/cn'
import type { Preview } from '@/sandbox/runtime/serialize'

const tone = {
  string: 'text-[var(--code-token-string)]',
  number: 'text-[var(--code-token-constant)]',
  keyword: 'text-[var(--code-token-keyword)]',
  muted: 'text-muted',
  key: 'text-[var(--code-token-function)]',
}

function summary(preview: Preview): string {
  switch (preview.t) {
    case 'array':
      return `Array(${preview.length})`
    case 'object':
      return `${preview.ctor ?? ''}{${preview.entries
        .slice(0, 3)
        .map(([key]) => key)
        .join(', ')}${preview.entries.length > 3 ? ', …' : ''}}`
    case 'map':
      return `Map(${preview.entries.length})`
    case 'set':
      return `Set(${preview.items.length})`
    case 'error':
      return `${preview.name}: ${preview.message}`
    default:
      return ''
  }
}

function isExpandable(preview: Preview): boolean {
  if (preview.t === 'array') return preview.items.length > 0
  if (preview.t === 'object') return preview.entries.length > 0
  if (preview.t === 'map') return preview.entries.length > 0
  if (preview.t === 'set') return preview.items.length > 0
  if (preview.t === 'error') return preview.props.length > 0
  return false
}

function Primitive({
  preview,
  pdfUrls,
  quoted,
}: {
  preview: Preview
  pdfUrls: Readonly<Record<string, string>>
  quoted: boolean
}) {
  switch (preview.t) {
    case 'string':
      return quoted ? (
        <span className={tone.string}>'{preview.v}'</span>
      ) : (
        <span className="whitespace-pre-wrap">{preview.v}</span>
      )
    case 'number':
      return <span className={tone.number}>{preview.v}</span>
    case 'bigint':
      return <span className={tone.number}>{preview.v}n</span>
    case 'boolean':
      return <span className={tone.keyword}>{String(preview.v)}</span>
    case 'null':
    case 'undefined':
      return <span className={tone.muted}>{preview.t}</span>
    case 'symbol':
      return <span className={tone.keyword}>{preview.v}</span>
    case 'date':
      return <span className={tone.string}>{preview.v}</span>
    case 'function':
      return <span className={tone.muted}>ƒ {preview.name}()</span>
    case 'circular':
      return <span className={tone.muted}>[Körkörös]</span>
    case 'more':
      return <span className={tone.muted}>… még {preview.count}</span>
    case 'bytes': {
      const url = preview.ref ? pdfUrls[preview.ref] : undefined
      return (
        <span className="inline-flex flex-wrap items-center gap-2">
          <span className={tone.keyword}>Uint8Array({preview.length})</span>
          {preview.pdf ? <span className={tone.muted}>PDF</span> : null}
          {url ? (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-rule bg-paper-raised px-2 py-0.5 font-sans text-[0.72rem] font-medium text-accent transition-colors hover:border-accent"
            >
              <FileText className="size-3" aria-hidden="true" />
              PDF megnyitása
            </a>
          ) : null}
        </span>
      )
    }
    default:
      return null
  }
}

function children(preview: Preview): { key: string; label: ReactNode; value: Preview }[] {
  const rows: { key: string; label: ReactNode; value: Preview }[] = []
  if (preview.t === 'array' || preview.t === 'set') {
    for (const [index, item] of preview.items.entries()) {
      rows.push({
        key: `i${index}`,
        label: <span className={tone.muted}>{index}</span>,
        value: item,
      })
    }
  } else if (preview.t === 'object') {
    for (const [key, value] of preview.entries) {
      rows.push({ key: `k-${key}`, label: <span className={tone.key}>{key}</span>, value })
    }
  } else if (preview.t === 'error') {
    for (const [key, value] of preview.props) {
      rows.push({ key: `e-${key}`, label: <span className={tone.key}>{key}</span>, value })
    }
  } else if (preview.t === 'map') {
    for (const [index, [key, value]] of preview.entries.entries()) {
      rows.push({
        key: `m${index}`,
        label: <Primitive preview={key} pdfUrls={{}} quoted />,
        value,
      })
    }
  }
  return rows
}

export function PreviewValue({
  preview,
  pdfUrls,
  defaultOpen = false,
  topLevel = false,
}: {
  preview: Preview
  pdfUrls: Readonly<Record<string, string>>
  defaultOpen?: boolean
  topLevel?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  if (!isExpandable(preview)) {
    if (preview.t === 'error') {
      return (
        <span className="text-danger-ink">
          {preview.name}: {preview.message}
        </span>
      )
    }
    return <Primitive preview={preview} pdfUrls={pdfUrls} quoted={!topLevel} />
  }
  const isError = preview.t === 'error'
  return (
    <span className="inline-block max-w-full align-top">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn(
          'inline-flex max-w-full items-center gap-1 rounded-[3px] text-left hover:bg-surface-2',
          isError && 'text-danger-ink',
        )}
      >
        <ChevronRight
          aria-hidden="true"
          className={cn(
            'size-3 shrink-0 text-muted transition-transform duration-150',
            open && 'rotate-90',
          )}
        />
        <span className={cn('truncate', !isError && 'text-ink-2')}>{summary(preview)}</span>
      </button>
      {open ? (
        <span className="mt-0.5 block border-l border-rule pl-3">
          {children(preview).map((row) => (
            <span key={row.key} className="block leading-relaxed">
              {row.label}
              <span className={tone.muted}>: </span>
              <PreviewValue preview={row.value} pdfUrls={pdfUrls} />
            </span>
          ))}
        </span>
      ) : null}
    </span>
  )
}
