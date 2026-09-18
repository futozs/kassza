import type { Item, Root } from 'fumadocs-core/page-tree'
import { describe, expect, test } from 'vitest'
import {
  buildLlmsSections,
  type LlmsLink,
  type MarkdownPage,
  renderLlmsIndex,
  renderPageMarkdown,
  sortByTree,
} from './llms'

const BASE_URL = 'https://kassza.dev'

function page(slugs: string[], title: string, description?: string): MarkdownPage {
  return {
    slugs,
    url: slugs.length === 0 ? '/docs' : `/docs/${slugs.join('/')}`,
    data: {
      title,
      description,
      getText: async () => `## ${title} tartalma\n\nSzöveg.\n`,
    },
  }
}

const item = (url: string, name: string): Item => ({ type: 'page', url, name })

const tree: Root = {
  name: 'kassza',
  children: [
    item('/docs', 'kassza'),
    {
      type: 'folder',
      name: 'Alapok',
      children: [
        item('/docs/alapok/telepites', 'Telepítés'),
        { type: 'separator', name: 'Haladó' },
      ],
    },
    { type: 'folder', name: 'Üres', children: [] },
    item('/docs/receptek', 'Receptek'),
  ],
}

describe('llms.txt és Markdown kimenet', () => {
  test('az oldal Markdownja címet, abszolút URL-t és leírást kap', async () => {
    const markdown = await renderPageMarkdown(
      page(['alapok', 'telepites'], 'Telepítés', 'Így telepíted.'),
      BASE_URL,
    )

    expect(markdown).toBe(
      '# Telepítés\n\nURL: https://kassza.dev/docs/alapok/telepites\n\n> Így telepíted.\n\n## Telepítés tartalma\n\nSzöveg.\n',
    )
  })

  test('leírás nélkül nincs üres idézetblokk, a kezdőlap címe Dokumentáció', async () => {
    const markdown = await renderPageMarkdown(page([], 'kassza'), BASE_URL)

    expect(markdown.startsWith('# Dokumentáció\n\nURL: https://kassza.dev/docs\n\n## ')).toBe(true)
    expect(markdown).not.toContain('>')
  })

  test('a gyökérszintű oldalak a Bevezetés szekcióba kerülnek, az üres mappa kimarad', () => {
    const resolve = (node: Item): LlmsLink => ({ title: String(node.name), url: `${node.url}.md` })

    expect(buildLlmsSections(tree, resolve)).toEqual([
      {
        title: 'Bevezetés',
        links: [
          { title: 'kassza', url: '/docs.md' },
          { title: 'Receptek', url: '/docs/receptek.md' },
        ],
      },
      { title: 'Alapok', links: [{ title: 'Telepítés', url: '/docs/alapok/telepites.md' }] },
    ])
  })

  test('a fel nem oldható oldalak kimaradnak a listából', () => {
    expect(buildLlmsSections(tree, () => undefined)).toEqual([])
  })

  test('az oldalak a navigáció sorrendjét követik, az ismeretlenek a végére kerülnek', () => {
    const pages = [{ url: '/docs/ismeretlen' }, { url: '/docs/receptek' }, { url: '/docs' }]

    expect(sortByTree(pages, tree).map((entry) => entry.url)).toEqual([
      '/docs',
      '/docs/receptek',
      '/docs/ismeretlen',
    ])
  })

  test('az llms.txt a specifikáció szerinti szerkezetet adja', () => {
    const output = renderLlmsIndex({
      title: 'kassza',
      summary: 'TypeScript kliens.',
      details: ['Részletek.'],
      sections: [
        {
          title: 'Alapok',
          links: [
            {
              title: 'Telepítés [npm]',
              url: 'https://kassza.dev/docs/a.md',
              description: ' Leírás ',
            },
            { title: 'Hibák', url: 'https://kassza.dev/docs/b.md' },
          ],
        },
      ],
      optional: [{ title: 'GitHub', url: 'https://github.com/futozs/kassza' }],
    })

    expect(output).toBe(
      [
        '# kassza',
        '',
        '> TypeScript kliens.',
        '',
        'Részletek.',
        '',
        '## Alapok',
        '',
        '- [Telepítés \\[npm\\]](https://kassza.dev/docs/a.md): Leírás',
        '- [Hibák](https://kassza.dev/docs/b.md)',
        '',
        '## Optional',
        '',
        '- [GitHub](https://github.com/futozs/kassza)',
        '',
      ].join('\n'),
    )
  })
})
