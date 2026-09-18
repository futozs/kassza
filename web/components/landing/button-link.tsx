import { ArrowRight, ArrowUpRight } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

const base =
  'inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-[0.95rem] font-semibold whitespace-nowrap transition-[background-color,border-color,color] duration-200 ease-out active:translate-y-px aria-disabled:pointer-events-none aria-disabled:opacity-55'

const variants = {
  primary: 'bg-brand text-brand-ink hover:bg-brand-deep dark:hover:bg-accent-hover',
  secondary:
    'border border-rule-strong bg-paper-raised text-ink hover:border-ink-2 hover:bg-surface',
  quiet:
    'px-2 text-ink-2 underline decoration-rule-strong underline-offset-4 hover:text-accent hover:decoration-current',
} as const

export function ButtonLink({
  href,
  children,
  variant = 'primary',
  external = false,
}: {
  href: string
  children: ReactNode
  variant?: keyof typeof variants
  external?: boolean
}) {
  const className = cn(base, variants[variant])
  const Icon = external ? ArrowUpRight : ArrowRight
  const icon = <Icon className="size-4 shrink-0" aria-hidden="true" />
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
        {icon}
      </a>
    )
  }
  return (
    <Link href={href} className={className}>
      {children}
      {icon}
    </Link>
  )
}
