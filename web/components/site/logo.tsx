import { cn } from '@/lib/cn'
import { LogoArt } from '@/lib/logo-art'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      className={cn('size-8 shrink-0 drop-shadow-[0_2px_5px_rgba(28,35,45,0.28)]', className)}
    >
      <LogoArt />
    </svg>
  )
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark className="size-8" />
      <span className="font-display text-[1.35rem] leading-none font-extrabold tracking-[-0.035em] text-ink">
        kassza
      </span>
    </span>
  )
}
