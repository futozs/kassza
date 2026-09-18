'use client'

import { ArrowUpRight, Check, ClipboardCopy, LoaderCircle } from 'lucide-react'
import { useRef, useState } from 'react'

const actionClass =
  'flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-3 py-1.5 text-left text-[0.82rem] text-muted transition-colors duration-150 ease-out hover:bg-surface-2 hover:text-ink'

export function PageActions({
  markdownUrl,
  editUrl,
  officialUrl,
}: {
  markdownUrl: string
  editUrl: string
  officialUrl?: string | undefined
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'copied' | 'error'>('idle')
  const cache = useRef<string | null>(null)

  async function copyMarkdown() {
    setState('loading')
    try {
      if (cache.current === null) {
        const response = await fetch(markdownUrl)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        cache.current = await response.text()
      }
      await navigator.clipboard.writeText(cache.current)
      setState('copied')
      setTimeout(() => setState('idle'), 2000)
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    }
  }

  return (
    <div className="mt-6 border-t border-rule pt-4">
      <ul className="flex flex-col gap-0.5">
        <li>
          <button type="button" onClick={copyMarkdown} className={actionClass} aria-live="polite">
            {state === 'loading' ? (
              <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            ) : state === 'copied' ? (
              <Check className="size-3.5 text-tip-ink" aria-hidden="true" />
            ) : (
              <ClipboardCopy className="size-3.5" aria-hidden="true" />
            )}
            {state === 'copied'
              ? 'Markdown kimásolva'
              : state === 'error'
                ? 'A másolás nem sikerült'
                : 'Oldal másolása Markdownként'}
          </button>
        </li>
        {officialUrl ? (
          <li>
            <a href={officialUrl} target="_blank" rel="noreferrer" className={actionClass}>
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
              Hivatalos Számlázz.hu leírás
            </a>
          </li>
        ) : null}
        <li>
          <a href={editUrl} target="_blank" rel="noreferrer" className={actionClass}>
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
            Oldal szerkesztése GitHubon
          </a>
        </li>
      </ul>
    </div>
  )
}
