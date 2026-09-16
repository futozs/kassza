import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const XSD_ROOT = join(import.meta.dirname, '..', '.xsd-cache')

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
  return xmllintAvailable && existsSync(join(XSD_ROOT, schema))
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
