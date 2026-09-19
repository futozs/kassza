import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

interface PackageManifest {
  readonly version?: string
  readonly dependencies?: Readonly<Record<string, string>>
}

interface WebVersionFile {
  readonly version?: string
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T
}

const rootPackage = readJson<PackageManifest>('../package.json')

describe('a weboldal kassza verziója', () => {
  test('a web/kassza-version.json a legutóbb kiadott verziót tartalmazza', () => {
    const webVersion = readJson<WebVersionFile>('../web/kassza-version.json')

    expect(webVersion.version).toBe(rootPackage.version)
  })

  test('a web/package.json nem rögzít kézzel karbantartott kassza függőséget', () => {
    const webPackage = readJson<PackageManifest>('../web/package.json')

    expect(webPackage.dependencies?.kassza).toBeUndefined()
  })
})
