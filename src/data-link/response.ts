import { buildXmlDocument, el, optionalEl, type XmlNode } from '../core/xml/serialize'
import type { DataLinkPush, DataLinkPushKind } from './push'

export type DataLinkKeyError = 'KEY_ERR' | 'KEY_DEL'

export interface DataLinkAcknowledgement {
  readonly registrationNumber?: string | undefined
  readonly keyError?: DataLinkKeyError | undefined
}

export const DATA_LINK_RESPONSE_ROOTS: Readonly<
  Record<DataLinkPushKind, { readonly root: string; readonly namespace: string }>
> = {
  invoice: { root: 'szamlavalasz', namespace: 'http://www.szamlazz.hu/szamlavalasz' },
  'incoming-invoice': {
    root: 'szamlabevalasz',
    namespace: 'http://www.szamlazz.hu/szamlabevalasz',
  },
  'bank-transaction': {
    root: 'banktranzvalasz',
    namespace: 'http://www.szamlazz.hu/banktranzvalasz',
  },
  receipts: { root: 'nyugtavalasz', namespace: 'http://www.szamlazz.hu/nyugtavalasz' },
}

function keyErrorOf(acknowledgement: DataLinkAcknowledgement): DataLinkKeyError | undefined {
  const keyError = acknowledgement.keyError
  if (keyError === undefined || keyError === 'KEY_ERR' || keyError === 'KEY_DEL') return keyError
  throw new TypeError(
    `Ismeretlen kulcshiba: ${String(keyError)}. Csak KEY_ERR vagy KEY_DEL adható.`,
  )
}

function registrationNumberOf(push: DataLinkPush, value: unknown): string | undefined {
  if (value !== undefined && typeof value !== 'string') {
    throw new TypeError('Az iktatószám (registrationNumber) szöveg legyen.')
  }
  const registrationNumber = value?.trim()
  if (!registrationNumber) return undefined
  if (push.kind !== 'invoice' && push.kind !== 'incoming-invoice') {
    throw new TypeError(
      'Iktatószámot csak számla (kimenő vagy bejövő) válaszában lehet visszaadni.',
    )
  }
  return registrationNumber
}

export function dataLinkResponseXml(
  push: DataLinkPush,
  acknowledgement: DataLinkAcknowledgement = {},
): string {
  const target = DATA_LINK_RESPONSE_ROOTS[push.kind]
  const keyError = keyErrorOf(acknowledgement)
  const registrationNumber = registrationNumberOf(push, acknowledgement.registrationNumber)
  const children: XmlNode[] = []
  if (push.kind === 'invoice' || push.kind === 'incoming-invoice') {
    children.push(el('alap', [el('id', push.id), optionalEl('iktatoszam', registrationNumber)]))
  }
  if (keyError !== undefined) children.push(el('hibakod', keyError))
  return buildXmlDocument({ root: target.root, namespace: target.namespace, children })
}

export function dataLinkResponse(
  push: DataLinkPush,
  acknowledgement: DataLinkAcknowledgement = {},
): Response {
  return new Response(dataLinkResponseXml(push, acknowledgement), {
    status: 200,
    headers: { 'content-type': 'application/xml; charset=UTF-8' },
  })
}
