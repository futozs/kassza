export interface HungarianAddress {
  readonly zip: string
  readonly city: string
  readonly address: string
  readonly district?: number | undefined
}

const MIN_ZIP = 1000
const MAX_ZIP = 9999
const MAX_BUDAPEST_DISTRICT = 23
const ROMAN_VALUES: Readonly<Record<string, number>> = { I: 1, V: 5, X: 10 }

export function isValidHungarianZipCode(value: string | number): boolean {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : ''
  const trimmed = text.trim()
  if (!/^\d{4}$/.test(trimmed)) return false
  const zip = Number(trimmed)
  return zip >= MIN_ZIP && zip <= MAX_ZIP
}

function romanToNumber(roman: string): number {
  let total = 0
  for (let index = 0; index < roman.length; index++) {
    const current = ROMAN_VALUES[roman.charAt(index)] ?? 0
    const next = ROMAN_VALUES[roman.charAt(index + 1)] ?? 0
    total += current < next ? -current : current
  }
  return total
}

const ROMAN_DISTRICT =
  /^([IVX]{1,5})(?:\.\s*(?:[Kk]er(?:ület)?\.?)?|\s+[Kk]er(?:ület)?\.?)(?=[\s,]|$)/
const ARABIC_DISTRICT = /^(\d{1,2})\.?\s*[Kk]er(?:ület)?\.?(?=[\s,]|$)/

interface DistrictMatch {
  readonly district: number
  readonly rest: string
}

function matchDistrict(text: string): DistrictMatch | undefined {
  const roman = ROMAN_DISTRICT.exec(text)
  const arabic = roman ? undefined : ARABIC_DISTRICT.exec(text)
  const match = roman ?? arabic
  if (!match?.[1]) return undefined
  const district = roman ? romanToNumber(match[1]) : Number(match[1])
  if (district < 1 || district > MAX_BUDAPEST_DISTRICT) return undefined
  return { district, rest: text.slice(match[0].length).replace(/^[\s,]+/, '') }
}

function normalizeInput(value: string): string {
  return value
    .replace(/[\r\n]+/g, ', ')
    .replace(/\s+/g, ' ')
    .replace(/\s*(?:,\s*)+/g, ', ')
    .replace(/^(?:HU|H)\s*-\s*/i, '')
    .replace(/,?\s*(?:Magyarország|Hungary)\.?$/i, '')
    .replace(/^[\s,]+|[\s,]+$/g, '')
}

function isBudapest(city: string): boolean {
  return city.toLowerCase() === 'budapest'
}

function splitCityAndAddress(rest: string): { city: string; address: string } | undefined {
  const comma = rest.indexOf(',')
  if (comma !== -1) {
    return { city: rest.slice(0, comma).trim(), address: rest.slice(comma + 1).trim() }
  }
  const space = rest.indexOf(' ')
  if (space === -1) return undefined
  return { city: rest.slice(0, space), address: rest.slice(space + 1).trim() }
}

function buildAddress(
  zip: string,
  cityPart: string,
  addressPart: string,
): HungarianAddress | undefined {
  let city = cityPart.trim()
  let address = addressPart.trim()
  let district: number | undefined
  const cityWithDistrict = /^(\S+)\s+(.+)$/.exec(city)
  if (cityWithDistrict?.[1] && cityWithDistrict[2] && isBudapest(cityWithDistrict[1])) {
    const match = matchDistrict(cityWithDistrict[2])
    if (match && match.rest === '') {
      city = cityWithDistrict[1]
      district = match.district
    }
  }
  if (district === undefined && isBudapest(city)) {
    const match = matchDistrict(address)
    if (match) {
      district = match.district
      address = match.rest
    }
  }
  if (!isValidHungarianZipCode(zip) || !/\p{L}/u.test(city) || address === '') return undefined
  return district === undefined ? { zip, city, address } : { zip, city, address, district }
}

export function parseHungarianAddress(value: string): HungarianAddress | undefined {
  if (typeof value !== 'string') return undefined
  const text = normalizeInput(value)
  const zipFirst = /^(\d{4}),?\s+(.+)$/.exec(text)
  if (zipFirst?.[1] && zipFirst[2]) {
    const parts = splitCityAndAddress(zipFirst[2])
    return parts ? buildAddress(zipFirst[1], parts.city, parts.address) : undefined
  }
  const zipLast = /^(.+?),\s*(\d{4})\s+([^,\d][^,]*)$/.exec(text)
  if (zipLast?.[1] && zipLast[2] && zipLast[3]) {
    return buildAddress(zipLast[2], zipLast[3], zipLast[1])
  }
  return undefined
}
