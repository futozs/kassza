import { cn } from '@/lib/cn'

const WAVE_PATH = 'M0 70C160 26 330 4 520 22C700 39 820 92 1010 92C1180 92 1320 48 1440 18V120H0Z'

export function Wave({ flip = false, className }: { flip?: boolean; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1440 120"
      preserveAspectRatio="none"
      className={cn(
        'relative block h-[clamp(3rem,7vw,6.5rem)] w-full',
        flip ? '-mt-px rotate-180' : '-mb-px',
        className,
      )}
    >
      <path d={WAVE_PATH} fill="currentColor" />
    </svg>
  )
}
