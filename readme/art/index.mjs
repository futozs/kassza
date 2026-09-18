import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { loadSiteData } from '../site-data.mjs'
import { buttonDocuments, navDocuments } from './designs/buttons.mjs'
import { heroDocument } from './designs/hero.mjs'
import { wordmarkDocument } from './designs/lockup.mjs'
import { matrixDocument } from './designs/matrix.mjs'
import { showcaseDocument } from './designs/showcase.mjs'
import { loadFonts } from './fonts.mjs'
import { sampleInvoiceXml } from './sample.mjs'
import { themes } from './theme.mjs'
import { createTypesetter } from './typeset.mjs'

const README_ASSETS = new URL('../assets/', import.meta.url)
const BRAND_ASSETS = new URL('../../assets/', import.meta.url)
const CONFIG = new URL('../config.json', import.meta.url)

const THEMED_DESIGNS = [
  (context) => [{ name: 'hero', svg: heroDocument(context) }],
  navDocuments,
  buttonDocuments,
  (context) => [{ name: 'showcase', svg: showcaseDocument(context) }],
  (context) => [{ name: 'matrix', svg: matrixDocument(context) }],
]

function kilobytes(text) {
  return `${(Buffer.byteLength(text) / 1024).toFixed(1)} kB`
}

const [fonts, site, config, sampleXml] = await Promise.all([
  loadFonts(),
  loadSiteData(),
  readFile(CONFIG, 'utf8').then(JSON.parse),
  sampleInvoiceXml(),
])
const type = createTypesetter(fonts)
const context = { type, site, config, sampleXml }

await mkdir(README_ASSETS, { recursive: true })
const written = []
for (const design of THEMED_DESIGNS) {
  for (const theme of Object.values(themes)) {
    for (const { name, svg } of design({ ...context, theme })) {
      const file = `${name}-${theme.name}.svg`
      await writeFile(new URL(file, README_ASSETS), svg)
      written.push([`readme/assets/${file}`, svg])
    }
  }
}
const wordmark = wordmarkDocument(context)
await writeFile(new URL('logo-wordmark.svg', BRAND_ASSETS), wordmark)
written.push(['assets/logo-wordmark.svg', wordmark])

for (const [path, svg] of written) console.log(`${path.padEnd(44)} ${kilobytes(svg)}`)
