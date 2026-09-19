import kasszaRelease from '../kassza-version.json' with { type: 'json' }

function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return explicit.replace(/\/+$/, '')
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (vercel) return `https://${vercel}`
  return 'http://localhost:3000'
}

export const site = {
  name: 'kassza',
  tagline: 'Számlázz.hu, TypeScriptben.',
  description:
    'Nem hivatalos, nulla függőségű TypeScript kliens a Számlázz.hu Számla Agenthez: számla, díjbekérő, nyugta, sztornó, befizetés, PDF és adószám-lekérdezés.',
  url: resolveSiteUrl(),
  version: kasszaRelease.version,
  repo: 'https://github.com/futozs/kassza',
  npm: 'https://www.npmjs.com/package/kassza',
  issues: 'https://github.com/futozs/kassza/issues',
  changelog: 'https://github.com/futozs/kassza/blob/main/CHANGELOG.md',
  editBase: 'https://github.com/futozs/kassza/edit/main/web/content/docs',
  officialDocs: 'https://docs.szamlazz.hu/hu/agent/',
} as const

export const navLinks = [
  { href: '/docs', label: 'Dokumentáció', match: '/docs' },
  { href: '/sandbox', label: 'Sandbox', match: '/sandbox' },
  { href: '/docs/receptek', label: 'Receptek', match: '/docs/receptek' },
] as const

export function isNavLinkActive(pathname: string, match: string): boolean {
  if (match === '/docs') {
    return pathname.startsWith('/docs') && !pathname.startsWith('/docs/receptek')
  }
  return pathname === match || pathname.startsWith(`${match}/`)
}
