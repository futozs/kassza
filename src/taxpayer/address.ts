import { childText, findChild, type XmlElement } from '../core/xml/parse'

export type TaxpayerAddressType = 'HQ' | 'SITE' | 'BRANCH' | (string & {})

export interface NavDetailedAddress {
  readonly countryCode?: string | undefined
  readonly region?: string | undefined
  readonly postalCode?: string | undefined
  readonly city?: string | undefined
  readonly streetName?: string | undefined
  readonly publicPlaceCategory?: string | undefined
  readonly number?: string | undefined
  readonly building?: string | undefined
  readonly staircase?: string | undefined
  readonly floor?: string | undefined
  readonly door?: string | undefined
  readonly lotNumber?: string | undefined
}

export interface TaxpayerAddress {
  readonly type: TaxpayerAddressType
  readonly countryCode: string
  readonly region?: string | undefined
  readonly postalCode: string
  readonly city: string
  readonly street?: string | undefined
  readonly publicPlaceCategory?: string | undefined
  readonly number?: string | undefined
  readonly building?: string | undefined
  readonly staircase?: string | undefined
  readonly floor?: string | undefined
  readonly door?: string | undefined
  readonly lotNumber?: string | undefined
  readonly formatted: string
  readonly raw: NavDetailedAddress
}

const ROMAN_NUMERAL = /^[IVX]{1,5}\.?$/

function isShouting(value: string): boolean {
  return value === value.toUpperCase() && value !== value.toLowerCase()
}

function capitalizeWord(word: string): string {
  if (ROMAN_NUMERAL.test(word)) return word
  return word
    .split('-')
    .map((part) => part.toLowerCase().replace(/\p{L}/u, (letter) => letter.toUpperCase()))
    .join('-')
}

export function toReadableName(value: string | undefined): string | undefined {
  if (value === undefined || !isShouting(value)) return value
  return value.split(' ').map(capitalizeWord).join(' ')
}

function toLowerIfShouting(value: string | undefined): string | undefined {
  return value !== undefined && isShouting(value) ? value.toLowerCase() : value
}

function withOrdinalDot(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  return /^\d+$/.test(value) ? `${value}.` : value
}

function joinParts(parts: readonly (string | undefined)[]): string {
  return parts.filter((part): part is string => part !== undefined && part !== '').join(' ')
}

function formatAddress(address: Omit<TaxpayerAddress, 'formatted' | 'raw'>): string {
  const locality = joinParts([address.postalCode, address.city])
  const street = joinParts([
    address.street,
    address.publicPlaceCategory,
    withOrdinalDot(address.number),
    address.building === undefined ? undefined : `${address.building} ép.`,
    address.staircase === undefined ? undefined : `${withOrdinalDot(address.staircase)} lh.`,
    address.floor === undefined ? undefined : `${withOrdinalDot(address.floor)} em.`,
    address.door === undefined ? undefined : `${withOrdinalDot(address.door)} ajtó`,
  ])
  const lot = address.lotNumber === undefined ? undefined : `hrsz. ${address.lotNumber}`
  const country =
    address.countryCode === '' || address.countryCode === 'HU' ? undefined : address.countryCode
  return [locality, street, lot, country]
    .filter((part) => part !== undefined && part !== '')
    .join(', ')
}

function readDetailedAddress(element: XmlElement | undefined): NavDetailedAddress {
  return {
    countryCode: childText(element, 'countryCode'),
    region: childText(element, 'region'),
    postalCode: childText(element, 'postalCode'),
    city: childText(element, 'city'),
    streetName: childText(element, 'streetName'),
    publicPlaceCategory: childText(element, 'publicPlaceCategory'),
    number: childText(element, 'number'),
    building: childText(element, 'building'),
    staircase: childText(element, 'staircase'),
    floor: childText(element, 'floor'),
    door: childText(element, 'door'),
    lotNumber: childText(element, 'lotNumber'),
  }
}

export function parseTaxpayerAddress(item: XmlElement): TaxpayerAddress {
  const raw = readDetailedAddress(findChild(item, 'taxpayerAddress'))
  const address = {
    type: childText(item, 'taxpayerAddressType')?.toUpperCase() ?? '',
    countryCode: raw.countryCode?.toUpperCase() ?? '',
    region: toReadableName(raw.region),
    postalCode: raw.postalCode ?? '',
    city: toReadableName(raw.city) ?? '',
    street: toReadableName(raw.streetName),
    publicPlaceCategory: toLowerIfShouting(raw.publicPlaceCategory),
    number: raw.number,
    building: raw.building,
    staircase: raw.staircase,
    floor: raw.floor,
    door: raw.door,
    lotNumber: raw.lotNumber,
  }
  return { ...address, formatted: formatAddress(address), raw }
}
