import { describe, expect, test } from 'vitest'
import {
  absoluteUrl,
  docsPageTitle,
  fromMarkdownSlugs,
  fromOgImageSlugs,
  isDocsIndex,
  markdownUrl,
  ogImageUrl,
  toMarkdownSlugs,
  toOgImageSlugs,
} from './docs-links'

const index = { slugs: [], data: { title: 'kassza' } }
const nested = { slugs: ['alapok', 'telepites'], data: { title: 'Telepítés' } }

describe('dokumentációs linkek', () => {
  test('a kezdőlap címe nem ismétli meg az oldal nevét', () => {
    expect(isDocsIndex(index)).toBe(true)
    expect(docsPageTitle(index)).toBe('Dokumentáció')
    expect(docsPageTitle(nested)).toBe('Telepítés')
  })

  test('a Markdown URL a kezdőlapnál az index.md-re mutat', () => {
    expect(markdownUrl(index)).toBe('/docs/index.md')
    expect(markdownUrl(nested)).toBe('/docs/alapok/telepites.md')
  })

  test('a Markdown slugok oda-vissza alakíthatók', () => {
    expect(toMarkdownSlugs([])).toEqual(['index'])
    expect(fromMarkdownSlugs(['index'])).toEqual([])
    expect(fromMarkdownSlugs(undefined)).toEqual([])
    expect(fromMarkdownSlugs(toMarkdownSlugs(nested.slugs))).toEqual(nested.slugs)
  })

  test('az OG kép útvonala image.png-re végződik, más végződést elutasít', () => {
    expect(ogImageUrl(index)).toBe('/og/docs/image.png')
    expect(ogImageUrl(nested)).toBe('/og/docs/alapok/telepites/image.png')
    expect(fromOgImageSlugs(toOgImageSlugs(nested.slugs))).toEqual(nested.slugs)
    expect(fromOgImageSlugs(['image.png'])).toEqual([])
    expect(fromOgImageSlugs(['alapok', 'telepites'])).toBeUndefined()
  })

  test('az abszolút URL a záró perjeltől függetlenül helyes', () => {
    expect(absoluteUrl('/docs', 'https://kassza.dev/')).toBe('https://kassza.dev/docs')
    expect(absoluteUrl('/llms.txt', 'https://kassza.dev')).toBe('https://kassza.dev/llms.txt')
  })
})
