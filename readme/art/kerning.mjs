const EXTENSION_LOOKUP = 9
const PAIR_ADJUSTMENT = 2
const X_PLACEMENT = 0x0001
const Y_PLACEMENT = 0x0002
const X_ADVANCE = 0x0004

function createReader(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return {
    u16: (offset) => view.getUint16(offset),
    i16: (offset) => view.getInt16(offset),
    u32: (offset) => view.getUint32(offset),
    tag: (offset) => String.fromCharCode(...bytes.subarray(offset, offset + 4)),
  }
}

function findTable(read, tag) {
  const tableCount = read.u16(4)
  for (let index = 0; index < tableCount; index++) {
    const record = 12 + index * 16
    if (read.tag(record) === tag) return read.u32(record + 8)
  }
  return null
}

function coverageIndex(read, coverage, glyph) {
  const format = read.u16(coverage)
  const count = read.u16(coverage + 2)
  if (format === 1) {
    let low = 0
    let high = count - 1
    while (low <= high) {
      const middle = (low + high) >> 1
      const value = read.u16(coverage + 4 + middle * 2)
      if (value === glyph) return middle
      if (value < glyph) low = middle + 1
      else high = middle - 1
    }
    return -1
  }
  for (let index = 0; index < count; index++) {
    const range = coverage + 4 + index * 6
    const start = read.u16(range)
    if (glyph >= start && glyph <= read.u16(range + 2)) return read.u16(range + 4) + glyph - start
  }
  return -1
}

function classOf(read, classDef, glyph) {
  const format = read.u16(classDef)
  if (format === 1) {
    const start = read.u16(classDef + 2)
    const count = read.u16(classDef + 4)
    if (glyph < start || glyph >= start + count) return 0
    return read.u16(classDef + 6 + (glyph - start) * 2)
  }
  const count = read.u16(classDef + 2)
  for (let index = 0; index < count; index++) {
    const range = classDef + 4 + index * 6
    if (glyph >= read.u16(range) && glyph <= read.u16(range + 2)) return read.u16(range + 4)
  }
  return 0
}

function valueRecordSize(format) {
  let size = 0
  for (let bit = 0; bit < 8; bit++) if (format & (1 << bit)) size += 2
  return size
}

function xAdvance(read, record, format) {
  if (!(format & X_ADVANCE)) return 0
  let offset = record
  if (format & X_PLACEMENT) offset += 2
  if (format & Y_PLACEMENT) offset += 2
  return read.i16(offset)
}

function specificPairValue(read, subtable, index, right, formats) {
  const pairSet = subtable + read.u16(subtable + 10 + index * 2)
  const recordSize = 2 + formats.size1 + formats.size2
  let low = 0
  let high = read.u16(pairSet) - 1
  while (low <= high) {
    const middle = (low + high) >> 1
    const record = pairSet + 2 + middle * recordSize
    const second = read.u16(record)
    if (second === right) return xAdvance(read, record + 2, formats.format1)
    if (second < right) low = middle + 1
    else high = middle - 1
  }
  return null
}

function classPairValue(read, subtable, left, right, formats) {
  const class1 = classOf(read, subtable + read.u16(subtable + 8), left)
  const class2 = classOf(read, subtable + read.u16(subtable + 10), right)
  const class1Count = read.u16(subtable + 12)
  const class2Count = read.u16(subtable + 14)
  if (class1 >= class1Count || class2 >= class2Count) return null
  const record = subtable + 16 + (class1 * class2Count + class2) * (formats.size1 + formats.size2)
  return xAdvance(read, record, formats.format1)
}

function pairValue(read, subtable, left, right) {
  const index = coverageIndex(read, subtable + read.u16(subtable + 2), left)
  if (index < 0) return null
  const format1 = read.u16(subtable + 4)
  const format2 = read.u16(subtable + 6)
  const formats = { format1, size1: valueRecordSize(format1), size2: valueRecordSize(format2) }
  return read.u16(subtable) === 1
    ? specificPairValue(read, subtable, index, right, formats)
    : classPairValue(read, subtable, left, right, formats)
}

function kernLookupIndexes(read, gpos) {
  const featureList = gpos + read.u16(gpos + 6)
  const indexes = new Set()
  const featureCount = read.u16(featureList)
  for (let index = 0; index < featureCount; index++) {
    const record = featureList + 2 + index * 6
    if (read.tag(record) !== 'kern') continue
    const feature = featureList + read.u16(record + 4)
    const lookupCount = read.u16(feature + 2)
    for (let item = 0; item < lookupCount; item++) indexes.add(read.u16(feature + 4 + item * 2))
  }
  return [...indexes].sort((a, b) => a - b)
}

function pairSubtables(read, lookupList, lookupIndex) {
  const lookup = lookupList + read.u16(lookupList + 2 + lookupIndex * 2)
  const lookupType = read.u16(lookup)
  const subtables = []
  for (let index = 0; index < read.u16(lookup + 4); index++) {
    let subtable = lookup + read.u16(lookup + 6 + index * 2)
    let subtableType = lookupType
    if (lookupType === EXTENSION_LOOKUP) {
      subtableType = read.u16(subtable + 2)
      subtable += read.u32(subtable + 4)
    }
    if (subtableType === PAIR_ADJUSTMENT) subtables.push(subtable)
  }
  return subtables
}

export function createKerning(bytes) {
  const read = createReader(bytes)
  const gpos = findTable(read, 'GPOS')
  if (gpos === null) return () => 0
  const lookupList = gpos + read.u16(gpos + 8)
  const lookups = kernLookupIndexes(read, gpos).map((index) =>
    pairSubtables(read, lookupList, index),
  )
  const cache = new Map()
  return (left, right) => {
    const key = left * 65536 + right
    const cached = cache.get(key)
    if (cached !== undefined) return cached
    let total = 0
    for (const subtables of lookups) {
      for (const subtable of subtables) {
        const value = pairValue(read, subtable, left, right)
        if (value !== null) {
          total += value
          break
        }
      }
    }
    cache.set(key, total)
    return total
  }
}
