import type { AgentAction } from './actions'

export type SzamlazzErrorCategory =
  | 'auth'
  | 'account'
  | 'validation'
  | 'duplicate'
  | 'partial_success'
  | 'not_found'
  | 'maintenance'
  | 'rate_limit'
  | 'attempt_limit'
  | 'network'
  | 'timeout'
  | 'configuration'
  | 'unexpected_response'
  | 'unknown'

export interface AgentErrorCodeInfo {
  readonly message: string
  readonly category: SzamlazzErrorCategory
  readonly hint?: string
}

const SIMPLE_ITEMS_HINT =
  'Az egyszerűsített számlakép (simpleItems) szabályait lásd a docs utazásszervezőknek szóló oldalán.'
const ITEM_AMOUNT_HINT =
  'Használd a tételeknél a netUnitPrice vagy grossUnitPrice mezőt, és hagyd, hogy a csomag számolja ki az összegeket.'
const RECEIPT_AMOUNT_HINT =
  'Forintos nyugtán a bruttó egész szám, a nettó és az áfa legfeljebb 2 tizedes, és a nettó + áfa pontosan a bruttó.'

export const AGENT_ERROR_CODES: Readonly<Record<number, AgentErrorCodeInfo>> = {
  1: {
    message: 'Rendszerkarbantartás, kérem próbálja meg pár perc múlva.',
    category: 'maintenance',
    hint: 'A Számlázz.hu oldalán van karbantartás, néhány perc múlva próbáld újra.',
  },
  3: {
    message: 'Sikertelen bejelentkezés.',
    category: 'auth',
    hint: 'Ellenőrizd az Agent kulcsot. Csak kisbetűs kulcsot fogad el a rendszer.',
  },
  7: {
    message: 'Hiányzó adat: ismeretlen számlaszám, rendelésszám vagy külső azonosító.',
    category: 'not_found',
  },
  8: {
    message: 'Nincs jogosultság vagy megfelelő díjcsomag a művelet elvégzéséhez.',
    category: 'account',
    hint: 'Az Agentes nyugtakibocsátás a #free csomagban nem érhető el, vagy a felhasználó szerepköre nem engedi. Megbízottként a megbízott díjcsomagja számít.',
  },
  17: {
    message: 'Nem megengedett művelet.',
    category: 'account',
    hint: 'Megbízotti felhasználó például nem ismételhet számlát.',
  },
  49: {
    message: 'A tanúsítvány használatához jelszó szükséges.',
    category: 'account',
    hint: 'Az e-számla tanúsítványához tartozó jelszót a Számlázz.hu felületén kell beállítani.',
  },
  52: {
    message: 'Az áfakulcs nem értelmezhető.',
    category: 'validation',
    hint: 'Használd a VatRate típusban felsorolt áfakulcsok egyikét.',
  },
  53: {
    message: 'Hiányzó XML fájl.',
    category: 'validation',
    hint: 'Az XML-t fájlként kell elküldeni multipart/form-data kérésben.',
  },
  54: {
    message: 'E-számla készítés nincs engedélyezve.',
    category: 'account',
    hint: 'Az előfizetési csomag nem tartalmazza az e-számlát, vagy nincs tanúsítvány. Próbáld eInvoice: false beállítással.',
  },
  55: {
    message: 'E-számla aláírása sikertelen.',
    category: 'account',
    hint: 'A tanúsítvány lejárt, vagy az időbélyeg szerver nem érhető el.',
  },
  56: {
    message: 'A bizonylat elkészült, de az értesítő e-mail kiküldése sikertelen.',
    category: 'partial_success',
    hint: 'NE állítsd ki újra a bizonylatot. Kérdezd le rendelésszám vagy külső azonosító alapján, és küldd ki az e-mailt később.',
  },
  57: {
    message: 'XML beolvasási hiba.',
    category: 'validation',
    hint: 'A küldött XML nem felel meg az XSD-nek. A részleteket a hibaüzenet tartalmazza.',
  },
  68: {
    message: 'Már létezik cég ezzel az adószámmal és számlaszám-előtaggal.',
    category: 'validation',
    hint: 'A megbízói fiók csatlakozásához egyeztess másik megbízotti előtagot a megbízóval.',
  },
  71: {
    message: 'Már létező rendelésszám.',
    category: 'duplicate',
    hint: 'A fiókban be van kapcsolva a rendelésszám ismétlődés tiltása. Ez a bizonylat valószínűleg már elkészült.',
  },
  101: {
    message: 'A bejelentkezési név már foglalt.',
    category: 'validation',
    hint: 'Új megbízói fiók létrehozásakor másik dedikált felhasználói e-mail címet adj meg.',
  },
  135: {
    message: 'Számla Agent futtatásához lépj ki a Számlázz.hu rendszerből a böngészőben.',
    category: 'auth',
  },
  136: {
    message: 'Bejelentkezési hiba, lépj be a Számlázz.hu rendszerébe böngészőn keresztül.',
    category: 'account',
    hint: 'Lejárt előfizetés vagy rendezetlen díj. Ellenőrizd a Szolgáltatáscsomagom menüpontot.',
  },
  137: {
    message: 'Nincs engedély számlázási fiók létrehozására Számla Agenten keresztül.',
    category: 'account',
    hint: 'Az action-agent_ceg_mb interfész engedélyét a Számlázz.hu ügyfélszolgálatán kell kérni, tesztfiókra is.',
  },
  152: {
    message: 'Már létező rendelésszám.',
    category: 'duplicate',
    hint: 'A fiókban be van kapcsolva a rendelésszám ismétlődés tiltása. Ez a bizonylat valószínűleg már elkészült.',
  },
  164: {
    message: 'A funkciót csak egyetlen fiókhoz hozzáférő felhasználó használhatja.',
    category: 'auth',
    hint: 'Használj Agent kulcsot felhasználónév és jelszó helyett. Megbízottként minden megbízóhoz külön dedikált felhasználó kell.',
  },
  167: {
    message: 'A tesztfiókban túllépted a rövid idő alatt kiállítható bizonylatok számát.',
    category: 'rate_limit',
    hint: 'Tesztfiókban legfeljebb 500 bizonylat készíthető 10 percenként. Várj néhány percet, ne próbáld újra automatikusan.',
  },
  200: {
    message: 'Ezt az előtagot ugyanezzel az adószámmal egy másik számlázási fiók használja.',
    category: 'validation',
    hint: 'Válassz másik előtagot.',
  },
  202: {
    message: 'A megadott számlaszám előtag nem megfelelő.',
    category: 'validation',
    hint: 'Csak a Beállítások / Előtagok menüpontban rögzített és engedélyezett előtag használható.',
  },
  250: {
    message:
      'A fiók nem használható, mert a fiókgazda még nem vette birtokba, vagy a meghatalmazás nincs elfogadva.',
    category: 'account',
    hint: 'Megbízotti kapcsolatnál a megbízónak birtokba kell vennie a fiókot. Könyvelői vagy aggregátor meghatalmazást a Számlázz.hu felületén kell elfogadni.',
  },
  259: {
    message: 'A tétel nettó értéke nem megfelelő.',
    category: 'validation',
    hint: ITEM_AMOUNT_HINT,
  },
  260: {
    message: 'A tétel áfa értéke nem megfelelő.',
    category: 'validation',
    hint: ITEM_AMOUNT_HINT,
  },
  261: {
    message: 'A tétel bruttó értéke nem megfelelő.',
    category: 'validation',
    hint: ITEM_AMOUNT_HINT,
  },
  262: {
    message: 'A tétel nettó értéke nem megfelelő.',
    category: 'validation',
    hint: ITEM_AMOUNT_HINT,
  },
  263: {
    message: 'A tétel áfa értéke nem megfelelő.',
    category: 'validation',
    hint: ITEM_AMOUNT_HINT,
  },
  264: {
    message: 'A tétel bruttó értéke nem megfelelő.',
    category: 'validation',
    hint: ITEM_AMOUNT_HINT,
  },
  335: { message: 'A hivatkozott díjbekérő nem található.', category: 'not_found' },
  336: {
    message: 'A nyugta előtag már számlákhoz használatban van.',
    category: 'validation',
    hint: 'Nyugtához olyan előtag kell, amit számlán még nem használtál.',
  },
  337: {
    message: 'A nyugta előtag formátuma hibás.',
    category: 'validation',
    hint: 'Az előtag csak nagybetűt és számot tartalmazhat.',
  },
  338: {
    message: 'A hívásazonosító már létezik.',
    category: 'duplicate',
    hint: 'Ezzel a callId-val már készült nyugta, kérdezd le a meglévőt.',
  },
  339: { message: 'A nyugtaszám nem létezik.', category: 'not_found' },
  309: {
    message: 'Érvénytelen adat.',
    category: 'validation',
    hint: 'Ellenőrizd a hibaüzenetben megnevezett mezőt, adószámnál előtte a taxpayer.query() hívással.',
  },
  340: { message: 'A kifizetett összeg eltér a bruttó végösszegtől.', category: 'validation' },
  352: {
    message: 'A számla kelte csak a mai nap lehet.',
    category: 'validation',
    hint: 'A dátumot magyar idő (Europe/Budapest) szerint kell megadni, nem UTC szerint.',
  },
  353: {
    message: 'Nincs egyetlen érvényes számlaszám-előtag sem.',
    category: 'account',
    hint: 'A Beállítások / Előtagok oldalon hozz létre vagy engedélyezz egy előtagot.',
  },
  354: {
    message: 'Ez a számlaszám-előtag nem használható.',
    category: 'validation',
    hint: 'Megbízottként csak a megbízóval egyeztetett, a cégedhez kötött előtagot használhatod.',
  },
  356: {
    message: 'A megadott számlaszám-előtag helyett másikat kell használni.',
    category: 'validation',
    hint: 'A hibaüzenet megnevezi a használandó előtagot, a suggestedPrefix() kiolvassa.',
  },
  357: {
    message: 'Add meg a számlaszám-előtagot.',
    category: 'validation',
    hint: 'Megbízotti számlázásnál mindig küldd el az egyeztetett előtagot (prefix).',
  },
  358: {
    message: 'Ezt a számlát csak a fiók tulajdonosa sztornózhatja.',
    category: 'account',
  },
  359: {
    message:
      'Ez a számla megbízott számlakibocsátás keretében készült, a sztornót a megbízott végezheti.',
    category: 'account',
  },
  360: {
    message: 'Az előtag nem módosítható, mert már készült vele bizonylat.',
    category: 'validation',
    hint: 'Hozz létre új számlatömböt új előtaggal.',
  },
  362: {
    message: 'Ezt az előtagot ez az adószám korábban már használta.',
    category: 'validation',
    hint: 'Válassz másik előtagot.',
  },
  363: {
    message: 'A tétel bruttó értékének egész számnak kell lennie.',
    category: 'validation',
    hint: RECEIPT_AMOUNT_HINT,
  },
  364: {
    message: 'A tétel nettó értéke maximum 2 tizedes jegyet tartalmazhat.',
    category: 'validation',
    hint: RECEIPT_AMOUNT_HINT,
  },
  365: {
    message: 'A tétel áfa értéke maximum 2 tizedes jegyet tartalmazhat.',
    category: 'validation',
    hint: RECEIPT_AMOUNT_HINT,
  },
  395: {
    message: 'Érvénytelen áfakulcs.',
    category: 'validation',
    hint: 'Használd a VatRate típusban felsorolt áfakulcsok egyikét.',
  },
  396: {
    message: 'A megadott dátum túl korai.',
    category: 'validation',
    hint: 'A kelte és a teljesítés dátuma nem lehet a lezárt időszakban.',
  },
  489: {
    message:
      'Ez a számla megbízott számlakibocsátás keretében készült, az ismétlést a megbízott végezheti.',
    category: 'account',
  },
  491: {
    message: 'Új kata adónem mellett vállalkozás felé nem állítható ki bizonylat.',
    category: 'account',
    hint: 'A fiókban bekapcsolt KATA-védelem tiltja. Hagyd el a vevő adószámát, vagy kapcsold ki a védelmet a saját felelősségedre.',
  },
  493: {
    message: 'Ezt a számlát csak a fiók tulajdonosa helyesbítheti.',
    category: 'account',
  },
  494: {
    message:
      'Ez a számla megbízott számlakibocsátás keretében készült, a helyesbítést a megbízott végezheti.',
    category: 'account',
  },
  506: {
    message: 'A jelszó túl rövid.',
    category: 'validation',
    hint: 'A dedikált felhasználó jelszava legalább 8 karakter legyen.',
  },
  507: {
    message: 'A jelszó túl hosszú.',
    category: 'validation',
    hint: 'A dedikált felhasználó jelszava legfeljebb 128 karakter lehet.',
  },
  524: {
    message: 'A nyugtaszám-előtag nincs engedélyezve.',
    category: 'account',
    hint: 'A Beállítások / Előtagok oldalon engedélyezd az előtag használatát. Meglévő nyugta sztornója ettől még működik.',
  },
  537: { message: 'Egy tételhez legfeljebb 400 adattörlő kód adható.', category: 'validation' },
  538: { message: 'Adattörlő kód demo- és tesztfiókban nem használható.', category: 'account' },
  539: {
    message: 'Nincs bekapcsolva az adattörlő kód használata.',
    category: 'account',
    hint: 'A számlázási beállításokban kapcsold be az adattörlő kódot.',
  },
  551: {
    message: 'Egyszerűsített számlakép OSS vagy nem magyar adószám mellett nem használható.',
    category: 'validation',
    hint: SIMPLE_ITEMS_HINT,
  },
  552: {
    message: 'Egyszerűsített számlaképen legfeljebb két tétel adható meg.',
    category: 'validation',
    hint: SIMPLE_ITEMS_HINT,
  },
  553: {
    message: 'Egyszerűsített számlakép esetén érvénytelen adókulcs.',
    category: 'validation',
    hint: SIMPLE_ITEMS_HINT,
  },
  554: {
    message: 'Egyszerűsített számlaképű számla nem helyesbíthető.',
    category: 'validation',
    hint: SIMPLE_ITEMS_HINT,
  },
  555: {
    message: 'Egyszerűsített számlaképen a tételek áfakulcsai nem különbözhetnek.',
    category: 'validation',
    hint: SIMPLE_ITEMS_HINT,
  },
  556: {
    message: 'Egyszerűsített számlakép szállítólevélen és helyesbítő számlán nem használható.',
    category: 'validation',
    hint: SIMPLE_ITEMS_HINT,
  },
}

