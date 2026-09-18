import { Flame, Info, Lightbulb, NotebookPen, TriangleAlert } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

const variants = {
  note: {
    label: 'Megjegyzés',
    icon: NotebookPen,
    className: 'border-note-border bg-note-bg [--callout-ink:var(--note-ink)]',
  },
  tip: {
    label: 'Tanács',
    icon: Lightbulb,
    className: 'border-tip-border bg-tip-bg [--callout-ink:var(--tip-ink)]',
  },
  info: {
    label: 'Információ',
    icon: Info,
    className: 'border-info-border bg-info-bg [--callout-ink:var(--info-ink)]',
  },
  warning: {
    label: 'Figyelem',
    icon: TriangleAlert,
    className: 'border-warning-border bg-warning-bg [--callout-ink:var(--warning-ink)]',
  },
  danger: {
    label: 'Veszély',
    icon: Flame,
    className: 'border-danger-border bg-danger-bg [--callout-ink:var(--danger-ink)]',
  },
} as const

export type CalloutType = keyof typeof variants

export function Callout({
  type = 'note',
  title,
  children,
}: {
  type?: CalloutType | 'error' | 'warn' | 'success'
  title?: ReactNode
  children: ReactNode
}) {
  const key: CalloutType =
    type === 'error' ? 'danger' : type === 'warn' ? 'warning' : type === 'success' ? 'tip' : type
  const variant = variants[key]
  const Icon = variant.icon
  return (
    <aside
      className={cn(
        'my-5 rounded-[var(--radius-md)] border px-4 py-3.5 text-[0.95rem] leading-relaxed',
        variant.className,
      )}
    >
      <p className="mb-1.5 flex items-center gap-2 text-[0.78rem] font-bold tracking-[0.06em] text-[var(--callout-ink)] uppercase">
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        {title ?? variant.label}
      </p>
      <div className="text-ink [&>:last-child]:mb-0 [&_a]:!text-[var(--callout-ink)] [&_a]:!underline [&_a]:!decoration-current/40">
        {children}
      </div>
    </aside>
  )
}
