import type { MetadataRoute } from 'next'
import { absoluteUrl } from '@/lib/docs-links'
import { site } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/api/', '/docs-md/'] }],
    sitemap: absoluteUrl('/sitemap.xml', site.url),
  }
}
