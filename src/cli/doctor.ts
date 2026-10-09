import { createKassza, type Kassza } from '../client'
import { isSzamlazzError } from '../core/errors'
import { KASSZA_VERSION } from '../core/version'
import { AGENT_KEY_ENV, type CliIo } from './io'

export type DoctorStatus = 'ok' | 'warn' | 'fail' | 'skip'

export interface DoctorCheck {
  readonly id: string
  readonly status: DoctorStatus
  readonly message: string
}

export interface DoctorOptions {
  readonly invoiceNumber?: string | undefined
  readonly receiptNumber?: string | undefined
  readonly capabilities?: boolean | undefined
  readonly checkUpdate?: boolean | undefined
}

export const NPM_LATEST_URL = 'https://registry.npmjs.org/kassza/latest'
export const USED_BY_URL = 'https://github.com/futozs/kassza/issues/new?template=used-by.yml'

interface ResponseSample {
  readonly date: string | undefined
  readonly sentAt: number
  readonly receivedAt: number
  readonly setCookie: boolean
}

const MINIMUM_NODE_MAJOR = 22
const CLOCK_OK_SECONDS = 2
const CLOCK_WARN_SECONDS = 30
const DATE_HEADER_PRECISION_MS = 500

const secondsFormat = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 1 })

function check(id: string, status: DoctorStatus, message: string): DoctorCheck {
  return { id, status, message }
}

function nodeCheck(version: string): DoctorCheck {
  const major = Number(version.replace(/^v/, '').split('.')[0])
  if (Number.isInteger(major) && major >= MINIMUM_NODE_MAJOR) {
    return check('node', 'ok', `Node.js ${version}`)
  }
  return check(
    'node',
    'fail',
    `Node.js ${version}: a kasszához legalább Node.js ${MINIMUM_NODE_MAJOR} kell.`,
  )
}

function timezoneCheck(): DoctorCheck {
  try {
    new Intl.DateTimeFormat('hu-HU', { timeZone: 'Europe/Budapest' }).format(new Date())
    return check('timezone', 'ok', 'Időzóna-adatok: Europe/Budapest elérhető.')
  } catch {
    return check(
      'timezone',
      'fail',
      'Időzóna-adatok: az Europe/Budapest időzóna nem érhető el (teljes ICU-val fordított Node.js kell).',
    )
  }
}

function keyCheck(raw: string | undefined): { readonly check: DoctorCheck; readonly key?: string } {
  const key = raw?.trim()
  if (!key) {
    return {
      check: check(
        'agent-key',
        'fail',
        `Agent kulcs: hiányzik a ${AGENT_KEY_ENV} környezeti változó.`,
      ),
    }
  }
  if (key !== key.toLowerCase()) {
    return {
      check: check(
        'agent-key',
        'fail',
        'Agent kulcs: nagybetűt tartalmaz. A Számlázz.hu csak kisbetűs kulcsot fogad el, másold ki újra.',
      ),
    }
  }
  if (key !== raw) {
    return {
      key,
      check: check(
        'agent-key',
        'warn',
        `Agent kulcs: ${key.length} karakter, de az elején vagy a végén szóköz van (a kassza levágja).`,
      ),
    }
  }
  return { key, check: check('agent-key', 'ok', `Agent kulcs: ${key.length} karakter, kisbetűs.`) }
}

function capturingFetch(
  base: typeof globalThis.fetch,
  now: () => Date,
  samples: ResponseSample[],
): typeof globalThis.fetch {
  const wrapped = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const sentAt = now().getTime()
    const response = await base(input, init)
    samples.push({
      date: response.headers.get('date') ?? undefined,
      sentAt,
      receivedAt: now().getTime(),
      setCookie: response.headers.get('set-cookie') !== null,
    })
    return response
  }
  return wrapped as typeof globalThis.fetch
}

async function authCheck(kassza: Kassza): Promise<DoctorCheck> {
  try {
    return (await kassza.verifyCredentials())
      ? check('auth', 'ok', 'Hitelesítés: a Számlázz.hu elfogadta az Agent kulcsot.')
      : check('auth', 'fail', 'Hitelesítés: a Számlázz.hu elutasította az Agent kulcsot (3).')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return check('auth', 'fail', `Hitelesítés: a próba nem sikerült. ${message}`)
  }
}

