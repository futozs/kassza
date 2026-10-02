import {
  type AgentContext,
  createAgentContext,
  type RequestOptions,
  type SzamlazzOptions,
} from '../core/context'
import { type DateInput, toAgentDate } from '../core/dates'
import { SzamlazzError } from '../core/errors'
import {
  type AgentResponse,
  decodeHeaderValue,
  readHeader,
  throwIfAnyError,
  unexpectedResponse,
} from '../core/response'
import { buildXmlDocument, el, optionalEl, type XmlNode } from '../core/xml/serialize'
import { queryTaxpayer } from '../taxpayer/query-taxpayer'
import { isValidEmail } from '../validators/email'
import { parseHungarianTaxNumber } from '../validators/tax-number'

export const CONNECT_PRINCIPAL_NAMESPACE = 'http://www.szamlazz.hu/xmlcegmb'
export const CONNECT_PRINCIPAL_SCHEMA_LOCATION =
  'http://www.szamlazz.hu/docs/xsds/agentmb/xmlcegmb.xsd'
export const DELEGATE_PREFIX_PATTERN: RegExp = /^[A-Z0-9]{1,5}$/
export const DELEGATE_PASSWORD_MIN_LENGTH = 8
export const DELEGATE_PASSWORD_MAX_LENGTH = 128

const AGENT_RESPONSE_HEADER = 'XML_AGENT_RESPONSE'
const AGENT_RESPONSE_TEXT = /xmlagentresponse\s*=\s*([^\r\n]*)/i
const strictUtf8 = new TextDecoder('utf-8', { fatal: true })

export interface PrincipalAddress {
  readonly zip: string
  readonly city: string
  readonly address: string
}

export interface PrincipalCompany {
  readonly name: string
  readonly taxNumber: string
  readonly invoicePrefix: string
  readonly zip: string
  readonly city: string
  readonly address: string
  readonly postalAddress?: PrincipalAddress | undefined
  readonly bankName?: string | undefined
  readonly bankAccount?: string | undefined
  readonly email: string
  readonly replyToEmail?: string | undefined
  readonly cashAccountingFrom?: DateInput | undefined
  readonly cashAccountingTo?: DateInput | undefined
  readonly kataFrom?: DateInput | undefined
  readonly kataTo?: DateInput | undefined
}

export interface DelegateUser {
  readonly email: string
  readonly password: string
  readonly firstName: string
  readonly lastName?: string | undefined
}

export interface ConnectPrincipalInput {
  readonly principal: PrincipalCompany
  readonly user: DelegateUser
}

export type ConnectPrincipalStatus =
  | 'account-created'
  | 'owner-invite-resent'
  | 'join-request-resent'
  | 'join-request-sent'
  | 'unknown'

export interface ConnectPrincipalResponse {
  readonly status: ConnectPrincipalStatus
  readonly message: string
}

export interface ConnectPrincipalResult extends ConnectPrincipalResponse {
  readonly taxNumber: string
  readonly invoicePrefix: string
  readonly userEmail: string
}

export interface ConnectPrincipalOptions extends SzamlazzOptions, RequestOptions {
  readonly verifyTaxNumber?: boolean | undefined
}

function validation(message: string, hint?: string): SzamlazzError {
  return new SzamlazzError(message, { category: 'validation', action: 'connectPrincipal', hint })
}

function required(value: string | undefined, label: string): string {
  const trimmed = value?.trim()
  if (!trimmed) throw validation(`A(z) ${label} megadása kötelező.`)
  return trimmed
}

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export function normalizeDelegateTaxNumber(value: string): string {
  const parsed = parseHungarianTaxNumber(value)
  if (!parsed) {
    throw validation(
      `A megbízó adószáma (${value}) nem érvényes 11 jegyű magyar adószám.`,
      'A Számlázz.hu a teljes, 13 karakteres adószám (12345678-1-23) pontos egyezésével keresi a meglévő fiókot; elgépelt adószámmal új, felesleges fiók jönne létre.',
    )
  }
  return parsed.formatted
}

export function assertDelegatePrefix(value: string, label = 'számlaszám-előtag'): string {
  const prefix = required(value, label)
  if (!DELEGATE_PREFIX_PATTERN.test(prefix)) {
    throw validation(
      `A(z) ${label} (${prefix}) csak nagybetűt és számot tartalmazhat, és legfeljebb 5 karakter lehet (337).`,
    )
  }
  return prefix
}

function requiredEmail(value: string | undefined, label: string): string {
  const email = required(value, label)
  if (!isValidEmail(email)) throw validation(`A(z) ${label} (${email}) nem érvényes e-mail cím.`)
  return email
}

function optionalEmail(value: string | undefined, label: string): string | undefined {
  const email = optionalText(value)
  if (email !== undefined && !isValidEmail(email)) {
    throw validation(`A(z) ${label} (${email}) nem érvényes e-mail cím.`)
  }
  return email
}

