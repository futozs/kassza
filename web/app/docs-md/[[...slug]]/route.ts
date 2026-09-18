import { absoluteUrl, fromMarkdownSlugs, toMarkdownSlugs } from '@/lib/docs-links'
import { renderPageMarkdown } from '@/lib/llms'
import { site } from '@/lib/site'
import { source } from '@/lib/source'

export const revalidate = false
export const dynamicParams = false

interface MarkdownRouteContext {
  params: Promise<{ slug?: string[] | undefined }>
}

export async function GET(_request: Request, context: MarkdownRouteContext) {
  const { slug } = await context.params
  const page = source.getPage(fromMarkdownSlugs(slug))
  if (!page) {
    return new Response('Ez a dokumentációs oldal nem létezik.', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  return new Response(await renderPageMarkdown(page, site.url), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      Link: `<${absoluteUrl(page.url, site.url)}>; rel="canonical"`,
    },
  })
}

export function generateStaticParams() {
  return source.getPages().map((page) => ({ slug: toMarkdownSlugs(page.slugs) }))
}
