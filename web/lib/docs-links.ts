const DOCS_BASE = '/docs'
const MARKDOWN_INDEX_SLUG = 'index'
const DOCS_INDEX_TITLE = 'Dokumentáció'

export const OG_IMAGE_FILE = 'image.png'
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const

interface SluggedPage {
  readonly slugs: readonly string[]
}

interface TitledPage extends SluggedPage {
  readonly data: { readonly title: string }
}

export function isDocsIndex(page: SluggedPage): boolean {
  return page.slugs.length === 0
}

export function docsPageTitle(page: TitledPage): string {
  return isDocsIndex(page) ? DOCS_INDEX_TITLE : page.data.title
}

export function toMarkdownSlugs(slugs: readonly string[]): string[] {
  return slugs.length === 0 ? [MARKDOWN_INDEX_SLUG] : [...slugs]
}

export function fromMarkdownSlugs(slugs: readonly string[] | undefined): string[] {
  if (!slugs || (slugs.length === 1 && slugs[0] === MARKDOWN_INDEX_SLUG)) return []
  return [...slugs]
}

export function markdownUrl(page: SluggedPage): string {
  return `${DOCS_BASE}/${toMarkdownSlugs(page.slugs).join('/')}.md`
}

export function toOgImageSlugs(slugs: readonly string[]): string[] {
  return [...slugs, OG_IMAGE_FILE]
}

export function fromOgImageSlugs(slugs: readonly string[]): string[] | undefined {
  if (slugs.at(-1) !== OG_IMAGE_FILE) return undefined
  return slugs.slice(0, -1)
}

export function ogImageUrl(page: SluggedPage): string {
  return `/og${DOCS_BASE}/${toOgImageSlugs(page.slugs).join('/')}`
}

export function absoluteUrl(path: string, base: string): string {
  return new URL(path, `${base.replace(/\/+$/, '')}/`).toString()
}
