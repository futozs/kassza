import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const XSD_ROOT: string = join(import.meta.dirname, '..', '.xsd-cache')

export type SchemaPath =
  | 'agent/xmlszamla.xsd'
  | 'agentst/xmlszamlast.xsd'
  | 'agentkifiz/xmlszamlakifiz.xsd'
  | 'agentpdf/xmlszamlapdf.xsd'
  | 'agentxml/xmlszamlaxml.xsd'
  | 'nyugtacreate/xmlnyugtacreate.xsd'
  | 'nyugtast/xmlnyugtast.xsd'
  | 'nyugtaget/xmlnyugtaget.xsd'
  | 'nyugtasend/xmlnyugtasend.xsd'
  | 'agentmb/xmlcegmb.xsd'
  | 'nav-receipt/receipt-if-schema-v1.1.1.xsd'
  | 'szamla/szamla.xsd'
  | 'szamla/szamlavalasz.xsd'
  | 'szamlabe/szamlabe.xsd'
  | 'szamlabe/szamlabevalasz.xsd'
  | 'banktranz/banktranz.xsd'
  | 'banktranz/banktranzvalasz.xsd'
  | 'nyugtaarchiv/xmlnyugtaarchiv.xsd'
  | 'nyugta/nyugtavalasz.xsd'
  | 'agent/xmlszamlavalasz.xsd'
  | 'nyugtavalasz/xmlnyugtavalasz.xsd'
  | 'nyugtasend/xmlnyugtasendvalasz.xsd'
  | 'taxpayer/xmltaxpayer.xsd'

function hasXmllint(): boolean {
  try {
    execFileSync('xmllint', ['--version'], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const xmllintAvailable = hasXmllint()

export function canValidateXsd(schema: SchemaPath): boolean {
  const available = xmllintAvailable && existsSync(join(XSD_ROOT, schema))
  if (!available && process.env.KASSZA_REQUIRE_XSD === '1') {
    throw new Error(
      `Szigorú mód (KASSZA_REQUIRE_XSD=1): a(z) ${schema} séma vagy az xmllint hiányzik, az XSD-teszt nem maradhat ki. Futtasd: npm run xsd:fetch`,
    )
  }
  return available
}

export function validateAgainstXsd(xml: string, schema: SchemaPath): string[] {
  const directory = mkdtempSync(join(tmpdir(), 'szamlazz-xsd-'))
  try {
    const file = join(directory, 'request.xml')
    writeFileSync(file, xml)
    const result = spawnSync('xmllint', ['--noout', '--schema', join(XSD_ROOT, schema), file], {
      encoding: 'utf8',
    })
    if (result.status === 0) return []
    return result.stderr
      .split('\n')
      .filter(
        (line) =>
          line.trim() !== '' && !line.includes('validates') && !line.includes('fails to validate'),
      )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
