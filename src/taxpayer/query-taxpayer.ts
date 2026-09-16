import type { AgentContext, RequestOptions } from '../core/context'
import { createAgentError, parseErrorCode, SzamlazzError } from '../core/errors'
import {
  type AgentResponse,
  parseResponseXml,
  throwIfAnyError,
  throwIfXmlFailure,
  unexpectedResponse,
} from '../core/response'
import {
  childBoolean,
  childText,
  findChild,
  findChildren,
  type XmlElement,
} from '../core/xml/parse'
import { buildXmlDocument, el, type XmlNode } from '../core/xml/serialize'
import { parseTaxpayerAddress, type TaxpayerAddress } from './address'

export type TaxpayerIncorporation =
  | 'ORGANIZATION'
  | 'SELF_EMPLOYED'
  | 'TAXABLE_PERSON'
  | (string & {})

export interface TaxpayerTaxNumber {
  readonly taxpayerId: string
  readonly vatCode?: string | undefined
  readonly countyCode?: string | undefined
  readonly formatted?: string | undefined
}

export interface TaxpayerInfo {
  readonly valid: boolean
  readonly name?: string | undefined
  readonly shortName?: string | undefined
  readonly taxNumber?: TaxpayerTaxNumber | undefined
  readonly address?: TaxpayerAddress | undefined
  readonly addresses: readonly TaxpayerAddress[]
  readonly incorporation?: TaxpayerIncorporation | undefined
  readonly vatGroupMembership?: string | undefined
  readonly infoDate?: string | undefined
  readonly requestId?: string | undefined
}

const TAXPAYER_NAMESPACE = 'http://www.szamlazz.hu/xmltaxpayer'
const TAXPAYER_SCHEMA_LOCATION = 'http://www.szamlazz.hu/docs/xsds/agent/xmltaxpayer.xsd'

export function toTaxpayerId(taxNumber: string): string {
  const digits =
    typeof taxNumber === 'string' ? taxNumber.replace(/[\s-]+/g, '').replace(/^HU/i, '') : ''
  if (!/^(?:\d{8}|\d{11})$/.test(digits)) {
    throw new SzamlazzError(
      `Érvénytelen adószám: "${String(taxNumber)}". Add meg a 8 jegyű törzsszámot vagy a 11 jegyű adószámot (pl. 12345678-2-42).`,
      { category: 'validation', action: 'queryTaxpayer' },
    )
  }
  return digits.slice(0, 8)
}

export function buildQueryTaxpayerXml(credentials: readonly XmlNode[], taxNumber: string): string {
  return buildXmlDocument({
    root: 'xmltaxpayer',
    namespace: TAXPAYER_NAMESPACE,
    schemaLocation: TAXPAYER_SCHEMA_LOCATION,
    children: [el('beallitasok', credentials), el('torzsszam', toTaxpayerId(taxNumber))],
  })
}

function throwIfNavError(root: XmlElement, response: AgentResponse): void {
  const result = findChild(root, 'result')
  if (childText(result, 'funcCode')?.toUpperCase() !== 'ERROR') return
  const errorCode = childText(result, 'errorCode')
  const code = parseErrorCode(errorCode)
  const message = childText(result, 'message')
  const textCode = code === undefined ? errorCode : undefined
  throw createAgentError({
    code,
    message: textCode === undefined ? message : [textCode, message].filter(Boolean).join(': '),
    action: response.action,
    httpStatus: response.status,
    rawResponse: response.text().slice(0, 2000),
  })
}

function readTaxNumber(data: XmlElement): TaxpayerTaxNumber | undefined {
  const detail = findChild(data, 'taxNumberDetail')
  const taxpayerId = childText(detail, 'taxpayerId')
  if (taxpayerId === undefined) return undefined
  const vatCode = childText(detail, 'vatCode')
  const countyCode = childText(detail, 'countyCode')
  const formatted =
    vatCode !== undefined && countyCode !== undefined
      ? `${taxpayerId}-${vatCode}-${countyCode}`
      : undefined
  return { taxpayerId, vatCode, countyCode, formatted }
}

function readAddresses(data: XmlElement): TaxpayerAddress[] {
  return findChildren(findChild(data, 'taxpayerAddressList'), 'taxpayerAddressItem').map(
    parseTaxpayerAddress,
  )
}

function readRequestId(root: XmlElement): string | undefined {
  const requestId = childText(findChild(root, 'header'), 'requestId')
  return requestId === '-' ? undefined : requestId
}

export function parseQueryTaxpayerResponse(response: AgentResponse): TaxpayerInfo {
  throwIfAnyError(response)
  const root = parseResponseXml(response)
  throwIfXmlFailure(root, response)
  if (root.name !== 'QueryTaxpayerResponse') {
    throw unexpectedResponse(response, 'QueryTaxpayerResponse XML választ vártunk.')
  }
  throwIfNavError(root, response)

  const requestId = readRequestId(root)
  const infoDate = childText(root, 'infoDate')
  const data = findChild(root, 'taxpayerData')
  const validity = childBoolean(root, 'taxpayerValidity')
  if (validity === false || data === undefined) {
    return { valid: validity === true, addresses: [], infoDate, requestId }
  }

  const addresses = readAddresses(data)
  return {
    valid: true,
    name: childText(data, 'taxpayerName'),
    shortName: childText(data, 'taxpayerShortName'),
    taxNumber: readTaxNumber(data),
    address: addresses.find((address) => address.type === 'HQ') ?? addresses[0],
    addresses,
    incorporation: childText(data, 'incorporation'),
    vatGroupMembership: childText(data, 'vatGroupMembership'),
    infoDate,
    requestId,
  }
}

export async function queryTaxpayer(
  ctx: AgentContext,
  taxNumber: string,
  options: RequestOptions = {},
): Promise<TaxpayerInfo> {
  const xml = buildQueryTaxpayerXml(ctx.credentials, taxNumber)
  return ctx.execute(
    { action: 'queryTaxpayer', xml, signal: options.signal, safeToRetry: true },
    parseQueryTaxpayerResponse,
  )
}
