import { renderPageMarkdown, sortByTree } from '@/lib/llms'
import { site } from '@/lib/site'
import { source } from '@/lib/source'

export const revalidate = false

export async function GET() {
  const pages = sortByTree(source.getPages(), source.getPageTree())
  const documents = await Promise.all(pages.map((page) => renderPageMarkdown(page, site.url)))

  return new Response(documents.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
