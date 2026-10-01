'use client'

import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from 'react'
import { cn } from '@/lib/cn'

export interface CodeTab {
  readonly id: string
  readonly label: string
  readonly node: ReactNode
}

export function CodeSwitch({ tabs, caption }: { tabs: readonly CodeTab[]; caption: ReactNode }) {
  const [active, setActive] = useState(tabs[0]?.id)
  const baseId = useId()
  const buttons = useRef<(HTMLButtonElement | null)[]>([])

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
    const index = tabs.findIndex((tab) => tab.id === active)
    const step = event.key === 'ArrowRight' ? 1 : -1
    const next = (index + step + tabs.length) % tabs.length
    const tab = tabs[next]
    if (!tab) return
    setActive(tab.id)
    buttons.current[next]?.focus()
  }

  return (
    <figure className="code-switch m-0 min-w-0">
      <div
        role="tablist"
        aria-label="Kódnézet"
        onKeyDown={onKeyDown}
        className="inline-flex gap-1 rounded-[var(--radius-md)] bg-surface p-1"
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === active
          return (
            <button
              key={tab.id}
              ref={(node) => {
                buttons.current[index] = node
              }}
              type="button"
              role="tab"
              id={`${baseId}-${tab.id}-tab`}
              aria-selected={selected}
              aria-controls={`${baseId}-${tab.id}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(tab.id)}
              className={cn(
                'h-8 rounded-[var(--radius-sm)] px-3 text-sm font-medium transition-[background-color,color,box-shadow] duration-200 ease-out',
                selected ? 'bg-paper text-ink shadow-hairline' : 'text-muted hover:text-ink',
              )}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-${tab.id}-panel`}
          aria-labelledby={`${baseId}-${tab.id}-tab`}
          hidden={tab.id !== active}
          className="mt-3"
        >
          {tab.node}
        </div>
      ))}
      <figcaption className="mt-4 text-sm leading-relaxed text-muted">{caption}</figcaption>
    </figure>
  )
}
