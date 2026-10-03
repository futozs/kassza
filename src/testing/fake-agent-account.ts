import { childText, findChild } from '../core/xml/parse'
import { buildXmlDocument, el, optionalEl, type XmlNode } from '../core/xml/serialize'
import {
  encodeHeaderValue,
  type FakeAgentResponse,
  textResponse,
  xmlResponse,
} from './fake-agent-http'
import { xmlFailure } from './fake-agent-items'
import type { FakeAgentCredentials, FakeAgentRequest } from './fake-agent-request'
import {
  agentFailure,
  type FakeAgentState,
  type FakeAgentTaxpayer,
  nextCounter,
  taxpayerKey,
} from './fake-agent-state'

const NAV_API_NAMESPACE = 'http://schemas.nav.gov.hu/OSA/3.0/api'
const TAXPAYER_ID_PATTERN = /^\d{8}$/

export const CONNECT_PRINCIPAL_MESSAGES = {
  created: 'DONE',
  ownerInviteResent:
    'Már létező fiók, nincs fiókgazdája. Fiókgazdai meghívó (megbízott számlakibocsátás) email újraküldve.',
  joinRequestSent: 'Már létező fiók fiókgazdával. Csatlakozási kérelmet küldtünk a fiókgazdának.',
  joinRequestResent:
    'Már létező fiók fiókgazdával. A csatlakozási kérelem emailt újraküldtük a fiókgazdának.',
} as const

function authenticateDelegate(state: FakeAgentState, username: string, password: string): boolean {
  const delegate = state.delegates.get(username)
  if (!delegate) return false
  if (delegate.password !== password || !delegate.approved) throw agentFailure(3)
  if (state.principals.get(delegate.taxpayerId)?.state !== 'owned') throw agentFailure(250)
  return true
}

export function authenticate(state: FakeAgentState, credentials: FakeAgentCredentials): void {
  const { agentKey, username, password } = credentials
  if (agentKey !== undefined) {
    if (!state.config.strictAuth || state.config.agentKeys.has(agentKey)) return
    throw agentFailure(3)
  }
  if (username === undefined || password === undefined) throw agentFailure(3)
  if (authenticateDelegate(state, username, password)) return
  if (!state.config.strictAuth || state.users.get(username) === password) return
  throw agentFailure(3)
}

export function acceptDelegation(state: FakeAgentState, taxNumber: string): void {
  const key = taxpayerKey(taxNumber)
  const principal = state.principals.get(key)
  if (!principal) {
    throw new TypeError(`Nincs ilyen megbízói fiók a hamis Agentben: ${taxNumber}`)
  }
  state.principals.set(key, { ...principal, state: 'owned' })
  for (const [email, delegate] of state.delegates) {
    if (delegate.taxpayerId === key) state.delegates.set(email, { ...delegate, approved: true })
  }
}

function addressNode(taxpayer: FakeAgentTaxpayer): XmlNode | undefined {
  const { address } = taxpayer
  if (!address) return undefined
  return el('taxpayerAddressList', [
    el('taxpayerAddressItem', [
      el('taxpayerAddressType', 'HQ'),
      el('taxpayerAddress', [
        el('countryCode', 'HU'),
        el('postalCode', address.postalCode),
        el('city', address.city),
        optionalEl('streetName', address.streetName),
        optionalEl('publicPlaceCategory', address.publicPlaceCategory),
        optionalEl('number', address.number),
      ]),
    ]),
  ])
}

function taxpayerDataNode(taxpayerId: string, taxpayer: FakeAgentTaxpayer): XmlNode {
  return el('taxpayerData', [
    el('taxpayerName', taxpayer.name),
    optionalEl('taxpayerShortName', taxpayer.shortName),
    el('taxNumberDetail', [
      el('taxpayerId', taxpayerId),
      optionalEl('vatCode', taxpayer.vatCode),
      optionalEl('countyCode', taxpayer.countyCode),
    ]),
    optionalEl('incorporation', taxpayer.incorporation),
    addressNode(taxpayer),
  ])
}

export function handleQueryTaxpayer(
  state: FakeAgentState,
  request: FakeAgentRequest,
): FakeAgentResponse {
  const taxpayerId = childText(request.root, 'torzsszam')
  if (taxpayerId === undefined || !TAXPAYER_ID_PATTERN.test(taxpayerId)) {
    throw xmlFailure('a <torzsszam> elemben 8 jegyű adószám-törzsszám kell.')
  }
  const taxpayer = state.config.taxpayers[taxpayerId]
  const valid = taxpayer !== undefined && taxpayer.valid !== false
  const timestamp = state.now().toISOString()
  const xml = buildXmlDocument({
    root: 'QueryTaxpayerResponse',
    namespace: NAV_API_NAMESPACE,
    children: [
      el('header', [
        el('requestId', `KASSZAFAKE${nextCounter(state, '#nav')}`),
        el('timestamp', timestamp),
        el('requestVersion', '3.0'),
        el('headerVersion', '1.0'),
      ]),
      el('result', [el('funcCode', 'OK')]),
      el('infoDate', timestamp),
      el('taxpayerValidity', valid),
      valid && taxpayer && taxpayerDataNode(taxpayerId, taxpayer),
    ],
  })
  return xmlResponse(xml)
}

function connectResponse(message: string): FakeAgentResponse {
  const encoded = encodeHeaderValue(message)
  return textResponse(`xmlagentresponse=${encoded}\n`, { XML_AGENT_RESPONSE: encoded })
}

export function handleConnectPrincipal(
  state: FakeAgentState,
  request: FakeAgentRequest,
): FakeAgentResponse {
  const company = findChild(request.root, 'cegMb')
  const user = findChild(request.root, 'usrMb')
  const taxNumber = childText(company, 'cegtaxnumber')
  if (taxNumber === undefined) throw xmlFailure('hiányzik a(z) <cegMb/cegtaxnumber> elem.')
  const key = taxpayerKey(taxNumber)
  const principal = state.principals.get(key)
  const email = childText(user, 'usremail')
  const password = childText(user, 'usrpassword')
  if (email === undefined || password === undefined) {
    throw xmlFailure('hiányzik a(z) <usrMb/usremail> vagy <usrMb/usrpassword> elem.')
  }
  if (!principal) {
    state.principals.set(key, { state: 'unowned', joinRequests: 0 })
    state.delegates.set(email, { taxpayerId: key, password, approved: true })
    return connectResponse(CONNECT_PRINCIPAL_MESSAGES.created)
  }
  if (principal.state === 'unowned') {
    return connectResponse(CONNECT_PRINCIPAL_MESSAGES.ownerInviteResent)
  }
  if (!state.delegates.has(email)) {
    state.delegates.set(email, { taxpayerId: key, password, approved: false })
  }
  state.principals.set(key, { ...principal, joinRequests: principal.joinRequests + 1 })
  return connectResponse(
    principal.joinRequests === 0
      ? CONNECT_PRINCIPAL_MESSAGES.joinRequestSent
      : CONNECT_PRINCIPAL_MESSAGES.joinRequestResent,
  )
}
