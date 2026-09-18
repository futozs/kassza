import type { Item, Node, Root } from 'fumadocs-core/page-tree'
import { flattenTree } from 'fumadocs-core/page-tree'
import { absoluteUrl, docsPageTitle, markdownUrl } from '@/lib/docs-links'

const ROOT_SECTION_TITLE = 'Bevezetés'

export interface MarkdownPage {
  readonly slugs: readonly string[]
  readonly url: string
  readonly data: {
    readonly title: string
    readonly description?: string | undefined
    readonly getText: (type: 'processed') => Promise<string>
  }
}

export interface LlmsLink {
  readonly title: string
  readonly url: string
  readonly description?: string | undefined
}

export interface LlmsSection {
  readonly title: string
  readonly links: readonly LlmsLink[]
}

export interface LlmsIndex {
  readonly title: string
  readonly summary: string
  readonly details: readonly string[]
  readonly sections: readonly LlmsSection[]
  readonly optional: readonly LlmsLink[]
}

export async function renderPageMarkdown(page: MarkdownPage, baseUrl: string): Promise<string> {
  const content = await page.data.getText('processed')
  const lines = [`# ${docsPageTitle(page)}`, '', `URL: ${absoluteUrl(page.url, baseUrl)}`]
  if (page.data.description) lines.push('', `> ${page.data.description}`)
  lines.push('', content.trim(), '')
  return lines.join('\n')
}

export function toLlmsLink(page: MarkdownPage, baseUrl: string): LlmsLink {
  return {
    title: docsPageTitle(page),
    url: absoluteUrl(markdownUrl(page), baseUrl),
    description: page.data.description,
  }
}

function nodeName(node: Node | Root, fallback: string): string {
  return typeof node.name === 'string' && node.name.trim() !== '' ? node.name : fallback
}

export function buildLlmsSections(
  tree: Root,
  resolveLink: (item: Item) => LlmsLink | undefined,
): LlmsSection[] {
  const rootLinks: LlmsLink[] = []
  const sections: LlmsSection[] = []

  for (const node of tree.children) {
    if (node.type === 'page') {
      const link = resolveLink(node)
      if (link) rootLinks.push(link)
    } else if (node.type === 'folder') {
      const links = flattenTree([node]).flatMap((item) => resolveLink(item) ?? [])
      if (links.length > 0) sections.push({ title: nodeName(node, ROOT_SECTION_TITLE), links })
    }
  }

  return rootLinks.length > 0
    ? [{ title: ROOT_SECTION_TITLE, links: rootLinks }, ...sections]
    : sections
}

export function sortByTree<T extends { readonly url: string }>(
  pages: readonly T[],
  tree: Root,
): T[] {
  const positions = new Map(flattenTree(tree.children).map((item, index) => [item.url, index]))
  const positionOf = (page: T) => positions.get(page.url) ?? Number.MAX_SAFE_INTEGER
  return [...pages].sort((left, right) => positionOf(left) - positionOf(right))
}

function escapeLinkText(text: string): string {
  return text.replace(/([[\]])/g, '\\$1')
}

function renderLink(link: LlmsLink): string {
  const base = `- [${escapeLinkText(link.title)}](${link.url})`
  const description = link.description?.trim()
  return description ? `${base}: ${description}` : base
}

function renderSection(title: string, links: readonly LlmsLink[]): string {
  return [`## ${title}`, '', ...links.map(renderLink)].join('\n')
}

export function renderLlmsIndex(index: LlmsIndex): string {
  const blocks = [
    `# ${index.title}`,
    `> ${index.summary}`,
    ...index.details,
    ...index.sections.map((section) => renderSection(section.title, section.links)),
  ]
  if (index.optional.length > 0) blocks.push(renderSection('Optional', index.optional))
  return `${blocks.join('\n\n')}\n`
}
