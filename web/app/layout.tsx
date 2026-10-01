import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, Geist, Geist_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import { RootProviders } from '@/components/site/root-providers'
import { site } from '@/lib/site'
import { DARK_MODE_ENABLED, DARK_THEME_COLOR, LIGHT_THEME_COLOR } from '@/lib/theme'
import './globals.css'
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'

const display = Bricolage_Grotesque({
  subsets: ['latin', 'latin-ext'],
  axes: ['opsz', 'wdth'],
  variable: '--ff-display',
  display: 'swap',
})

const sans = Geist({
  subsets: ['latin', 'latin-ext'],
  variable: '--ff-sans',
  display: 'swap',
})

const mono = Geist_Mono({
  subsets: ['latin', 'latin-ext'],
  variable: '--ff-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: 'kassza: Számlázz.hu, TypeScriptben',
    template: '%s · kassza',
  },
  description: site.description,
  applicationName: 'kassza',
  keywords: [
    'számlázz.hu',
    'számla agent',
    'typescript',
    'nyugta',
    'díjbekérő',
    'e-számla',
    'nav',
    'npm',
  ],
  authors: [{ name: 'futozs', url: 'https://github.com/futozs' }],
  openGraph: {
    type: 'website',
    locale: 'hu_HU',
    siteName: 'kassza',
    url: '/',
  },
  twitter: { card: 'summary_large_image' },
  alternates: {
    types: { 'text/plain': '/llms.txt' },
  },
}

export const viewport: Viewport = DARK_MODE_ENABLED
  ? {
      themeColor: [
        { media: '(prefers-color-scheme: light)', color: LIGHT_THEME_COLOR },
        { media: '(prefers-color-scheme: dark)', color: DARK_THEME_COLOR },
      ],
      colorScheme: 'light dark',
    }
  : { themeColor: LIGHT_THEME_COLOR, colorScheme: 'light' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="hu"
      suppressHydrationWarning
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
    >
      <body>
        <RootProviders>{children}</RootProviders>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
