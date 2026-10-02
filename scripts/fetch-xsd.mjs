import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE_URL = 'https://www.szamlazz.hu/szamla/docs/xsds/'

const SCHEMAS = [
  'agent/xmlszamla.xsd',
  'agentst/xmlszamlast.xsd',
  'agentkifiz/xmlszamlakifiz.xsd',
  'agentpdf/xmlszamlapdf.xsd',
  'agentxml/xmlszamlaxml.xsd',
  'nyugtacreate/xmlnyugtacreate.xsd',
  'nyugtast/xmlnyugtast.xsd',
  'nyugtaget/xmlnyugtaget.xsd',
  'nyugtasend/xmlnyugtasend.xsd',
]

const DOCUMENTED_SCHEMAS = [
  {
    path: 'agentmb/xmlcegmb.xsd',
    urls: [`${BASE_URL}agentmb/xmlcegmb.xsd`],
    page: 'https://docs.szamlazz.hu/hu/third-party-invoicing/szamla-agent/request',
    marker: 'targetNamespace="http://www.szamlazz.hu/xmlcegmb"',
  },
]

const ENTITIES = { lt: '<', gt: '>', quot: '"', amp: '&', apos: "'", nbsp: ' ' }

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '.xsd-cache')

function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name) => {
    if (name.startsWith('#x') || name.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(name.slice(2), 16))
    }
    if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)))
    return ENTITIES[name.toLowerCase()] ?? match
  })
}

function codeBlocks(html) {
  return [...html.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi)].map(([, inner]) =>
    decodeEntities(
      inner
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/span><span class="token-line[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, ''),
    ),
  )
}

async function fetchText(url) {
  try {
    const response = await fetch(url)
    if (!response.ok) return undefined
    return await response.text()
  } catch {
    return undefined
  }
}

async function save(path, content) {
  const target = join(root, path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, content)
  process.stdout.write(`Letöltve: ${path}\n`)
}

for (const schema of SCHEMAS) {
  const content = await fetchText(BASE_URL + schema)
  if (content === undefined) {
    process.stderr.write(`Nem sikerült letölteni: ${schema}\n`)
    process.exitCode = 1
    continue
  }
  await save(schema, content)
}

for (const schema of DOCUMENTED_SCHEMAS) {
  let content
  for (const url of schema.urls) {
    content = await fetchText(url)
    if (content?.includes(schema.marker)) break
    content = undefined
  }
  if (content === undefined) {
    const page = await fetchText(schema.page)
    const block = page && codeBlocks(page).find((candidate) => candidate.includes(schema.marker))
    content = block ? `${block.trim()}\n` : undefined
  }
  if (content === undefined) {
    process.stderr.write(`Nem sikerült letölteni: ${schema.path}\n`)
    process.exitCode = 1
    continue
  }
  await save(schema.path, content)
}
