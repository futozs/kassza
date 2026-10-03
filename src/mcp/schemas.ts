import { INVOICE_LANGUAGES } from '../invoices/create-types'
import { MAX_TOOL_ITEMS, MCP_INVOICE_TYPES } from './inputs'
import type { JsonObject } from './protocol'

const TEXT: JsonObject = { type: 'string', minLength: 1 }

const DATE: JsonObject = {
  type: 'string',
  pattern: '^\\d{4}-\\d{2}-\\d{2}$',
  description: 'Dátum ÉÉÉÉ-HH-NN formában (Europe/Budapest szerint).',
}

const VAT: JsonObject = {
  description:
    'Áfakulcs: szám (például 27, 18, 5, 0) vagy kód (például "AAM" alanyi adómentes, "TAM" tárgyi adómentes, "EUT", "EUKT", "F.AFA", "K.AFA"). Nyugtán "ÁKK", "MAA", "EU" és "EUK" is lehet.',
  anyOf: [{ type: 'number' }, { type: 'string', minLength: 1 }],
}

const ITEM: JsonObject = {
  type: 'object',
  properties: {
    name: { ...TEXT, description: 'A tétel megnevezése.' },
    quantity: { type: 'number', description: 'Mennyiség, alapértelmezés: 1.' },
    unit: { ...TEXT, description: 'Mennyiségi egység, például db, óra.' },
    netUnitPrice: {
      type: 'number',
      description:
        'Nettó egységár. A netUnitPrice és a grossUnitPrice közül pontosan egyet adj meg.',
    },
    grossUnitPrice: {
      type: 'number',
      description:
        'Bruttó egységár. A netUnitPrice és a grossUnitPrice közül pontosan egyet adj meg.',
    },
    vat: VAT,
    comment: { ...TEXT, description: 'Megjegyzés a tételhez.' },
  },
  required: ['name', 'vat'],
  additionalProperties: false,
}

const ITEMS: JsonObject = { type: 'array', items: ITEM, minItems: 1, maxItems: MAX_TOOL_ITEMS }

const BUYER: JsonObject = {
  type: 'object',
  properties: {
    name: { ...TEXT, description: 'A vevő neve.' },
    zip: { ...TEXT, description: 'Irányítószám.' },
    city: { ...TEXT, description: 'Település.' },
    address: { ...TEXT, description: 'Utca, házszám.' },
    country: { ...TEXT, description: 'Ország, ha nem Magyarország.' },
    email: { ...TEXT, description: 'A vevő e-mail címe.' },
    taxNumber: { ...TEXT, description: 'Magyar adószám, például 12345676-2-42.' },
    euTaxNumber: { ...TEXT, description: 'Közösségi adószám, például HU12345676.' },
  },
  required: ['name', 'zip', 'city', 'address'],
  additionalProperties: false,
}

const COMMON_DOCUMENT_PROPERTIES: Readonly<Record<string, JsonObject>> = {
  paymentMethod: { ...TEXT, description: 'Fizetési mód, például átutalás, készpénz, bankkártya.' },
  currency: { ...TEXT, description: 'Pénznem, alapértelmezés: HUF.' },
  exchangeRate: { type: 'number', description: 'Árfolyam devizás bizonylathoz.' },
  exchangeBank: { ...TEXT, description: 'Az árfolyamot jegyző bank, például MNB.' },
  comment: { ...TEXT, description: 'Megjegyzés a bizonylaton.' },
  orderNumber: { ...TEXT, description: 'Rendelésszám (a bizonylaton megjelenik).' },
  prefix: { ...TEXT, description: 'A Számlázz.hu fiókban rögzített előtag.' },
}

export function objectSchema(
  properties: Readonly<Record<string, JsonObject>>,
  required: readonly string[] = [],
): JsonObject {
  return { type: 'object', properties, required: [...required], additionalProperties: false }
}

const INVOICE_PROPERTIES: Readonly<Record<string, JsonObject>> = {
  type: {
    type: 'string',
    enum: [...MCP_INVOICE_TYPES],
    description: 'invoice (számla, alapértelmezés) vagy proforma (díjbekérő).',
  },
  buyer: BUYER,
  items: ITEMS,
  ...COMMON_DOCUMENT_PROPERTIES,
  language: { type: 'string', enum: [...INVOICE_LANGUAGES], description: 'A számla nyelve.' },
  issueDate: { ...DATE, description: 'Kelt, alapértelmezés: ma.' },
  fulfillmentDate: { ...DATE, description: 'Teljesítés dátuma, alapértelmezés: ma.' },
  dueDate: { ...DATE, description: 'Fizetési határidő.' },
  externalId: {
    ...TEXT,
    description:
      'Saját külső azonosító. Ha megadod, ugyanezzel csak egy számla készül; ha nem, a kassza képez egyet.',
  },
  paid: { type: 'boolean', description: 'A számla már ki van fizetve.' },
  eInvoice: { type: 'boolean', description: 'Elektronikus számla.' },
  sendEmail: {
    type: 'boolean',
    description: 'A Számlázz.hu e-mailben elküldi-e a vevőnek. Alapértelmezés: false.',
  },
}

const RECEIPT_PROPERTIES: Readonly<Record<string, JsonObject>> = {
  items: ITEMS,
  payments: {
    type: 'array',
    description: 'Kifizetések fizetőeszközönként; az összegük a nyugta bruttó végösszege.',
    items: objectSchema(
      {
        method: { ...TEXT, description: 'Fizetőeszköz, például készpénz, bankkártya.' },
        amount: { type: 'number' },
        description: TEXT,
      },
      ['method', 'amount'],
    ),
  },
  ...COMMON_DOCUMENT_PROPERTIES,
}

export const CONFIRMATION_PROPERTY: JsonObject = {
  ...TEXT,
  description:
    'Az előnézeti eszköz által adott megerősítő kód. Csak azután add meg, hogy a felhasználó jóváhagyta az előnézetet.',
}

export const TEXT_PROPERTY: JsonObject = TEXT

export const INVOICE_SCHEMA: JsonObject = objectSchema(INVOICE_PROPERTIES, ['buyer', 'items'])

export const CREATE_INVOICE_SCHEMA: JsonObject = objectSchema(
  { ...INVOICE_PROPERTIES, confirmation: CONFIRMATION_PROPERTY },
  ['buyer', 'items', 'confirmation'],
)

export const RECEIPT_SCHEMA: JsonObject = objectSchema(RECEIPT_PROPERTIES, ['items'])

export const CREATE_RECEIPT_SCHEMA: JsonObject = objectSchema(
  { ...RECEIPT_PROPERTIES, confirmation: CONFIRMATION_PROPERTY },
  ['items', 'confirmation'],
)
