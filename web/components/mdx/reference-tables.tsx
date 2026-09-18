import { AGENT_ACTIONS, AGENT_ERROR_CODES, type SzamlazzErrorCategory } from 'kassza'
import { SZAMLAZZ_OUTBOUND_IPS } from 'kassza/ipn'
import { NUMERIC_VAT_RATES, SPECIAL_VAT_CODES } from 'kassza/money'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

const CATEGORY_TONES: Readonly<Record<SzamlazzErrorCategory, string>> = {
  auth: 'border-danger-border bg-danger-bg text-danger-ink',
  account: 'border-warning-border bg-warning-bg text-warning-ink',
  validation: 'border-info-border bg-info-bg text-info-ink',
  duplicate: 'border-warning-border bg-warning-bg text-warning-ink',
  partial_success: 'border-tip-border bg-tip-bg text-tip-ink',
  not_found: 'border-note-border bg-note-bg text-note-ink',
  maintenance: 'border-note-border bg-note-bg text-note-ink',
  network: 'border-note-border bg-note-bg text-note-ink',
  timeout: 'border-note-border bg-note-bg text-note-ink',
  configuration: 'border-danger-border bg-danger-bg text-danger-ink',
  unexpected_response: 'border-danger-border bg-danger-bg text-danger-ink',
  unknown: 'border-note-border bg-note-bg text-note-ink',
}

function Category({ value }: { value: SzamlazzErrorCategory }) {
  return (
    <code
      className={cn(
        'rounded-full border px-2 py-0.5 font-mono text-[0.72rem] whitespace-nowrap',
        CATEGORY_TONES[value],
      )}
    >
      {value}
    </code>
  )
}

