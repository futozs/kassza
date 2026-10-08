import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

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
