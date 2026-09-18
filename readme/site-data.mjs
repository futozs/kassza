import { readdir, readFile } from 'node:fs/promises'

const ROOT = new URL('../', import.meta.url)
const DOCS_DIR = new URL('web/content/docs/', ROOT)
const CATALOG = new URL('web/sandbox/examples/catalog.ts', ROOT)
const RECIPES_META = new URL('web/content/docs/receptek/meta.json', ROOT)

function frontmatterValue(source, key) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source)?.[1] ?? ''
  const line = block.split(/\r?\n/).find((item) => item.startsWith(`${key}:`))
  return line
    ?.slice(key.length + 1)
    .trim()
    .replace(/^(['"])(.*)\1$/, '$2')
}

function pageSlug(file) {
  return file
    .replaceAll('\\', '/')
    .replace(/\.mdx$/, '')
    .replace(/(^|\/)index$/, '')
}

async function loadDocsPages() {
  const files = await readdir(DOCS_DIR, { recursive: true })
  const pages = new Map()
  for (const file of files.filter((item) => item.endsWith('.mdx')).sort()) {
    const source = await readFile(new URL(file, DOCS_DIR), 'utf8')
    const slug = pageSlug(file)
    const title = frontmatterValue(source, 'title')
    if (!title) throw new Error(`A(z) web/content/docs/${file} oldalnak nincs title mezője.`)
    pages.set(slug, { slug, title, description: frontmatterValue(source, 'description') ?? '' })
  }
  return pages
}

async function loadSandboxExamples() {
  const source = await readFile(CATALOG, 'utf8')
  const pattern = /slug: '([^']+)',\s*title: '([^']+)',\s*group: '([^']+)'/g
  const examples = [...source.matchAll(pattern)].map(([, slug, title, group]) => ({
    slug,
    title,
    group,
  }))
  const declared = source.match(/\bslug: '/g)?.length ?? 0
  if (examples.length !== declared) {
    throw new Error(
      `A sandbox katalógusból ${declared} példából csak ${examples.length} olvasható be (web/sandbox/examples/catalog.ts).`,
    )
  }
  return examples
}

async function loadRecipes(pages) {
  const meta = JSON.parse(await readFile(RECIPES_META, 'utf8'))
  return meta.pages.map((name) => {
    const page = pages.get(`receptek/${name}`)
    if (!page) throw new Error(`A receptek/meta.json ismeretlen oldalra hivatkozik: ${name}`)
    return page
  })
}

export async function loadSiteData() {
  const pages = await loadDocsPages()
  const [examples, recipes] = await Promise.all([loadSandboxExamples(), loadRecipes(pages)])
  return { pages, examples, recipes }
}
