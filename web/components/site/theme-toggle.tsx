'use client'

import { Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/cn'

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      aria-label="Világos vagy sötét téma váltása"
      title="Téma váltása"
      className={cn(
        'relative inline-flex size-9 items-center justify-center rounded-full text-ink-2 transition-colors duration-200 ease-out hover:bg-surface-2 hover:text-ink active:translate-y-px',
        className,
      )}
    >
      <Sun className="size-[1.15rem] dark:hidden" aria-hidden="true" />
      <Moon className="hidden size-[1.1rem] dark:block" aria-hidden="true" />
    </button>
  )
}
