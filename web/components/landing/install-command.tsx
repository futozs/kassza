'use client'

import { Check, Copy, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

type CopyState = 'idle' | 'copied' | 'failed'

const RESET_AFTER_MS = 2000

const labels: Record<CopyState, string> = {
  idle: 'Másolás',
  copied: 'Kimásolva',
  failed: 'Nem sikerült',
}

const announcements: Record<CopyState, string> = {
  idle: '',
  copied: 'A telepítő parancs a vágólapra került.',
  failed: 'A másolás nem sikerült, jelöld ki a parancsot kézzel.',
}

export function InstallCommand({ command, className }: { command: string; className?: string }) {
  const [state, setState] = useState<CopyState>('idle')
  const [canCopy, setCanCopy] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    setCanCopy(typeof navigator !== 'undefined' && navigator.clipboard !== undefined)
    return () => clearTimeout(timer.current)
  }, [])

  async function copy() {
    clearTimeout(timer.current)
    try {
      await navigator.clipboard.writeText(command)
      setState('copied')
    } catch {
      setState('failed')
    }
    timer.current = setTimeout(() => setState('idle'), RESET_AFTER_MS)
  }

  const Icon = state === 'copied' ? Check : state === 'failed' ? TriangleAlert : Copy

  return (
    <div
      className={cn(
        'flex h-13 w-full max-w-[26rem] min-w-0 items-center gap-3 rounded-[var(--radius-lg)] border border-rule bg-surface py-1.5 pr-1.5 pl-4',
        className,
      )}
    >
      <span aria-hidden="true" className="font-mono text-[0.95rem] text-muted select-none">
        $
      </span>
      <code className="min-w-0 flex-1 truncate font-mono text-[0.95rem] text-ink">{command}</code>
      <button
        type="button"
        onClick={copy}
        disabled={!canCopy}
        data-state={state}
        aria-label={state === 'idle' ? 'Telepítő parancs másolása' : labels[state]}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-[var(--radius-md)] border border-rule bg-paper-raised text-sm font-medium whitespace-nowrap text-ink-2 transition-[background-color,color,border-color] duration-200 ease-out hover:border-rule-strong hover:text-ink active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 data-[state=copied]:text-tip-ink data-[state=failed]:border-danger-border data-[state=failed]:text-danger-ink min-[400px]:w-auto min-[400px]:min-w-[8.25rem] min-[400px]:px-3"
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span aria-hidden="true" className="hidden min-[400px]:inline">
          {labels[state]}
        </span>
      </button>
      <span className="sr-only" aria-live="polite">
        {announcements[state]}
      </span>
    </div>
  )
}
