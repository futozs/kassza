import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Reveal } from './reveal'

export function SectionTitle({
  id,
  title,
  children,
  tone = 'light',
  className,
}: {
  id: string
  title: ReactNode
  children?: ReactNode
  tone?: 'light' | 'dark'
  className?: string
}) {
  return (
    <Reveal className={cn('flex flex-col items-center text-center', className)}>
      <h2 id={id} className={cn('section-title', tone === 'dark' ? 'text-white' : 'text-ink')}>
        {title}
      </h2>
      {children ? (
        <p
          className={cn(
            'mt-6 max-w-[38rem] text-[clamp(1.05rem,0.4vw+0.95rem,1.2rem)] leading-relaxed text-pretty',
            tone === 'dark' ? 'text-white/65' : 'text-ink-2',
          )}
        >
          {children}
        </p>
      ) : null}
    </Reveal>
  )
}
