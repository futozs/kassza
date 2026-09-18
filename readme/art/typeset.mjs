import { num } from './svg.mjs'

function toRuns(content) {
  return typeof content === 'string' ? [{ text: content }] : content
}

export function createTypesetter(fonts) {
  function fontEntry(key) {
    const entry = fonts[key]
    if (!entry) throw new Error(`Ismeretlen betűtípus: ${key}`)
    return entry
  }

  function shape(fontKey, content, tracking) {
    const { font, kern } = fontEntry(fontKey)
    const trackingUnits = tracking * font.unitsPerEm
    const glyphs = []
    let cursor = 0
    let previous = null
    for (const run of toRuns(content)) {
      for (const char of run.text) {
        const glyph = font.charToGlyph(char)
        if (glyph.index === 0) {
          throw new Error(`A(z) „${char}” karakter hiányzik a(z) ${fontKey} betűtípusból.`)
        }
        if (previous) cursor += kern(previous.index, glyph.index) + trackingUnits
        glyphs.push({ glyph, x: cursor, fill: run.fill })
        cursor += glyph.advanceWidth
        previous = glyph
      }
    }
    return { glyphs, width: cursor, unitsPerEm: font.unitsPerEm }
  }

  function measure(content, { font, size, tracking = 0 }) {
    const shaped = shape(font, content, tracking)
    return (shaped.width * size) / shaped.unitsPerEm
  }

  function bounds(content, { font, size, tracking = 0 }) {
    const shaped = shape(font, content, tracking)
    const scale = size / shaped.unitsPerEm
    let left = Number.POSITIVE_INFINITY
    let right = Number.NEGATIVE_INFINITY
    let top = 0
    let bottom = 0
    for (const item of shaped.glyphs) {
      const box = item.glyph.getBoundingBox()
      if (box.x1 === box.x2) continue
      left = Math.min(left, (item.x + box.x1) * scale)
      right = Math.max(right, (item.x + box.x2) * scale)
      top = Math.min(top, -box.y2 * scale)
      bottom = Math.max(bottom, -box.y1 * scale)
    }
    return { left, right, top, bottom, width: right - left, advance: shaped.width * scale }
  }

  function metrics(fontKey, size) {
    const { font } = fontEntry(fontKey)
    const scale = size / font.unitsPerEm
    return {
      capHeight: font.tables.os2.sCapHeight * scale,
      xHeight: font.tables.os2.sxHeight * scale,
      ascender: font.ascender * scale,
      descender: font.descender * scale,
    }
  }

  function wrap(text, maxWidth, options) {
    const lines = []
    let line = ''
    for (const word of text.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word
      if (line && measure(candidate, options) > maxWidth) {
        lines.push(line)
        line = word
      } else {
        line = candidate
      }
    }
    if (line) lines.push(line)
    return lines
  }

  function scope() {
    const ids = new Map()
    const definitions = []

    function glyphId(fontKey, glyph) {
      const key = `${fontKey}:${glyph.index}`
      if (ids.has(key)) return ids.get(key)
      const { font } = fontEntry(fontKey)
      const path = glyph.getPath(0, 0, font.unitsPerEm).toPathData(0)
      const id = path ? `t${ids.size.toString(36)}` : null
      ids.set(key, id)
      if (id) definitions.push(`<path id="${id}" d="${path}"/>`)
      return id
    }

    function text(content, options) {
      const { font, size, x = 0, y = 0, anchor = 'start', fill, tracking = 0, extra = '' } = options
      const shaped = shape(font, content, tracking)
      const scale = size / shaped.unitsPerEm
      const width = shaped.width * scale
      const left = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x
      const uses = []
      for (const item of shaped.glyphs) {
        const id = glyphId(font, item.glyph)
        if (!id) continue
        const color = item.fill && item.fill !== fill ? ` fill="${item.fill}"` : ''
        uses.push(`<use href="#${id}" x="${Math.round(item.x)}"${color}/>`)
      }
      const transform = `translate(${num(left)} ${num(y)}) scale(${num(scale, 5)})`
      const fillAttribute = fill ? ` fill="${fill}"` : ''
      return `<g transform="${transform}"${fillAttribute}${extra}>${uses.join('')}</g>`
    }

    function defs() {
      return definitions.join('')
    }

    return { text, defs }
  }

  return { measure, bounds, metrics, wrap, scope }
}