function clockCheck(samples: readonly ResponseSample[]): DoctorCheck {
  const sample = samples.find((entry) => entry.date !== undefined)
  const serverTime = sample?.date === undefined ? Number.NaN : Date.parse(sample.date)
  if (!sample || Number.isNaN(serverTime)) {
    return check('clock', 'skip', 'Óra: a Számlázz.hu válaszában nem volt Date fejléc.')
  }
  const localTime = (sample.sentAt + sample.receivedAt) / 2
  const skewSeconds = (localTime - (serverTime + DATE_HEADER_PRECISION_MS)) / 1000
  const absolute = Math.abs(skewSeconds)
  const direction = skewSeconds > 0 ? 'siet' : 'késik'
  const amount = `${secondsFormat.format(absolute)} mp`
  if (absolute <= CLOCK_OK_SECONDS) {
    return check('clock', 'ok', `Óra: legfeljebb ${amount} eltérés a Számlázz.hu idejétől.`)
  }
  const risk = `éjfél körül ${amount} ideig rossz napra kerülhet a bizonylat kelte (352-es hiba). Szinkronizáld az órát (NTP).`
  return absolute <= CLOCK_WARN_SECONDS
    ? check('clock', 'warn', `Óra: a gép órája ${amount}-et ${direction}; ${risk}`)
    : check('clock', 'fail', `Óra: a gép órája ${amount}-et ${direction}; ${risk}`)
}

function sessionCheck(samples: readonly ResponseSample[]): DoctorCheck {
  if (samples.length === 0) return check('session', 'skip', 'Munkamenet: nem volt válasz.')
  return samples.some((sample) => sample.setCookie)
    ? check(
        'session',
        'ok',
        'Munkamenet: a Számlázz.hu munkamenet-sütit adott, a kassza újrahasznosítja.',
      )
    : check(
        'session',
        'warn',
        'Munkamenet: nem érkezett munkamenet-süti. Ha proxy vagy tűzfal szűri a Set-Cookie fejlécet, minden kérés új bejelentkezés lesz.',
      )
}

