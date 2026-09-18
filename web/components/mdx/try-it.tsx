import { FlaskConical } from 'lucide-react'
import type { ReactNode } from 'react'

export function TryIt({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="not-prose my-6 rounded-[var(--radius-lg)] border border-rule bg-paper-raised shadow-[var(--shadow-whisper)]">
      <header className="flex items-center gap-2 border-b border-rule px-4 py-2.5">
        <FlaskConical className="size-4 text-accent" aria-hidden="true" />
        <p className="text-[0.78rem] font-bold tracking-[0.06em] text-accent uppercase">
          Próbáld ki
        </p>
        {title ? <p className="truncate text-sm text-muted">· {title}</p> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}
