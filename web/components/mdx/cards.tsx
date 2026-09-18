import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

export function Cards({ children }: { children: ReactNode }) {
  return <div className="not-prose my-6 grid gap-4 sm:grid-cols-2">{children}</div>
}

export function Card({
  title,
  href,
  children,
}: {
  title: string
  href: string
  children?: ReactNode
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-1.5 rounded-[var(--radius-md)] border border-rule bg-paper-raised p-4 shadow-[var(--shadow-whisper)] transition-[border-color,box-shadow,transform] duration-200 ease-out hover:-translate-y-px hover:border-rule-strong hover:shadow-[var(--shadow-lift)]"
    >
      <span className="flex items-center justify-between gap-3 font-semibold text-ink">
        {title}
        <ArrowRight
          className="size-4 shrink-0 text-muted transition-[color,transform] duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-accent"
          aria-hidden="true"
        />
      </span>
      {children ? <span className="text-sm leading-relaxed text-muted">{children}</span> : null}
    </Link>
  )
}