const RETRYABLE_CATEGORIES: ReadonlySet<SzamlazzErrorCategory> = new Set([
  'maintenance',
  'network',
  'timeout',
])

export interface SzamlazzErrorOptions {
  readonly category: SzamlazzErrorCategory
  readonly code?: number | undefined
  readonly hint?: string | undefined
  readonly action?: AgentAction | undefined
  readonly httpStatus?: number | undefined
  readonly rawResponse?: string | undefined
  readonly details?: Readonly<Record<string, string>> | undefined
  readonly cause?: unknown
}

export class SzamlazzError extends Error {
  override readonly name: string = 'SzamlazzError'
  readonly code: number | undefined
  readonly category: SzamlazzErrorCategory
  readonly retryable: boolean
  readonly hint: string | undefined
  readonly action: AgentAction | undefined
  readonly httpStatus: number | undefined
  readonly rawResponse: string | undefined
  readonly details: Readonly<Record<string, string>> | undefined

  constructor(message: string, options: SzamlazzErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.code = options.code
    this.category = options.category
    this.retryable = RETRYABLE_CATEGORIES.has(options.category)
    this.hint = options.hint
    this.action = options.action
    this.httpStatus = options.httpStatus
    this.rawResponse = options.rawResponse
    this.details = options.details
  }