function assertPassword(password: string): void {
  if (typeof password !== 'string' || password.length < DELEGATE_PASSWORD_MIN_LENGTH) {
    throw validation(
      `A dedikált felhasználó jelszava legalább ${DELEGATE_PASSWORD_MIN_LENGTH} karakter legyen (506).`,
    )
  }
  if (password.length > DELEGATE_PASSWORD_MAX_LENGTH) {
    throw validation(
      `A dedikált felhasználó jelszava legfeljebb ${DELEGATE_PASSWORD_MAX_LENGTH} karakter lehet (507).`,
    )
  }
}

function optionalDate(value: DateInput | undefined, label: string): string | undefined {
  if (value === undefined) return undefined
  try {
    return toAgentDate(value)
  } catch (error) {
    throw validation(
      `A(z) ${label} nem érvényes dátum: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function assertPeriod(from: string | undefined, to: string | undefined, label: string): void {
  if (to !== undefined && from === undefined) {
    throw validation(`A(z) ${label} záródátumához kezdődátum is kell.`)
  }
  if (from !== undefined && to !== undefined && to < from) {
    throw validation(`A(z) ${label} záródátuma nem lehet korábbi a kezdődátumnál.`)
  }
}

interface NormalizedConnectInput {
  readonly taxNumber: string
  readonly invoicePrefix: string
  readonly principal: PrincipalCompany
  readonly user: DelegateUser
  readonly userEmail: string
  readonly cashAccountingFrom: string | undefined
  readonly cashAccountingTo: string | undefined
  readonly kataFrom: string | undefined
  readonly kataTo: string | undefined
}

function normalizeInput(input: ConnectPrincipalInput): NormalizedConnectInput {
  const { principal, user } = input
  required(principal?.name, 'megbízó cégneve')
  const taxNumber = normalizeDelegateTaxNumber(required(principal.taxNumber, 'megbízó adószáma'))
  const invoicePrefix = assertDelegatePrefix(principal.invoicePrefix)
  required(principal.zip, 'székhely irányítószáma')
  required(principal.city, 'székhely települése')
  required(principal.address, 'székhely címe')
  requiredEmail(principal.email, 'megbízó e-mail címe')
  optionalEmail(principal.replyToEmail, 'válaszcím (replyToEmail)')
  if (principal.postalAddress) {
    required(principal.postalAddress.zip, 'postázási irányítószám')
    required(principal.postalAddress.city, 'postázási település')
    required(principal.postalAddress.address, 'postázási cím')
  }
  const userEmail = requiredEmail(user?.email, 'dedikált felhasználó e-mail címe')
  assertPassword(user.password)
  required(user.firstName, 'dedikált felhasználó keresztneve')
  const cashAccountingFrom = optionalDate(
    principal.cashAccountingFrom,
    'pénzforgalmi időszak kezdete',
  )
  const cashAccountingTo = optionalDate(principal.cashAccountingTo, 'pénzforgalmi időszak vége')
  const kataFrom = optionalDate(principal.kataFrom, 'KATA időszak kezdete')
  const kataTo = optionalDate(principal.kataTo, 'KATA időszak vége')
  assertPeriod(cashAccountingFrom, cashAccountingTo, 'pénzforgalmi időszak')
  assertPeriod(kataFrom, kataTo, 'KATA időszak')
  return {
    taxNumber,
    invoicePrefix,
    principal,
    user,
    userEmail,
    cashAccountingFrom,
    cashAccountingTo,
    kataFrom,
    kataTo,
  }
}

function loginNodes(credentials: readonly XmlNode[]): XmlNode[] {
  const value = (name: string): string | undefined => {
    const node = credentials.find((candidate) => candidate.name === name)
    return node === undefined ? undefined : String(node.content)
  }
  const agentKey = value('szamlaagentkulcs')
  if (agentKey !== undefined) return [el('szamlaagentkulcs', agentKey)]
  const username = value('felhasznalo')
  const password = value('jelszo')
  if (username === undefined || password === undefined) {
    throw new SzamlazzError(
      'A megbízotti fiók azonosításához Agent kulcs vagy felhasználónév és jelszó kell.',
      {
        category: 'configuration',
        action: 'connectPrincipal',
      },
    )
  }
  return [el('loginname', username), el('password', password)]
}

function principalNodes(input: NormalizedConnectInput): XmlNode {
  const { principal } = input
  return el('cegMb', [
    el('cegcompanyname', principal.name.trim()),
    el('cegtaxnumber', input.taxNumber),
    el('cegszamlaszamelotag', input.invoicePrefix),
    el('cegirsz', principal.zip.trim()),
    el('cegcity', principal.city.trim()),
    el('cegaddr', principal.address.trim()),
    optionalEl('cegpostirsz', optionalText(principal.postalAddress?.zip)),
    optionalEl('cegpostcity', optionalText(principal.postalAddress?.city)),
    optionalEl('cegpostaddr', optionalText(principal.postalAddress?.address)),
    el('cegbank', optionalText(principal.bankName) ?? ''),
    el('cegbankaccount', optionalText(principal.bankAccount) ?? ''),
    el('cegemail', principal.email.trim()),
    el('cegemailreplyto', optionalText(principal.replyToEmail) ?? ''),
    optionalEl('cegpenzforgdattol', input.cashAccountingFrom),
    optionalEl('cegpenzforgdatig', input.cashAccountingTo),
    optionalEl('cegkatadattol', input.kataFrom),
    optionalEl('cegkatadatig', input.kataTo),
  ])
}

function userNodes(input: NormalizedConnectInput): XmlNode {
  return el('usrMb', [
    el('usremail', input.userEmail),
    el('usrpassword', input.user.password),
    optionalEl('usrvezeteknev', optionalText(input.user.lastName)),
    el('usrkeresztnev', input.user.firstName.trim()),
  ])
}

function buildXml(credentials: readonly XmlNode[], input: NormalizedConnectInput): string {
  return buildXmlDocument({
    root: 'XmlCegMb',
    namespace: CONNECT_PRINCIPAL_NAMESPACE,
    schemaLocation: CONNECT_PRINCIPAL_SCHEMA_LOCATION,
    children: [el('login', loginNodes(credentials)), principalNodes(input), userNodes(input)],
  })
}

export function buildConnectPrincipalXml(
  credentials: readonly XmlNode[],
  input: ConnectPrincipalInput,
): string {
  return buildXml(credentials, normalizeInput(input))
}

function normalizeMessage(message: string): string {
  return message.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

export function connectPrincipalStatus(message: string): ConnectPrincipalStatus {
  const normalized = normalizeMessage(message)
  if (/^done(?:;|$)/.test(normalized)) return 'account-created'
  if (normalized.includes('nincs fiokgazdaja')) return 'owner-invite-resent'
  if (normalized.includes('csatlakozasi kerelem') && normalized.includes('ujrakuld')) {
    return 'join-request-resent'
  }
  if (normalized.includes('csatlakozasi kerelmet kuldtunk')) return 'join-request-sent'
  return 'unknown'
}

const LATIN1_HIGH_START = 0x80
const LATIN1_END = 0xff

function looksLikeLatin1Utf8(value: string): boolean {
  let hasHighByte = false
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code > LATIN1_END) return false
    if (code >= LATIN1_HIGH_START) hasHighByte = true
  }
  return hasHighByte
}

function repairMojibake(value: string): string {
  if (!looksLikeLatin1Utf8(value)) return value
  try {
    return strictUtf8.decode(Uint8Array.from(value, (char) => char.charCodeAt(0)))
  } catch {
    return value
  }
}

function agentResponseMessage(response: AgentResponse): string | undefined {
  const header = readHeader(response.headers, AGENT_RESPONSE_HEADER, true)
  if (header !== undefined) return repairMojibake(header)
  const match = AGENT_RESPONSE_TEXT.exec(response.text())
  const body = match?.[1] ? decodeHeaderValue(match[1]).trim() : undefined
  return body ? body : undefined
}

export function parseConnectPrincipalResponse(response: AgentResponse): ConnectPrincipalResponse {
  throwIfAnyError(response)
  const message = agentResponseMessage(response)
  if (message === undefined) {
    throw unexpectedResponse(response, 'Hiányzik az XML_AGENT_RESPONSE válasz.')
  }
  return { status: connectPrincipalStatus(message), message }
}

async function assertActiveTaxpayer(
  ctx: AgentContext,
  taxNumber: string,
  options: RequestOptions,
): Promise<void> {
  const taxpayer = await queryTaxpayer(ctx, taxNumber, options)
  if (!taxpayer.valid) {
    throw validation(
      `A(z) ${taxNumber} adószám a NAV szerint nem érvényes, ezért nem küldöm el a csatlakozási kérelmet.`,
      'Ellenőrizd a megbízó adószámát; elgépelt adószámmal új, felesleges fiók jönne létre.',
    )
  }
}

export async function connectPrincipalWith(
  ctx: AgentContext,
  input: ConnectPrincipalInput,
  options: RequestOptions & { readonly verifyTaxNumber?: boolean | undefined } = {},
): Promise<ConnectPrincipalResult> {
  const normalized = normalizeInput(input)
  const xml = buildXml(ctx.credentials, normalized)
  const requestOptions: RequestOptions = { signal: options.signal }
  if (options.verifyTaxNumber === true) {
    await assertActiveTaxpayer(ctx, normalized.taxNumber, requestOptions)
  }
  const response = await ctx.execute(
    { action: 'connectPrincipal', xml, signal: options.signal },
    parseConnectPrincipalResponse,
  )
  return {
    ...response,
    taxNumber: normalized.taxNumber,
    invoicePrefix: normalized.invoicePrefix,
    userEmail: normalized.userEmail,
  }
}

export async function connectPrincipal(
  input: ConnectPrincipalInput,
  options: ConnectPrincipalOptions = {},
): Promise<ConnectPrincipalResult> {
  const { signal, verifyTaxNumber, ...szamlazzOptions } = options
  return connectPrincipalWith(createAgentContext(szamlazzOptions), input, {
    signal,
    verifyTaxNumber,
  })
}
