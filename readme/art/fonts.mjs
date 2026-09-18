import { mkdir, readFile, writeFile } from 'node:fs/promises'
import opentype from 'opentype.js'
import { createKerning } from './kerning.mjs'

const CACHE_DIR = new URL('../../node_modules/.cache/kassza-readme-art/', import.meta.url)
const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com/css2'
const TTF_SOURCE = /src:\s*url\((.+?)\)\s*format\('truetype'\)/

export const FONT_SPECS = {
  display: { family: 'Bricolage Grotesque', axes: 'opsz,wght', values: '96,800' },
  heading: { family: 'Bricolage Grotesque', axes: 'opsz,wght', values: '36,700' },
  sans: { family: 'Geist', axes: 'wght', values: '400' },
  sansMedium: { family: 'Geist', axes: 'wght', values: '500' },
  sansSemibold: { family: 'Geist', axes: 'wght', values: '600' },
  mono: { family: 'Geist Mono', axes: 'wght', values: '400' },
  monoMedium: { family: 'Geist Mono', axes: 'wght', values: '500' },
  monoBold: { family: 'Geist Mono', axes: 'wght', values: '700' },
}

function cacheFileName(spec) {
  return `${spec.family}-${spec.axes}-${spec.values}.ttf`.replace(/[^\w.-]+/g, '-')
}

async function download(spec) {
  const query = new URLSearchParams({ family: `${spec.family}:${spec.axes}@${spec.values}` })
  const cssResponse = await fetch(`${GOOGLE_FONTS_CSS}?${query}`)
  if (!cssResponse.ok) {
    throw new Error(
      `A(z) ${spec.family} betűtípus CSS-e nem tölthető le (HTTP ${cssResponse.status}).`,
    )
  }
  const fontUrl = TTF_SOURCE.exec(await cssResponse.text())?.[1]
  if (!fontUrl) throw new Error(`A(z) ${spec.family} betűtípushoz nem érkezett TTF forrás.`)
  const fontResponse = await fetch(fontUrl)
  if (!fontResponse.ok) {
    throw new Error(
      `A(z) ${spec.family} betűtípus fájlja nem tölthető le (HTTP ${fontResponse.status}).`,
    )
  }
  return new Uint8Array(await fontResponse.arrayBuffer())
}

async function readCachedOrDownload(spec) {
  const cached = new URL(cacheFileName(spec), CACHE_DIR)
  try {
    return await readFile(cached)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  const bytes = await download(spec)
  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(cached, bytes)
  return bytes
}

async function loadFont(spec) {
  const bytes = await readCachedOrDownload(spec)
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
  return { font: opentype.parse(buffer), kern: createKerning(new Uint8Array(buffer)) }
}

export async function loadFonts() {
  const entries = await Promise.all(
    Object.entries(FONT_SPECS).map(async ([key, spec]) => [key, await loadFont(spec)]),
  )
  return Object.fromEntries(entries)
}
