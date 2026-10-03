import {
  buildXmlDocument,
  el,
  optionalEl,
  type XmlNode,
  XSI_NAMESPACE,
} from '../core/xml/serialize'
import { roundMoney } from '../money/rounding'
import type { NavReceiptData, NavReportQuery } from './types'

export const NAV_RECEIPT_NAMESPACE = 'http://schemas.nav.gov.hu/NTCA/1.0/receipt'
export const NAV_SERVICE_NAMESPACE = 'http://schemas.nav.gov.hu/NTCA/2.0/common/service'
export const NAV_AUTH_NAMESPACE = 'http://schemas.nav.gov.hu/NTCA/2.0/common/authservice'
export const NAV_PAGING_NAMESPACE = 'http://schemas.nav.gov.hu/NTCA/2.0/common/paging'
export const NAV_REQUEST_VERSION = '1.0'
export const NAV_HEADER_VERSION = '1.0'
export const NAV_DEFAULT_PAGE_SIZE = 100

export interface NavRequestContext {
  readonly requestId: string
  readonly timestamp: string
}

export interface NavAuthFields {
  readonly login: string
  readonly passwordHash: string
  readonly taxPayerId: string
  readonly predecessorTaxPayerId?: string | undefined
  readonly requestSignature: string
}

function contextNode(context: NavRequestContext): XmlNode {
  return el('s:context', [
    el('s:requestId', context.requestId),
    el('s:timestamp', context.timestamp),
  ])
}

function document(
  root: string,
  children: readonly (XmlNode | undefined)[],
  namespaces: Readonly<Record<string, string>> = {},
): string {
  return buildXmlDocument({
    root,
    namespace: NAV_RECEIPT_NAMESPACE,
    namespaces: { s: NAV_SERVICE_NAMESPACE, ...namespaces },
    children,
  })
}

function amount(value: number): number {
  return roundMoney(value, 2)
}

export function buildAuthTokenXml(context: NavRequestContext, auth: NavAuthFields): string {
  return buildXmlDocument({
    root: 'AuthTokenRequest',
    namespace: NAV_RECEIPT_NAMESPACE,
    namespaces: { auth: NAV_AUTH_NAMESPACE, s: NAV_SERVICE_NAMESPACE },
    children: [
      contextNode(context),
      el('auth:auth', [
        el('auth:login', auth.login),
        el('auth:passwordHash', auth.passwordHash, { cryptoType: 'SHA-512' }),
        el('auth:taxNumber', auth.taxPayerId),
        optionalEl('auth:predecessorTaxNumber', auth.predecessorTaxPayerId),
        el('auth:requestSignature', auth.requestSignature, { cryptoType: 'SHA3-512' }),
      ]),
      el('auth:requestVersion', NAV_REQUEST_VERSION),
      el('auth:headerVersion', NAV_HEADER_VERSION),
    ],
  })
}

function exchangeRateNode(data: NavReceiptData): XmlNode {
  if (data.currency === 'HUF' || data.exchangeRate === null) {
    return el('exchangeRate', null, { 'xsi:nil': 'true' })
  }
  return el('exchangeRate', roundMoney(data.exchangeRate, 4))
}

function receiptBody(data: NavReceiptData): XmlNode[] {
  return [
    el('currency', data.currency),
    exchangeRateNode(data),
    el(
      'vatCategoryItems',
      data.vatCategories.map((row) =>
        el('vatCategory', [
          el('vat', row.vat),
          el('saleDocument', amount(row.saleDocument)),
          el('modifyingDocument', amount(row.modifyingDocument)),
        ]),
      ),
    ),
    el('total', amount(data.total)),
    el('numberOfSaleDocument', data.numberOfSaleDocument),
    el('numberOfModifyingDocument', data.numberOfModifyingDocument),
  ]
}

export function buildCreateReceiptXml(
  context: NavRequestContext,
  taxPayerId: string,
  softwareName: string,
  data: NavReceiptData,
): string {
  return document(
    'CreateReceiptRequest',
    [
      contextNode(context),
      el('taxPayerId', taxPayerId),
      el('issuingSoftware', [el('name', softwareName)]),
      el('applicableDate', data.applicableDate),
      el('serialNumber', data.serialNumber),
      ...receiptBody(data),
    ],
    { xsi: XSI_NAMESPACE },
  )
}

export function buildModifyReceiptXml(
  context: NavRequestContext,
  id: string,
  taxPayerId: string,
  softwareName: string,
  data: NavReceiptData,
): string {
  return document(
    'ModifyReceiptRequest',
    [
      contextNode(context),
      el('id', id),
      el('taxPayerId', taxPayerId),
      el('issuingSoftware', [el('name', softwareName)]),
      el('applicableDate', data.applicableDate),
      ...receiptBody(data),
    ],
    { xsi: XSI_NAMESPACE },
  )
}

export function buildReceiptListXml(
  context: NavRequestContext,
  taxPayerId: string,
  query: NavReportQuery,
): string {
  return document(
    'ReceiptListRequest',
    [
      contextNode(context),
      el('paging', [
        el('page:pageSize', query.pageSize ?? NAV_DEFAULT_PAGE_SIZE),
        el('page:page', query.page ?? 1),
      ]),
      el('ordering', [
        el('property', query.orderBy ?? 'APPLICABLE_DATE'),
        el('direction', query.direction ?? 'ASC'),
      ]),
      el('taxPayerId', taxPayerId),
      el('from', query.from),
      el('to', query.to),
    ],
    { page: NAV_PAGING_NAMESPACE },
  )
}

export function buildReceiptIdXml(
  root: 'ReceiptDetailRequest' | 'InvalidateReceiptRequest',
  context: NavRequestContext,
  id: string,
  taxPayerId: string,
): string {
  return document(root, [contextNode(context), el('id', id), el('taxPayerId', taxPayerId)])
}

export function buildCreateIssuingSoftwareXml(
  context: NavRequestContext,
  taxPayerId: string,
  name: string,
): string {
  return document('CreateIssuingSoftwareRequest', [
    contextNode(context),
    el('taxPayerId', taxPayerId),
    el('name', name),
  ])
}

export function buildIssuingSoftwareListXml(
  context: NavRequestContext,
  taxPayerId: string,
): string {
  return document('IssuingSoftwareListRequest', [
    contextNode(context),
    el('taxPayerId', taxPayerId),
  ])
}

export function buildContextOnlyXml(
  root: 'VatCategoryRequest' | 'CurrencyRequest',
  context: NavRequestContext,
): string {
  return document(root, [contextNode(context)])
}