async function accountCheck(kassza: Kassza, options: DoctorOptions): Promise<DoctorCheck> {
  try {
    if (options.invoiceNumber !== undefined) {
      const invoice = await kassza.invoices.find(options.invoiceNumber, { includePdf: false })
      if (!invoice) {
        return check(
          'account',
          'warn',
          `Fiók típusa: a(z) ${options.invoiceNumber} számla nem található.`,
        )
      }
      return accountOf(invoice.header.test)
    }
    if (options.receiptNumber !== undefined) {
      const receipt = await kassza.receipts.find({
        receiptNumber: options.receiptNumber,
        downloadPdf: false,
      })
      if (!receipt) {
        return check(
          'account',
          'warn',
          `Fiók típusa: a(z) ${options.receiptNumber} nyugta nem található.`,
        )
      }
      return accountOf(receipt.isTest)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return check('account', 'warn', `Fiók típusa: nem sikerült megállapítani. ${message}`)
  }
  return check(
    'account',
    'skip',
    'Fiók típusa: add meg egy meglévő bizonylat számát (--invoice vagy --receipt), abból kiderül, hogy teszt- vagy éles fiók.',
  )
}

const PROBE_BUYER = {
  name: 'Kassza doctor próba',
  zip: '1111',
  city: 'Budapest',
  address: 'Próba utca 1.',
} as const

async function eInvoiceCheck(kassza: Kassza): Promise<DoctorCheck> {
  try {
    await kassza.invoices.preview({
      buyer: PROBE_BUYER,
      items: [{ name: 'Próba', netUnitPrice: 1, vat: 27 }],
      eInvoice: true,
    })
    return check(
      'e-invoice',
      'ok',
      'E-számla: engedélyezve (előnézettel ellenőrizve, bizonylat nem készült).',
    )
  } catch (error) {
    if (isSzamlazzError(error) && (error.code === 54 || error.code === 55 || error.code === 49)) {
      return check('e-invoice', 'warn', `E-számla: nem használható (${error.message}).`)
    }
    const message = error instanceof Error ? error.message : String(error)
    return check('e-invoice', 'warn', `E-számla: az előnézet nem sikerült. ${message}`)
  }
}

function receiptCapabilityCheck(): DoctorCheck {
  return check(
    'receipt',
    'skip',
    'Nyugta: a nyugtaelőtagot és a jogosultságot csak valódi kiállítás ellenőrzi (524, 8). Próbáld tesztfiókon.',
  )
}

function environmentCheck(
  account: DoctorCheck,
  nodeEnv: string | undefined,
): DoctorCheck | undefined {
  if (account.status !== 'ok' || !account.message.includes('éles fiók')) return undefined
  if (nodeEnv === 'test' || nodeEnv === 'development') {
    return check(
      'environment',
      'warn',
      `Környezet: NODE_ENV=${nodeEnv}, de az Agent kulcs éles fiókhoz tartozik. A tesztek valódi bizonylatot állíthatnak ki.`,
    )
  }
  return undefined
}

function compareVersions(a: string, b: string): number {
  const parse = (value: string): number[] =>
    value
      .replace(/^v/, '')
      .split(/[.-]/)
      .slice(0, 3)
      .map((part) => Number.parseInt(part, 10) || 0)
  const left = parse(a)
  const right = parse(b)
  for (let index = 0; index < 3; index++) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

async function updateCheck(fetchImpl: typeof globalThis.fetch): Promise<DoctorCheck> {
  try {
    const response = await fetchImpl(NPM_LATEST_URL, { headers: { accept: 'application/json' } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const latest = String(((await response.json()) as { version?: unknown }).version ?? '')
    if (!/^\d+\.\d+\.\d+/.test(latest)) throw new Error('nincs verziószám a válaszban')
    return compareVersions(latest, KASSZA_VERSION) > 0
      ? check('update', 'warn', `Frissítés: elérhető a kassza ${latest} (most: ${KASSZA_VERSION}).`)
      : check('update', 'ok', `Frissítés: a kassza ${KASSZA_VERSION} a legfrissebb.`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return check('update', 'skip', `Frissítés: az npm nem volt elérhető (${message}).`)
  }
}

function accountOf(test: boolean | undefined): DoctorCheck {
  if (test === true) return check('account', 'ok', 'Fiók típusa: tesztfiók.')
  if (test === false) {
    return check('account', 'ok', 'Fiók típusa: éles fiók, a kiállított bizonylatok valódiak.')
  }
  return check('account', 'skip', 'Fiók típusa: a bizonylatból nem derült ki.')
}

export async function runDoctor(io: CliIo, options: DoctorOptions = {}): Promise<DoctorCheck[]> {
  const now = io.now ?? (() => new Date())
  const { check: keyResult, key } = keyCheck(io.env[AGENT_KEY_ENV])
  const checks = [nodeCheck(io.nodeVersion), timezoneCheck(), keyResult]
  if (key === undefined) {
    return [...checks, check('auth', 'skip', 'Hitelesítés: Agent kulcs nélkül nem próbálható.')]
  }
  const samples: ResponseSample[] = []
  const kassza = createKassza({
    agentKey: key,
    fetch: capturingFetch(io.fetch ?? globalThis.fetch, now, samples),
    maxAttempts: 1,
  })
  const auth = await authCheck(kassza)
  const account =
    auth.status === 'ok'
      ? await accountCheck(kassza, options)
      : check('account', 'skip', 'Fiók típusa: sikertelen hitelesítés miatt kimaradt.')
  const extra: DoctorCheck[] = []
  const environment = environmentCheck(account, io.env.NODE_ENV)
  if (environment) extra.push(environment)
  if (options.capabilities === true && auth.status === 'ok') {
    extra.push(await eInvoiceCheck(kassza), receiptCapabilityCheck())
  }
  if (options.checkUpdate === true) extra.push(await updateCheck(io.fetch ?? globalThis.fetch))
  return [...checks, auth, clockCheck(samples), sessionCheck(samples), account, ...extra]
}

const SYMBOLS: Readonly<Record<DoctorStatus, string>> = {
  ok: '✓',
  warn: '!',
  fail: '✗',
  skip: '-',
}

function summary(checks: readonly DoctorCheck[]): string {
  const failures = checks.filter((entry) => entry.status === 'fail').length
  const warnings = checks.filter((entry) => entry.status === 'warn').length
  return `Összegzés: ${failures} hiba, ${warnings} figyelmeztetés.`
}

export function formatDoctor(checks: readonly DoctorCheck[]): string {
  const healthy = !checks.some((entry) => entry.status === 'fail')
  return [
    ...checks.map((entry) => `${SYMBOLS[entry.status]} ${entry.message}`),
    '',
    summary(checks),
    ...(healthy ? ['', `Használod a kasszát? Két perc, és sokat segít: ${USED_BY_URL}`] : []),
    '',
  ].join('\n')
}

export interface DoctorReportMeta {
  readonly nodeVersion: string
  readonly platform?: string | undefined
}

export function formatDoctorReport(checks: readonly DoctorCheck[], meta: DoctorReportMeta): string {
  return [
    '## kassza doctor jelentés',
    '',
    `- kassza: ${KASSZA_VERSION}`,
    `- Node.js: ${meta.nodeVersion}`,
    ...(meta.platform ? [`- platform: ${meta.platform}`] : []),
    '',
    '| Ellenőrzés | Állapot | Eredmény |',
    '| --- | --- | --- |',
    ...checks.map(
      (entry) => `| ${entry.id} | ${entry.status} | ${entry.message.replace(/\|/g, '\\|')} |`,
    ),
    '',
    summary(checks),
    '',
    'A jelentés nem tartalmaz Agent kulcsot, vevői adatot vagy bizonylattartalmat. Átadás előtt nézd át.',
    '',
  ].join('\n')
}
