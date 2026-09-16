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

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '.xsd-cache')

for (const schema of SCHEMAS) {
  const response = await fetch(BASE_URL + schema)
  if (!response.ok) {
    process.stderr.write(`Nem sikerült letölteni: ${schema} (HTTP ${response.status})\n`)
    process.exitCode = 1
    continue
  }
  const target = join(root, schema)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, await response.text())
  process.stdout.write(`Letöltve: ${schema}\n`)
}