function Table({ head, children }: { head: readonly string[]; children: ReactNode }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function ErrorCodeTable() {
  const rows = Object.entries(AGENT_ERROR_CODES).sort(([a], [b]) => Number(a) - Number(b))
  return (
    <Table head={['Kód', 'Kategória', 'Jelentés', 'Mit tegyél?']}>
      {rows.map(([code, info]) => (
        <tr key={code} id={`hibakod-${code}`}>
          <td className="tnum font-mono font-semibold">{code}</td>
          <td>
            <Category value={info.category} />
          </td>
          <td>{info.message}</td>
          <td className="text-ink-2">{info.hint ?? '–'}</td>
        </tr>
      ))}
    </Table>
  )
}

const CATEGORY_ROWS: readonly (readonly [SzamlazzErrorCategory, string, string])[] = [
  [
    'validation',
    'Hibás adat: a kassza a kérés előtt utasította el, vagy a Számlázz.hu nem fogadta el.',
    'Nem. Javítsd a bemenetet.',
  ],
  [
    'duplicate',
    'A rendelésszám vagy a hívásazonosító már foglalt, a bizonylat valószínűleg létezik.',
    'Nem. Kérdezd le a meglévőt.',
  ],
  [
    'partial_success',
    'A bizonylat elkészült, csak egy mellékhatás (az e-mail) hiúsult meg.',
    'Soha. Ne állítsd ki újra.',
  ],
  ['not_found', 'Nincs ilyen bizonylat.', 'Nem.'],
  [
    'auth',
    'Hibás Agent kulcs, vagy böngészős bejelentkezés zavarja az Agentet.',
    'Nem. Javítsd a hitelesítést.',
  ],
  [
    'account',
    'Előfizetés, e-számla vagy fiókbeállítás miatti hiba, embernek kell beavatkoznia.',
    'Nem.',
  ],
  [
    'maintenance',
    'A Számlázz.hu karbantart (1-es kód).',
    'Lekérdezésnél a kassza magától újrapróbál.',
  ],
  [
    'network',
    'Hálózati hiba vagy 5xx válasz. Írásnál a kimenet bizonytalan.',
    'Lekérdezésnél igen. Írásnál előbb keress rendelésszámra.',
  ],
  [
    'timeout',
    'Nem jött válasz az időkorláton belül. Írásnál a kimenet bizonytalan.',
    'Mint a network.',
  ],
  [
    'configuration',
    'Hiányzó vagy hibás kliensbeállítás, például nincs Agent kulcs.',
    'Nem. Javítsd a konfigurációt.',
  ],
  [
    'unexpected_response',
    'A Számlázz.hu ismeretlen formátumban válaszolt.',
    'Nem. Jelentsd a hibát.',
  ],
  ['unknown', 'Kód nélküli vagy ismeretlen kódú hiba a Számlázz.hu-tól.', 'Nem.'],
]

export function ErrorCategoryTable() {
  return (
    <Table head={['error.category', 'Jelentés', 'Érdemes újrapróbálni?']}>
      {CATEGORY_ROWS.map(([category, meaning, retry]) => (
        <tr key={category}>
          <td>
            <Category value={category} />
          </td>
          <td>{meaning}</td>
          <td className="text-ink-2">{retry}</td>
        </tr>
      ))}
    </Table>
  )
}

const ACTION_ROWS: Readonly<Record<keyof typeof AGENT_ACTIONS, readonly [string, string]>> = {
  createInvoice: ['invoices.create(), invoices.preview()', 'soha'],
  reverseInvoice: ['invoices.reverse()', 'soha'],
  registerPayment: [
    'invoices.registerPayment(), invoices.clearPayments()',
    'csak felülíró (additive: false) hívásnál',
  ],
  getInvoicePdf: ['invoices.getPdf(), verifyCredentials()', 'igen'],
  getInvoiceXml: ['invoices.get(), invoices.find()', 'igen'],
  deleteProforma: ['invoices.deleteProforma()', 'soha'],
  createReceipt: ['receipts.create()', 'csak callId megadásával'],
  reverseReceipt: ['receipts.reverse()', 'csak callId megadásával'],
  getReceipt: ['receipts.get(), receipts.find()', 'igen'],
  sendReceipt: ['receipts.send()', 'soha'],
  queryTaxpayer: ['taxpayer.query()', 'igen'],
}

export function ActionTable() {
  return (
    <Table head={['kassza metódus', 'Agent form mező', 'Automatikus újrapróbálás']}>
      {(Object.keys(AGENT_ACTIONS) as (keyof typeof AGENT_ACTIONS)[]).map((action) => (
        <tr key={action}>
          <td>
            <code>{ACTION_ROWS[action][0]}</code>
          </td>
          <td>
            <code>{AGENT_ACTIONS[action]}</code>
          </td>
          <td>{ACTION_ROWS[action][1]}</td>
        </tr>
      ))}
    </Table>
  )
}

export function OutboundIpTable() {
  return (
    <Table head={['Kimenő IP-cím', 'Mire használd']}>
      {SZAMLAZZ_OUTBOUND_IPS.map((ip) => (
        <tr key={ip}>
          <td className="tnum font-mono">{ip}</td>
          <td>IPN értesítés és egyéb, a Számlázz.hu felől érkező hívás engedélyezése</td>
        </tr>
      ))}
    </Table>
  )
}

const SPECIAL_VAT_MEANINGS: Readonly<Record<(typeof SPECIAL_VAT_CODES)[number], string>> = {
  TAHK: 'Áfa tárgyi hatályán kívül',
  TAM: 'Tárgyi adómentes',
  AAM: 'Alanyi adómentes',
  EUT: 'EU-n belüli termékértékesítés',
  EUKT: 'EU-n kívüli termékértékesítés',
  'F.AFA': 'Fordított adózás',
  'K.AFA': 'Különbözeti adózás',
  HO: 'Harmadik országban teljesített ügylet',
  EUE: 'Másik tagállamban teljesített, nem fordítottan adózó ügylet',
  EUFADE:
    'Másik tagállamban teljesített, fordítottan adózó ügylet, amely nem az Áfa tv. 37. §-a alá tartozik',
  EUFAD37: 'Az Áfa tv. 37. §-a alapján másik tagállamban teljesített, fordítottan adózó ügylet',
  ATK: 'Áfa tárgyi hatályán kívüli',
  NAM: 'Adómentesség egyéb nemzetközi ügyletekhez',
  EAM: 'Adómentes termékexport harmadik országba',
  KBAUK: 'Közösségen belüli termékértékesítés (UK)',
  KBAET: 'Közösségen belüli termékértékesítés (ET)',
}

export function VatRateTable() {
  return (
    <>
      <Table head={['vat', 'Jelentés']}>
        {SPECIAL_VAT_CODES.map((code) => (
          <tr key={code}>
            <td>
              <code>'{code}'</code>
            </td>
            <td>{SPECIAL_VAT_MEANINGS[code]}</td>
          </tr>
        ))}
      </Table>
      <p>
        Számként megadható kulcsok:{' '}
        {NUMERIC_VAT_RATES.map((rate, position) => (
          <span key={rate}>
            <code>{rate}</code>
            {position < NUMERIC_VAT_RATES.length - 1 ? ', ' : '.'}
          </span>
        ))}
      </p>
    </>
  )
}

const CURRENCIES: readonly (readonly [string, string])[] = [
  ['HUF', 'forint'],
  ['Ft', 'forint'],
  ['EUR', 'euró'],
  ['USD', 'amerikai dollár'],
  ['CHF', 'svájci frank'],
  ['GBP', 'angol font'],
  ['CZK', 'cseh korona'],
  ['PLN', 'lengyel zloty'],
  ['RON', 'román lej'],
  ['RSD', 'szerb dinár'],
  ['HRK', 'horvát kuna (megszűnt)'],
  ['BGN', 'bolgár leva'],
  ['DKK', 'dán korona'],
  ['NOK', 'norvég korona'],
  ['SEK', 'svéd korona'],
  ['ISK', 'izlandi korona'],
  ['TRY', 'török líra'],
  ['UAH', 'ukrán hrivnya'],
  ['RUB', 'orosz rubel'],
  ['BAM', 'bosnyák konvertibilis márka'],
  ['ALL', 'albán lek'],
  ['AED', 'arab emírségekbeli dirham'],
  ['AUD', 'ausztrál dollár'],
  ['CAD', 'kanadai dollár'],
  ['NZD', 'új-zélandi dollár'],
  ['CNY', 'kínai jüan'],
  ['HKD', 'hongkongi dollár'],
  ['JPY', 'japán jen'],
  ['KRW', 'dél-koreai won'],
  ['SGD', 'szingapúri dollár'],
  ['TWD', 'új tajvani dollár'],
  ['THB', 'thai bát'],
  ['MYR', 'maláj ringgit'],
  ['IDR', 'indonéz rúpia'],
  ['PHP', 'fülöp-szigeteki peso'],
  ['VND', 'vietnámi dong'],
  ['INR', 'indiai rúpia'],
  ['ILS', 'izraeli sékel'],
  ['KWD', 'kuvaiti dinár'],
  ['KZT', 'kazah tenge'],
  ['BRL', 'brazil real'],
  ['MXN', 'mexikói peso'],
  ['ZAR', 'dél-afrikai rand'],
  ['KSH', 'kenyai shilling'],
  ['EEK', 'észt korona (megszűnt)'],
  ['LTL', 'litván litas (megszűnt)'],
  ['LVL', 'lett lat (megszűnt)'],
]

export function CurrencyTable() {
  return (
    <Table head={['currency', 'Pénznem']}>
      {CURRENCIES.map(([code, name]) => (
        <tr key={code}>
          <td>
            <code>'{code}'</code>
          </td>
          <td>{name}</td>
        </tr>
      ))}
    </Table>
  )
}
