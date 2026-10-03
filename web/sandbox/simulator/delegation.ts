import { AgentFault, type SimResponse } from './respond'
import type { SimulatorStore } from './store'
import { TAXPAYER_FIXTURES } from './taxpayer'
import type { SimPrincipal } from './types'
import { child, text, type XmlElement } from './xml'

export const CONNECT_PRINCIPAL_MESSAGES = {
  created: 'DONE',
  ownerInviteResent:
    'Már létező fiók, nincs fiókgazdája. Fiókgazdai meghívó (megbízott számlakibocsátás) email újraküldve.',
  joinRequestSent: 'Már létező fiók fiókgazdával. Csatlakozási kérelmet küldtünk a fiókgazdának.',
  joinRequestResent:
    'Már létező fiók fiókgazdával. A csatlakozási kérelem emailt újraküldtük a fiókgazdának.',
} as const

const TAX_NUMBER = /^(\d{8})(?:-?\d-?\d{2})?$/
const encoder = new TextEncoder()

export function taxpayerIdOf(taxNumber: string): string | undefined {
  return TAX_NUMBER.exec(taxNumber.trim())?.[1]
}

function required(element: XmlElement | undefined, parent: string, name: string): string {
  const value = text(element, name)
  if (value === undefined) {
    throw new AgentFault(57, `XML beolvasási hiba: hiányzik a(z) <${parent}/${name}> elem.`)
  }
  return value
}

function connectResponse(message: string, effects: readonly string[]): SimResponse {
  const encoded = encodeURIComponent(message).replace(/%20/g, '+')
  return {
    status: 200,
    headers: [
      ['content-type', 'text/plain; charset=UTF-8'],
      ['XML_AGENT_RESPONSE', encoded],
    ],
    body: encoder.encode(`xmlagentresponse=${encoded}\n`),
    kind: 'text',
    effects,
  }
}

function existingPrincipal(
  store: SimulatorStore,
  taxpayerId: string,
  taxNumber: string,
): { readonly principal: SimPrincipal; readonly sample: boolean } | undefined {
  const stored = store.principals.get(taxpayerId)
  if (stored) return { principal: stored, sample: false }
  const fixture = TAXPAYER_FIXTURES[taxpayerId]
  if (!fixture) return undefined
  return {
    principal: {
      name: fixture.shortName,
      taxNumber,
      invoicePrefix: '',
      owned: true,
      joinRequests: 0,
    },
    sample: true,
  }
}

export function handleConnectPrincipal(store: SimulatorStore, root: XmlElement): SimResponse {
  const company = child(root, 'cegMb')
  const user = child(root, 'usrMb')
  const name = required(company, 'cegMb', 'cegcompanyname')
  const taxNumber = required(company, 'cegMb', 'cegtaxnumber')
  const invoicePrefix = required(company, 'cegMb', 'cegszamlaszamelotag')
  const ownerEmail = required(company, 'cegMb', 'cegemail')
  const userEmail = required(user, 'usrMb', 'usremail')
  required(user, 'usrMb', 'usrpassword')
  const taxpayerId = taxpayerIdOf(taxNumber)
  if (taxpayerId === undefined) throw new AgentFault(57, `Hibás adószám formátum: ${taxNumber}.`)
  const delegate = store.delegates.get(userEmail)
  if (delegate && delegate.taxpayerId !== taxpayerId) throw new AgentFault(101)

  const existing = existingPrincipal(store, taxpayerId, taxNumber)
  if (!existing) {
    store.principals.set(taxpayerId, {
      name,
      taxNumber,
      invoicePrefix,
      owned: false,
      joinRequests: 0,
    })
    store.delegates.set(userEmail, { taxpayerId, approved: true })
    return connectResponse(CONNECT_PRINCIPAL_MESSAGES.created, [
      `Új megbízói fiók jött létre: ${name} (${taxNumber}), ${invoicePrefix} számlaelőtaggal.`,
      `Fiókgazdai meghívó e-mail a megbízónak: ${ownerEmail}. Amíg nem veszi birtokba a fiókot, a dedikált felhasználó (${userEmail}) kérései 250-es hibát kapnak.`,
    ])
  }

  const { principal, sample } = existing
  if (!principal.owned) {
    return connectResponse(CONNECT_PRINCIPAL_MESSAGES.ownerInviteResent, [
      `A(z) ${principal.name} fiókját még senki nem vette birtokba: a Számlázz.hu újraküldte a fiókgazdai meghívót.`,
    ])
  }
  if (!delegate) store.delegates.set(userEmail, { taxpayerId, approved: false })
  store.principals.set(taxpayerId, { ...principal, joinRequests: principal.joinRequests + 1 })
  if (principal.joinRequests > 0) {
    return connectResponse(CONNECT_PRINCIPAL_MESSAGES.joinRequestResent, [
      `A csatlakozási kérelmet a Számlázz.hu újraküldte a(z) ${principal.name} fiókgazdájának.`,
    ])
  }
  return connectResponse(CONNECT_PRINCIPAL_MESSAGES.joinRequestSent, [
    ...(sample
      ? [
          `A(z) ${taxNumber} minta adószámhoz a szimulátorban már tartozik fiókgazdás Számlázz.hu fiók.`,
        ]
      : []),
    `Csatlakozási kérelem e-mail a(z) ${principal.name} fiókgazdájának. Amíg el nem fogadja, a dedikált felhasználó (${userEmail}) belépése 3-as hibát kap.`,
  ])
}

export function assertDelegateAccess(store: SimulatorStore, username: string): void {
  const delegate = store.delegates.get(username)
  if (!delegate) return
  if (!store.principals.get(delegate.taxpayerId)?.owned) throw new AgentFault(250)
  if (!delegate.approved) throw new AgentFault(3)
}

export function acceptDelegation(store: SimulatorStore, taxNumber: string): void {
  const taxpayerId = taxpayerIdOf(taxNumber)
  const principal = taxpayerId === undefined ? undefined : store.principals.get(taxpayerId)
  if (taxpayerId === undefined || !principal) {
    throw new TypeError(`Nincs ilyen megbízói fiók a szimulátorban: ${taxNumber}`)
  }
  store.principals.set(taxpayerId, { ...principal, owned: true })
  for (const [email, delegate] of store.delegates) {
    if (delegate.taxpayerId === taxpayerId) {
      store.delegates.set(email, { ...delegate, approved: true })
    }
  }
}
