import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

interface PackageManifest {
  readonly version?: string
  readonly dependencies?: Readonly<Record<string, string>>
}

interface PackageLock {
  readonly packages: Readonly<Record<string, { readonly version?: string }>>
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as T
}

const rootPackage = readJson<PackageManifest>('../package.json')

describe('a weboldal kassza verziója', () => {
  test('a web/package.json a legutóbb kiadott verziót használja', () => {
    const webPackage = readJson<PackageManifest>('../web/package.json')

    expect(webPackage.dependencies?.kassza).toBe(rootPackage.version)
  })

  test('a web/package-lock.json ugyanezt a verziót rögzíti', () => {
    const webLock = readJson<PackageLock>('../web/package-lock.json')

    expect(webLock.packages['node_modules/kassza']?.version).toBe(rootPackage.version)
  })
})
