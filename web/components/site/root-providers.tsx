'use client'

import { NextProvider } from 'fumadocs-core/framework/next'
import { ThemeProvider } from 'next-themes'
import type { ReactNode } from 'react'
import { DARK_MODE_ENABLED } from '@/lib/theme'
import { SearchProvider } from './search-context'

export function RootProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={DARK_MODE_ENABLED ? 'system' : 'light'}
      forcedTheme={DARK_MODE_ENABLED ? undefined : 'light'}
      enableSystem={DARK_MODE_ENABLED}
      disableTransitionOnChange
    >
      <NextProvider>
        <SearchProvider>{children}</SearchProvider>
      </NextProvider>
    </ThemeProvider>
  )
}
