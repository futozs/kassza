import { brandColors, logoPaths } from '@/lib/brand'
import { cn } from '@/lib/cn'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" aria-hidden="true" className={cn('size-8 shrink-0', className)}>
      <rect width="512" height="512" rx="112" fill={brandColors.brand} />
      <path d={logoPaths.stem} fill={brandColors.brandInk} />
      <path d={logoPaths.chevron} fill={brandColors.amber} />
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
