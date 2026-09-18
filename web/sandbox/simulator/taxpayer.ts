import { AgentFault, type SimResponse } from './respond'
import type { SimulatorStore } from './store'
import { escapeXml, text, type XmlElement } from './xml'

interface TaxpayerFixture {
  readonly name: string
  readonly shortName: string
  readonly vatCode: string
  readonly countyCode: string
  readonly incorporation: 'ORGANIZATION' | 'SELF_EMPLOYED'
  readonly address: {
    readonly postalCode: string
    readonly city: string
    readonly streetName: string
    readonly publicPlaceCategory: string
    readonly number: string
    readonly floor?: string
    readonly door?: string
  }
}

export const TAXPAYER_FIXTURES: Readonly<Record<string, TaxpayerFixture>> = {
  '12345676': {
    name: 'MINTA KERESKEDELMI KORLÁTOLT FELELŐSSÉGŰ TÁRSASÁG',
    shortName: 'MINTA KERESKEDELMI KFT.',
    vatCode: '2',
    countyCode: '41',
    incorporation: 'ORGANIZATION',
    address: {
      postalCode: '1111',
      city: 'BUDAPEST',
      streetName: 'MINTA',
      publicPlaceCategory: 'UTCA',
      number: '1',
    },
  },
  '23456787': {
    name: 'MINTA WEBÁRUHÁZ KORLÁTOLT FELELŐSSÉGŰ TÁRSASÁG',
    shortName: 'MINTA WEBÁRUHÁZ KFT.',
    vatCode: '2',
    countyCode: '13',
    incorporation: 'ORGANIZATION',
    address: {
      postalCode: '2040',
      city: 'BUDAÖRS',
      streetName: 'PÉLDA',
      publicPlaceCategory: 'ÚT',
      number: '12',
      floor: '3',
      door: '2',
    },
  },
  '11111111': {
    name: 'TESZT ELEK',
    shortName: 'TESZT ELEK E.V.',
    vatCode: '1',
    countyCode: '06',
    incorporation: 'SELF_EMPLOYED',
    address: {
      postalCode: '6720',
      city: 'SZEGED',
      streetName: 'KÁRÁSZ',
      publicPlaceCategory: 'UTCA',
      number: '5',
    },
  },
}

const encoder = new TextEncoder()

function tag(name: string, value: string | undefined, prefix = ''): string {
  if (value === undefined) return ''
  return `<${prefix}${name}>${escapeXml(value)}</${prefix}${name}>`
}

function requestId(store: SimulatorStore): string {
  return `KASSZA${store.now().getTime().toString(36).toUpperCase()}`
}

export function handleQueryTaxpayer(store: SimulatorStore, root: XmlElement): SimResponse {
  const taxpayerId = text(root, 'torzsszam') ?? ''
  if (!/^\d{8}$/.test(taxpayerId)) throw new AgentFault(57, 'Hibás törzsszám formátum.')
  const fixture = TAXPAYER_FIXTURES[taxpayerId]
  const timestamp = store.now().toISOString()
  const data = fixture
    ? `  <taxpayerValidity>true</taxpayerValidity>
  <taxpayerData>
    ${tag('taxpayerName', fixture.name)}
    ${tag('taxpayerShortName', fixture.shortName)}
    <taxNumberDetail>${tag('taxpayerId', taxpayerId, 'base:')}${tag('vatCode', fixture.vatCode, 'base:')}${tag('countyCode', fixture.countyCode, 'base:')}</taxNumberDetail>
    ${tag('incorporation', fixture.incorporation)}
    <taxpayerAddressList>
      <taxpayerAddressItem>
        <taxpayerAddressType>HQ</taxpayerAddressType>
        <taxpayerAddress>${tag('countryCode', 'HU', 'base:')}${tag('postalCode', fixture.address.postalCode, 'base:')}${tag('city', fixture.address.city, 'base:')}${tag('streetName', fixture.address.streetName, 'base:')}${tag('publicPlaceCategory', fixture.address.publicPlaceCategory, 'base:')}${tag('number', fixture.address.number, 'base:')}${tag('floor', fixture.address.floor, 'base:')}${tag('door', fixture.address.door, 'base:')}</taxpayerAddress>
      </taxpayerAddressItem>
    </taxpayerAddressList>
  </taxpayerData>`
    : '  <taxpayerValidity>false</taxpayerValidity>'
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<QueryTaxpayerResponse xmlns="http://schemas.nav.gov.hu/OSA/3.0/api" xmlns:common="http://schemas.nav.gov.hu/NTCA/1.0/common" xmlns:base="http://schemas.nav.gov.hu/OSA/3.0/base">
  <common:header>
    <common:requestId>${requestId(store)}</common:requestId>
    <common:timestamp>${timestamp}</common:timestamp>
    <common:requestVersion>3.0</common:requestVersion>
    <common:headerVersion>1.0</common:headerVersion>
  </common:header>
  <common:result>
    <common:funcCode>OK</common:funcCode>
  </common:result>
  <infoDate>${timestamp}</infoDate>
${data}
</QueryTaxpayerResponse>
`
  return {
    status: 200,
    headers: [['content-type', 'application/xml; charset=UTF-8']],
    body: encoder.encode(body),
    kind: 'xml',
    effects: [
      fixture
        ? `NAV találat: ${fixture.shortName}`
        : `A NAV nem ismeri a(z) ${taxpayerId} törzsszámot (a szimulátorban csak a minta adószámok léteznek).`,
    ],
  }
}
