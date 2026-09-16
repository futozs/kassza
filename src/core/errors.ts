import type { AgentAction } from './actions'

export type SzamlazzErrorCategory =
  | 'auth'
  | 'account'
  | 'validation'
  | 'duplicate'
  | 'partial_success'
  | 'not_found'
  | 'maintenance'
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
  71: {
    message: 'Már létező rendelésszám.',
    category: 'duplicate',
    hint: 'A fiókban be van kapcsolva a rendelésszám ismétlődés tiltása. Ez a bizonylat valószínűleg már elkészült.',
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
  152: {
    message: 'Már létező rendelésszám.',
    category: 'duplicate',
    hint: 'A fiókban be van kapcsolva a rendelésszám ismétlődés tiltása. Ez a bizonylat valószínűleg már elkészült.',
  },
  164: {
    message: 'A funkciót csak egyetlen fiókhoz hozzáférő felhasználó használhatja.',
    category: 'auth',
    hint: 'Használj Agent kulcsot felhasználónév és jelszó helyett.',
  },
  202: {
    message: 'A megadott számlaszám előtag nem megfelelő.',
    category: 'validation',
    hint: 'Csak a Beállítások / Előtagok menüpontban rögzített előtag használható.',
  },
  250: {
    message: 'A meghatalmazás nincs elfogadva.',
    category: 'account',
    hint: 'A könyvelői vagy aggregátor meghatalmazást a Számlázz.hu felületén kell elfogadni.',
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
  340: { message: 'A kifizetett összeg eltér a bruttó végösszegtől.', category: 'validation' },
  352: {
    message: 'A számla kelte csak a mai nap lehet.',
    category: 'validation',
    hint: 'A dátumot magyar idő (Europe/Budapest) szerint kell megadni, nem UTC szerint.',
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

  constructor(message: string, options: SzamlazzErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.code = options.code
    this.category = options.category
    this.retryable = RETRYABLE_CATEGORIES.has(options.category)
    this.hint = options.hint
    this.action = options.action
    this.httpStatus = options.httpStatus
    this.rawResponse = options.rawResponse
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

export function parseErrorCode(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined
  const trimmed = value.trim()
  if (!/^-?\d+$/.test(trimmed)) return undefined
  return Number(trimmed)
}
