import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  compareSnapshots,
  consistencyProblems,
  ipv4Addresses,
  mainText,
  renderReport,
  sha256,
  sourceErrorCodes,
  sourceIps,
  tableCodes,
} from './drift-core.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const lockPath = join(root, 'scripts', 'drift.lock.json')
const update = process.argv.includes('--update')
const XSD_BASE = 'https://www.szamlazz.hu/szamla/docs/xsds/'
const XSDS = [
  'agent/xmlszamla.xsd',
  'agentst/xmlszamlast.xsd',
  'agentkifiz/xmlszamlakifiz.xsd',
  'agentpdf/xmlszamlapdf.xsd',
  'agentxml/xmlszamlaxml.xsd',
  'nyugtacreate/xmlnyugtacreate.xsd',
  'nyugtast/xmlnyugtast.xsd',
  'nyugtaget/xmlnyugtaget.xsd',
  'nyugtasend/xmlnyugtasend.xsd',
  'agent/xmlszamlavalasz.xsd',
  'nyugtavalasz/xmlnyugtavalasz.xsd',
  'nyugtaarchiv/xmlnyugtaarchiv.xsd',
]
const PAGES = {
  errorHandling: 'https://docs.szamlazz.hu/hu/agent/basics/error-handling',
  ipn: 'https://docs.szamlazz.hu/hu/agent/credit_entry/other',
  navReceipts:
    'https://docs.szamlazz.hu/hu/agent/generating_receipt/settings_and_rules/nav-data-reporting',
  phpChangelog: 'https://docs.szamlazz.hu/hu/php/changelog',
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'kassza-drift-watcher' } })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.text()
}

async function collect() {
  const snapshot = {}
  const errors = []
  const attempt = async (name, run) => {
    try {
      snapshot[name] = await run()
    } catch (error) {
      errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  for (const path of XSDS)
    await attempt(`xsd:${path}`, async () => sha256(await fetchText(`${XSD_BASE}${path}`)))
  const pages = { errorPage: '', ipnPage: '' }
  await attempt('docs:error-codes', async () => {
    pages.errorPage = await fetchText(PAGES.errorHandling)
    return tableCodes(pages.errorPage)
  })
  await attempt('docs:ipn-ips', async () => {
    pages.ipnPage = await fetchText(PAGES.ipn)
    return ipv4Addresses(mainText(pages.ipnPage))
  })
  await attempt('docs:nav-receipts', async () =>
    sha256(mainText(await fetchText(PAGES.navReceipts))),
  )
  await attempt('docs:php-changelog', async () =>
    sha256(mainText(await fetchText(PAGES.phpChangelog))),
  )
  await attempt('nav:eRECEIPT', async () => {
    const response = await fetch(
      'https://api.github.com/repos/nav-gov-hu/eRECEIPT/commits?per_page=1',
      {
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'kassza-drift-watcher' },
      },
    )
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return (await response.json())[0]?.sha ?? 'ismeretlen'
  })
  return { snapshot, errors, errorPage: pages.errorPage, ipnPage: pages.ipnPage }
}

const { snapshot, errors, errorPage, ipnPage } = await collect()
if (update) {
  writeFileSync(lockPath, `${JSON.stringify(snapshot, null, 2)}\n`)
  console.log(`A zárfájl frissítve: ${Object.keys(snapshot).length} forrás.`)
  if (errors.length > 0) console.error(`Nem elérhető források:\n${errors.join('\n')}`)
  process.exit(errors.length > 0 ? 1 : 0)
}
const locked = JSON.parse(readFileSync(lockPath, 'utf8'))
const changes = compareSnapshots(locked, snapshot)
const problems = consistencyProblems({
  documentedCodes: errorPage ? tableCodes(errorPage) : [],
  knownCodes: sourceErrorCodes(readFileSync(join(root, 'src/core/errors.ts'), 'utf8')),
  pageIps: ipnPage
    ? ipv4Addresses(mainText(ipnPage))
    : sourceIps(readFileSync(join(root, 'src/ipn/ip.ts'), 'utf8')),
  knownIps: sourceIps(readFileSync(join(root, 'src/ipn/ip.ts'), 'utf8')),
})
const report = renderReport(changes, problems)
process.stdout.write(report)
if (errors.length > 0) console.error(`\nNem elérhető források:\n${errors.join('\n')}`)
if (process.env.DRIFT_REPORT_FILE) writeFileSync(process.env.DRIFT_REPORT_FILE, report)
process.exit(changes.length > 0 || problems.length > 0 ? 1 : 0)
