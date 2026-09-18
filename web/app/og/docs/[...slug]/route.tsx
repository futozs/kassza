import { getBreadcrumbItems } from 'fumadocs-core/breadcrumb'
import { ImageResponse } from 'next/og'
import { docsPageTitle, fromOgImageSlugs, OG_IMAGE_SIZE, toOgImageSlugs } from '@/lib/docs-links'
import { loadOgFonts } from '@/lib/og-fonts'
import { docsOgImage } from '@/lib/og-image'
import { type DocsPage, source } from '@/lib/source'

export const revalidate = false
export const dynamicParams = false

interface OgRouteContext {
  params: Promise<{ slug: string[] }>
}

function sectionOf(page: DocsPage): string | undefined {
  const [first] = getBreadcrumbItems(page.url, source.getPageTree())
  return typeof first?.name === 'string' ? first.name : undefined
}

export async function GET(_request: Request, context: OgRouteContext) {
  const { slug } = await context.params
  const pageSlugs = fromOgImageSlugs(slug)
  const page = pageSlugs ? source.getPage(pageSlugs) : undefined
  if (!page) {
    return new Response('Ehhez az oldalhoz nincs előnézeti kép.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  const title = docsPageTitle(page)
  const section = sectionOf(page)

  return new ImageResponse(
    docsOgImage({
      title,
      description: page.data.description,
      section: section === title ? undefined : section,
    }),
    { ...OG_IMAGE_SIZE, fonts: await loadOgFonts() },
  )
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({ slug: toOgImageSlugs(page.slugs) }))
}
