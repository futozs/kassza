import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-accent-soft px-3 py-1 text-[0.8rem] font-medium text-accent',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Accent({ children }: { children: ReactNode }) {
  return <span className="text-accent">{children}</span>
}

export function SectionHeading({
  id,
  eyebrow,
  title,
  children,
  align = 'center',
  className,
}: {
  id: string
  eyebrow: string
  title: ReactNode
  children?: ReactNode
  align?: 'center' | 'start'
  className?: string
}) {
  return (
    <header
      className={cn(
        'flex max-w-[46rem] min-w-0 flex-col gap-4',
        align === 'center' ? 'mx-auto items-center text-center' : 'items-start',
        className,
      )}
    >
      <Eyebrow>{eyebrow}</Eyebrow>
      <h2
        id={id}
        className="font-display text-[length:var(--text-section)] leading-[1.1] font-semibold tracking-[-0.025em] text-balance text-ink [overflow-wrap:anywhere]"
      >
        {title}
      </h2>
      {children ? (
        <p className="max-w-[58ch] text-[length:var(--text-lede)] leading-relaxed text-pretty text-ink-2">
          {children}
        </p>
      ) : null}
    </header>
  )
}

export function LandingSection({
  id,
  children,
  className,
}: {
  id: string
  children: ReactNode
  className?: string
}) {
  return (
    <section aria-labelledby={id} className={cn('py-20 lg:py-28', className)}>
      <LandingContainer>{children}</LandingContainer>
    </section>
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
