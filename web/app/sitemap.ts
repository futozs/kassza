import type { MetadataRoute } from 'next'
import { absoluteUrl, isDocsIndex } from '@/lib/docs-links'
import { site } from '@/lib/site'
import { source } from '@/lib/source'

export const dynamic = 'force-static'

export default function sitemap(): MetadataRoute.Sitemap {
  const docs: MetadataRoute.Sitemap = source.getPages().map((page) => {
    const lastModified = page.data.lastModified
    return {
      url: absoluteUrl(page.url, site.url),
      changeFrequency: 'weekly',
      priority: isDocsIndex(page) ? 0.9 : 0.7,
      ...(lastModified ? { lastModified: new Date(lastModified) } : {}),
    }
  })

  return [
    { url: absoluteUrl('/', site.url), changeFrequency: 'weekly', priority: 1 },
    { url: absoluteUrl('/sandbox', site.url), changeFrequency: 'monthly', priority: 0.8 },
    ...docs,
  ]
}