  get isDuplicate(): boolean {
    return this.category === 'duplicate'
  }

  get isNotFound(): boolean {
    return this.category === 'not_found'
  }
}

export function isSzamlazzError(error: unknown): error is SzamlazzError {
  return error instanceof SzamlazzError
}

export interface AgentErrorInput {
  readonly code?: number | undefined
  readonly message?: string | undefined
  readonly action?: AgentAction | undefined
  readonly httpStatus?: number | undefined
  readonly rawResponse?: string | undefined
}

export function createAgentError(input: AgentErrorInput): SzamlazzError {
  const info = input.code === undefined ? undefined : AGENT_ERROR_CODES[input.code]
  const message =
    input.message?.trim() || info?.message || 'Ismeretlen hiba a Számlázz.hu válaszában.'
  const prefix = input.code === undefined ? '' : `[${input.code}] `
  return new SzamlazzError(`${prefix}${message}`, {
    category: info?.category ?? 'unknown',
    code: input.code,
    hint: info?.hint,
    action: input.action,
    httpStatus: input.httpStatus,
    rawResponse: input.rawResponse,
  })
}

const SUGGESTED_PREFIX_PATTERN = /haszn[áa]ld ezt:\s*\(?\s*([A-Z0-9]+)\s*\)?/i

export function suggestedPrefix(error: unknown): string | undefined {
  if (!(error instanceof SzamlazzError) || error.code !== 356) return undefined
  return SUGGESTED_PREFIX_PATTERN.exec(error.message)?.[1]?.toUpperCase()
}

export function parseErrorCode(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined
  const trimmed = value.trim()
  if (!/^-?\d+$/.test(trimmed)) return undefined
  return Number(trimmed)
}
