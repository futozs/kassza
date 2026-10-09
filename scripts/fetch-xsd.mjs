import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const BASE_URL = 'https://www.szamlazz.hu/szamla/docs/xsds/'
const ATTEMPTS = 3
const RETRY_DELAY_MS = 1500

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
  'szamla/szamla.xsd',
  'szamla/szamlavalasz.xsd',
  'szamlabe/szamlabe.xsd',
  'szamlabe/szamlabevalasz.xsd',
  'banktranz/banktranz.xsd',
  'banktranz/banktranzvalasz.xsd',
  'agent/xmlszamlavalasz.xsd',
  'nyugtavalasz/xmlnyugtavalasz.xsd',
  'nyugtasend/xmlnyugtasendvalasz.xsd',
]

const DOCUMENTED_SCHEMAS = [
  {
    path: 'agentmb/xmlcegmb.xsd',
    urls: [`${BASE_URL}agentmb/xmlcegmb.xsd`],
    page: 'https://docs.szamlazz.hu/hu/third-party-invoicing/szamla-agent/request',
    marker: 'targetNamespace="http://www.szamlazz.hu/xmlcegmb"',
  },
  {
    path: 'nyugtaarchiv/xmlnyugtaarchiv.xsd',
    urls: [`${BASE_URL}nyugtaarchiv/xmlnyugtaarchiv.xsd`],
    page: 'https://docs.szamlazz.hu/hu/penzugyi-adatkapcsolat/nyugtak',
    marker: 'targetNamespace="http://www.szamlazz.hu/xmlnyugtaarchiv"',
  },
  {
    path: 'taxpayer/xmltaxpayer.xsd',
    urls: [],
    page: 'https://docs.szamlazz.hu/hu/agent/querying_taxpayer/xml',
    marker: 'targetNamespace="http://www.szamlazz.hu/xmltaxpayer"',
  },
  {
    path: 'nyugta/nyugtavalasz.xsd',
    urls: [`${BASE_URL}nyugta/nyugtavalasz.xsd`],
    page: 'https://docs.szamlazz.hu/hu/penzugyi-adatkapcsolat/nyugtak',
    marker: 'targetNamespace="http://www.szamlazz.hu/nyugtavalasz"',
  },
]

const NAV_RECEIPT_COMMIT = '1062e52f55c477bcdd5c5ee4a512ccafa1ad63d9'
const NAV_RECEIPT_URL = `https://raw.githubusercontent.com/nav-gov-hu/eRECEIPT/${NAV_RECEIPT_COMMIT}/xsd/1.1/receipt_datareport/receipt-if-schema-v1.1.1.xsd`
const NAV_COMMON_URL =
  'https://raw.githubusercontent.com/nav-gov-hu/Common/refs/tags/common-2.0.0-rc.2/schemas/src/main/resources/xsd/hu/gov/nav/schemas/NTCA/2.0/common/'
const NAV_COMMON_SCHEMAS = ['string', 'customer', 'type', 'authservice', 'paging', 'service']
const NAV_COMMON_NAMESPACE = 'http://schemas.nav.gov.hu/NTCA/2.0/common/'

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

function isSchema(content) {
  return (
    typeof content === 'string' &&
    /<(?:xs:)?schema\b/.test(content) &&
    content.includes('targetNamespace=')
  )
}

async function fetchText(url, accept = () => true) {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        const content = await response.text()
        if (accept(content)) return content
      }
    } catch {}
    if (attempt < ATTEMPTS) await delay(RETRY_DELAY_MS * attempt)
  }
  return undefined
}

async function save(path, content) {
  const target = join(root, path)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, content)
  process.stdout.write(`Letöltve: ${path}\n`)
}

function fail(path) {
  process.stderr.write(`Nem sikerült letölteni: ${path}\n`)
  process.exitCode = 1
}

for (const schema of SCHEMAS) {
  const content = await fetchText(BASE_URL + schema, isSchema)
  if (content === undefined) fail(schema)
  else await save(schema, content)
}

for (const schema of DOCUMENTED_SCHEMAS) {
  let content
  for (const url of schema.urls) {
    content = await fetchText(url, (text) => isSchema(text) && text.includes(schema.marker))
    if (content !== undefined) break
  }
  if (content === undefined) {
    const page = await fetchText(schema.page)
    const block = page && codeBlocks(page).find((candidate) => candidate.includes(schema.marker))
    content = block ? `${block.trim()}\n` : undefined
  }
  if (content === undefined) fail(schema.path)
  else await save(schema.path, content)
}

function localCommonImports(content) {
  return content.replace(
    /<xs:import\s+namespace="http:\/\/schemas\.nav\.gov\.hu\/NTCA\/2\.0\/common\/([a-z]+)"\s*\/>/g,
    (_match, name) =>
      `<xs:import namespace="${NAV_COMMON_NAMESPACE}${name}" schemaLocation="${name}.xsd"/>`,
  )
}

const receiptSchema = await fetchText(NAV_RECEIPT_URL, isSchema)
if (receiptSchema === undefined) {
  fail('nav-receipt/receipt-if-schema-v1.1.1.xsd')
} else {
  await save(
    'nav-receipt/receipt-if-schema-v1.1.1.xsd',
    receiptSchema.replace(
      /schemaLocation="https:\/\/[^"]*\/common\/([a-z]+)\.xsd"/g,
      'schemaLocation="common/$1.xsd"',
    ),
  )
}

for (const name of NAV_COMMON_SCHEMAS) {
  const content = await fetchText(`${NAV_COMMON_URL}${name}.xsd`, isSchema)
  if (content === undefined) fail(`nav-receipt/common/${name}.xsd`)
  else await save(`nav-receipt/common/${name}.xsd`, localCommonImports(content))
}
