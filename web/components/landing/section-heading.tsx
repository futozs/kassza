import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function SectionHeading({
  id,
  title,
  children,
  className,
}: {
  id: string
  title: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <header className={cn('flex max-w-[44rem] min-w-0 flex-col gap-4', className)}>
      <h2
        id={id}
        className="font-display text-[length:var(--text-section)] leading-[1.06] font-bold tracking-[-0.028em] text-balance text-ink [overflow-wrap:anywhere]"
      >
        {title}
      </h2>
      {children ? (
        <p className="max-w-[62ch] text-[length:var(--text-lede)] leading-relaxed text-ink-2">
          {children}
        </p>
      ) : null}
    </header>
  )
}

export function LandingContainer({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('mx-auto w-full max-w-[var(--landing-max)] px-4 sm:px-8', className)}>
      {children}
    </div>
  )
}
