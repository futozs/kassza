'use client'

import { NextProvider } from 'fumadocs-core/framework/next'
import { ThemeProvider } from 'next-themes'
import type { ReactNode } from 'react'
import { SearchProvider } from './search-context'

export function RootProviders({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <NextProvider>
        <SearchProvider>{children}</SearchProvider>
      </NextProvider>
    </ThemeProvider>
  )
}
