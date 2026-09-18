import { getBreadcrumbItems } from 'fumadocs-core/breadcrumb'
import { findNeighbour } from 'fumadocs-core/page-tree'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/docs/breadcrumbs'
import { PageActions } from '@/components/docs/page-actions'
import { Pagination } from '@/components/docs/pagination'
import { DesktopToc, MobileToc, TocProvider } from '@/components/docs/toc'
import { getMDXComponents } from '@/components/mdx'
import { docsPageTitle, markdownUrl, OG_IMAGE_SIZE, ogImageUrl } from '@/lib/docs-links'
import { site } from '@/lib/site'
import { source } from '@/lib/source'

const dateFormatter = new Intl.DateTimeFormat('hu-HU', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'Europe/Budapest',
})

export default async function DocsPage(props: PageProps<'/docs/[[...slug]]'>) {
  const params = await props.params
  const page = source.getPage(params.slug)
  if (!page) notFound()

  const tree = source.getPageTree()
  const breadcrumbs = getBreadcrumbItems(page.url, tree, { includePage: true })
  const neighbours = findNeighbour(tree, page.url)
  const MDX = page.data.body
  const toc = page.data.toc.filter((item) => item.depth <= 3)
  const lastModified = page.data.lastModified
  const editUrl = `${site.editBase}/${page.path}`

  return (
    <TocProvider toc={toc}>
      <div className="mx-auto grid w-full max-w-[72rem] gap-10 px-4 pt-5 pb-16 sm:px-6 lg:px-8 xl:grid-cols-[minmax(0,1fr)_var(--toc-width)] xl:gap-12">
        <div className="min-w-0">
          <Breadcrumbs items={breadcrumbs} />
          <MobileToc toc={toc} />
          <article className="docs-prose max-w-[48rem]">
            <h1 className="mb-5 font-display text-[clamp(2.1rem,1.4rem+2.4vw,3rem)] leading-[1.08] font-bold tracking-[-0.025em] text-balance text-ink [font-variation-settings:'opsz'_96]">
              {page.data.title}
            </h1>
            <MDX components={getMDXComponents()} />
          </article>
          <div className="mt-12 flex max-w-[48rem] flex-wrap items-center justify-between gap-3 text-[0.82rem] text-muted">
            <a
              href={editUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 font-medium text-accent hover:underline"
            >
              Oldal szerkesztése
            </a>
            {lastModified ? (
              <span>
                Utoljára frissítve:{' '}
                <time dateTime={new Date(lastModified).toISOString()}>
                  {dateFormatter.format(new Date(lastModified))}
                </time>
              </span>
            ) : null}
          </div>
          <div className="max-w-[48rem]">
            <Pagination previous={neighbours.previous} next={neighbours.next} />
          </div>
        </div>
        <aside className="hidden xl:block" aria-label="Oldal tartalma">
          <DesktopToc toc={toc}>
            <PageActions
              markdownUrl={markdownUrl(page)}
              editUrl={editUrl}
              officialUrl={page.data.official}
            />
          </DesktopToc>
        </aside>
      </div>
    </TocProvider>
  )
}

export function generateStaticParams() {
  return source.generateParams()
}

export async function generateMetadata(props: PageProps<'/docs/[[...slug]]'>): Promise<Metadata> {
  const params = await props.params
  const page = source.getPage(params.slug)
  if (!page) notFound()
  const title = docsPageTitle(page)
  const image = { url: ogImageUrl(page), ...OG_IMAGE_SIZE, alt: title }
  return {
    title,
    description: page.data.description,
    alternates: {
      canonical: page.url,
      types: { 'text/markdown': markdownUrl(page) },
    },
    openGraph: {
      type: 'article',
      locale: 'hu_HU',
      siteName: site.name,
      title,
      description: page.data.description,
      url: page.url,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: page.data.description,
      images: [image.url],
    },
  }
}
