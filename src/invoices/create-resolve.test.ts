import { describe, expect, test } from 'vitest'
import { FAKE_PDF_BYTES } from '../../tests/helpers'
import type { AgentAttachment } from '../core/context'
import { SzamlazzError } from '../core/errors'
import { MAX_ATTACHMENT_BYTES, presentText, resolveInvoice } from './create-resolve'
import type { CreateInvoiceInput, InvoiceDefaults, InvoiceItemInput } from './create-types'
import { buildCreateInvoiceXml } from './create-xml'

const NOW = new Date('2026-09-16T10:00:00Z')

const BUYER = { name: 'Vevő Kft.', zip: '1234', city: 'Budapest', address: 'Fő utca 1.' }
const ITEM: InvoiceItemInput = { name: 'Termék', netUnitPrice: 1000, vat: 27 }
const BASE: CreateInvoiceInput = { buyer: BUYER, items: [ITEM] }

function resolve(
  input: unknown,
  defaults: InvoiceDefaults = {},
): ReturnType<typeof resolveInvoice> {
  return resolveInvoice(defaults, input as CreateInvoiceInput, NOW)
}

function validationError(input: unknown, defaults: InvoiceDefaults = {}): SzamlazzError {
  try {
    resolve(input, defaults)
  } catch (error) {
    expect(error).toBeInstanceOf(SzamlazzError)
    expect(error).toMatchObject({ category: 'validation', retryable: false })
    return error as SzamlazzError
  }
  throw new Error('Validációs hibát vártunk')
}

describe('resolveInvoice validáció', () => {
  test.each([
    ['name', /buyer\.name/],
    ['zip', /buyer\.zip/],
    ['city', /buyer\.city/],
    ['address', /buyer\.address/],
  ])('üres vevő %s mezőre hibát dob', (field, message) => {
    expect(validationError({ ...BASE, buyer: { ...BUYER, [field]: '  ' } }).message).toMatch(
      message,
    )
  })

  test('hiányzó vevőre hibát dob', () => {
    expect(validationError({ items: [ITEM] }).message).toMatch(/buyer/)
  })

  test('tétel nélkül hibát dob', () => {
    expect(validationError({ ...BASE, items: [] }).message).toMatch(/legalább egy tétel/)
    expect(validationError({ buyer: BUYER }).message).toMatch(/legalább egy tétel/)
  })

  test('üres tételnévre és üres mennyiségi egységre hibát dob', () => {
    expect(validationError({ ...BASE, items: [{ ...ITEM, name: '' }] }).message).toMatch(
      /1\. tétel megnevezése/,
    )
    expect(validationError({ ...BASE, items: [ITEM, { ...ITEM, unit: ' ' }] }).message).toMatch(
      /2\. tétel mennyiségi egysége/,
    )
  })

  test('a tételszámítási hibát a tétel sorszámával és nevével egészíti ki', () => {
    const error = validationError({ ...BASE, items: [{ name: 'Rossz', vat: 27 }] })

    expect(error.message).toMatch(/^1\. tétel \(Rossz\): /)
    expect(error.cause).toBeInstanceOf(SzamlazzError)
  })

  test('nem SzamlazzError tételszámítási hibát is validációs hibává alakít', () => {
    const error = validationError({
      ...BASE,
      items: [{ name: 'Rossz', netUnitPrice: 1e308, vat: 27, quantity: 10 }],
    })

    expect(error.message).toMatch(/^1\. tétel \(Rossz\)/)
    expect(error.cause).toBeInstanceOf(RangeError)
  })

  test('érvénytelen adattörlő kódra és árrés áfa alapra hibát dob', () => {
    expect(
      validationError({ ...BASE, items: [{ ...ITEM, dataDeletionCode: -1 }] }).message,
    ).toMatch(/dataDeletionCode/)
    expect(
      validationError({ ...BASE, items: [{ ...ITEM, dataDeletionCode: 1.5 }] }).message,
    ).toMatch(/dataDeletionCode/)
    expect(
      validationError({ ...BASE, items: [{ ...ITEM, marginVatBase: Number.NaN }] }).message,
    ).toMatch(/marginVatBase/)
  })

  test('ismeretlen bizonylattípusra, nyelvre és sablonra hibát dob', () => {
    expect(validationError({ ...BASE, type: 'storno' }).message).toMatch(/bizonylattípus/)
    expect(validationError({ ...BASE, language: 'xx' }).message).toMatch(/számlanyelv/)
    expect(validationError({ ...BASE, template: 'Valami' }).message).toMatch(/számlasablon/)
  })

  test('helyesbítő számlát a helyesbített számla száma nélkül nem enged', () => {
    expect(validationError({ ...BASE, type: 'corrective' }).message).toMatch(
      /correctedInvoiceNumber/,
    )
    expect(
      validationError({ ...BASE, type: 'corrective', correctedInvoiceNumber: ' ' }).message,
    ).toMatch(/correctedInvoiceNumber/)
  })

  test('végszámlát előlegszámla-szám és rendelésszám nélkül nem enged', () => {
    expect(validationError({ ...BASE, type: 'final' }).message).toMatch(/advanceInvoiceNumber/)
    expect(resolve({ ...BASE, type: 'final', orderNumber: 'R-1' }).type).toBe('final')
    expect(resolve({ ...BASE, type: 'final', advanceInvoiceNumber: 'E-1' }).type).toBe('final')
  })

  test('forintos számlán árfolyamot nem enged', () => {
    expect(validationError({ ...BASE, exchangeRate: 400 }).message).toMatch(/Forintos/)
    expect(validationError({ ...BASE, currency: 'Ft', exchangeBank: 'MNB' }).message).toMatch(
      /Forintos/,
    )
  })

  test('devizás számlán csak pozitív árfolyamot enged', () => {
    expect(validationError({ ...BASE, currency: 'EUR', exchangeRate: 0 }).message).toMatch(
      /pozitív/,
    )
    expect(
      validationError({ ...BASE, currency: 'EUR', exchangeRate: Number.POSITIVE_INFINITY }).message,
    ).toMatch(/pozitív/)
  })

  test('nem MNB bank esetén kötelező az árfolyam', () => {
    expect(validationError({ ...BASE, currency: 'EUR', exchangeBank: 'OTP' }).message).toMatch(
      /exchangeRate/,
    )
    expect(
      validationError({ ...BASE, currency: 'EUR' }, { exchangeBank: 'Erste' }).message,
    ).toMatch(/exchangeRate/)
    expect(resolve({ ...BASE, currency: 'EUR', exchangeBank: 'mnb' }).exchangeBank).toBe('mnb')
    expect(
      resolve({ ...BASE, currency: 'EUR', exchangeBank: 'OTP', exchangeRate: 1 }),
    ).toMatchObject({ exchangeBank: 'OTP', exchangeRate: 1 })
  })

  test('a dueDate és a paymentDueInDays együtt nem adható meg', () => {
    expect(
      validationError({ ...BASE, dueDate: '2026-10-01', paymentDueInDays: 8 }).message,
    ).toMatch(/dueDate/)
  })

  test('negatív vagy tört fizetési határnapra hibát dob', () => {
    expect(validationError({ ...BASE, paymentDueInDays: -1 }).message).toMatch(/paymentDueInDays/)
    expect(validationError(BASE, { paymentDueInDays: 1.5 }).message).toMatch(/paymentDueInDays/)
  })

  test('érvénytelen dátumokra validációs hibát dob', () => {
    expect(validationError({ ...BASE, issueDate: '2026-02-30' }).message).toMatch(/issueDate/)
    expect(validationError({ ...BASE, fulfillmentDate: '16.09.2026' }).message).toMatch(
      /fulfillmentDate/,
    )
    expect(validationError({ ...BASE, dueDate: new Date('x') }).message).toMatch(/dueDate/)
    expect(() =>
      buildCreateInvoiceXml(
        [],
        {},
        { ...BASE, buyer: { ...BUYER, ledger: { bookingDate: 'tegnap' } } },
        NOW,
      ),
    ).toThrow(expect.objectContaining({ category: 'validation' }))
    expect(() =>
      buildCreateInvoiceXml(
        [],
        {},
        { ...BASE, items: [{ ...ITEM, ledger: { settlementPeriodEnd: '2026-13-01' } }] },
        NOW,
      ),
    ).toThrow(/1\. tétel ledger settlementPeriodEnd/)
  })

  test('nem véges fizetendő korrekcióra hibát dob', () => {
    expect(validationError({ ...BASE, paymentCorrection: Number.NaN }).message).toMatch(
      /paymentCorrection/,
    )
  })

  test('bekapcsolt sendEmail mellett e-mail cím nélkül hibát dob', () => {
    expect(validationError({ ...BASE, buyer: { ...BUYER, sendEmail: true } }).message).toMatch(
      /e-mail/,
    )
  })

  describe('mellékletek', () => {
    const withEmail = { ...BASE, buyer: { ...BUYER, email: 'a@b.hu' } }
    const attachment: AgentAttachment = { filename: 'a.pdf', content: FAKE_PDF_BYTES }

    test('legfeljebb 5 mellékletet enged', () => {
      const attachments = Array.from({ length: 6 }, () => attachment)

      expect(validationError({ ...withEmail, attachments }).message).toMatch(/Legfeljebb 5/)
      expect(
        resolve({ ...withEmail, attachments: attachments.slice(0, 5) }).attachments,
      ).toHaveLength(5)
    })

    test('e-mail küldés nélkül nem enged mellékletet', () => {
      expect(validationError({ ...BASE, attachments: [attachment] }).message).toMatch(/e-mail/)
      expect(
        validationError({
          ...withEmail,
          buyer: { ...withEmail.buyer, sendEmail: false },
          attachments: [attachment],
        }).message,
      ).toMatch(/sendEmail/)
    })

    test('üres fájlnevet nem enged', () => {
      expect(
        validationError({ ...withEmail, attachments: [{ ...attachment, filename: '' }] }).message,
      ).toMatch(/fájlneve/)
    })

    test.each([
      ['Uint8Array', new Uint8Array(MAX_ATTACHMENT_BYTES + 1)],
      ['ArrayBuffer', new ArrayBuffer(MAX_ATTACHMENT_BYTES + 1)],
      ['Blob', new Blob([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)])],
      ['string', 'á'.repeat(MAX_ATTACHMENT_BYTES / 2 + 1)],
    ])('2 MB-nál nagyobb %s mellékletet nem enged', (_kind, content) => {
      expect(
        validationError({ ...withEmail, attachments: [{ filename: 'nagy.bin', content }] }).message,
      ).toMatch(/2 MB/)
    })

    test('a pont 2 MB-os mellékletet elfogadja', () => {
      const content = new Uint8Array(MAX_ATTACHMENT_BYTES)

      expect(
        resolve({ ...withEmail, attachments: [{ filename: 'ok.bin', content }] }).attachments,
      ).toHaveLength(1)
    })
  })

  describe('egyszerűsített számlakép (simpleItems)', () => {
    test('legfeljebb 2 tételt enged, végszámlánál 4-et', () => {
      const three = [ITEM, ITEM, ITEM]
      const five = [ITEM, ITEM, ITEM, ITEM, ITEM]

      expect(validationError({ ...BASE, simpleItems: true, items: three }).message).toMatch(
        /legfeljebb 2/,
      )
      expect(validationError({ ...BASE, items: three }, { simpleItems: true }).message).toMatch(
        /legfeljebb 2/,
      )
      expect(
        resolve({ ...BASE, type: 'final', orderNumber: 'R', simpleItems: true, items: three })
          .items,
      ).toHaveLength(3)
      expect(
        validationError({
          ...BASE,
          type: 'final',
          orderNumber: 'R',
          simpleItems: true,
          items: five,
        }).message,
      ).toMatch(/legfeljebb 4/)
    })

    test('csak magyar áfakulcsokat enged', () => {
      expect(
        validationError({ ...BASE, simpleItems: true, items: [{ ...ITEM, vat: 'EUFADE' }] })
          .message,
      ).toMatch(/EUFADE/)
      for (const vat of [0, 5, 18, 27, 'TAM', 'AAM', 'K.AFA', 'F.AFA'] as const) {
        expect(resolve({ ...BASE, simpleItems: true, items: [{ ...ITEM, vat }] }).simpleItems).toBe(
          true,
        )
      }
    })

    test('helyesbítő számlán és szállítólevélen nem enged', () => {
      expect(
        validationError({
          ...BASE,
          type: 'corrective',
          correctedInvoiceNumber: 'A-1',
          simpleItems: true,
        }).message,
      ).toMatch(/helyesbítő/)
      expect(validationError({ ...BASE, type: 'deliveryNote', simpleItems: true }).message).toMatch(
        /szállítólevél/,
      )
    })

    test('az input simpleItems: false felülírja az alapértéket', () => {
      expect(
        resolve({ ...BASE, simpleItems: false, items: [ITEM, ITEM, ITEM] }, { simpleItems: true })
          .simpleItems,
      ).toBe(false)
    })
  })

  describe('fuvarlevél', () => {
    test('a csomagszám nemnegatív egész legyen', () => {
      expect(
        validationError({ ...BASE, waybill: { transOFlex: { packageCount: 1.5 } } }).message,
      ).toMatch(/transOFlex\.packageCount/)
      expect(
        validationError({ ...BASE, waybill: { sprinter: { packageCount: -2 } } }).message,
      ).toMatch(/sprinter\.packageCount/)
    })

    test('MPL fuvarlevélnél a vevőkód, a vonalkód és a tömeg kötelező', () => {
      const mpl = { customerCode: 'C', barcode: 'B', weight: '2' }

      expect(
        validationError({ ...BASE, waybill: { mpl: { ...mpl, customerCode: '' } } }).message,
      ).toMatch(/customerCode/)
      expect(
        validationError({ ...BASE, waybill: { mpl: { ...mpl, barcode: '' } } }).message,
      ).toMatch(/barcode/)
      expect(
        validationError({ ...BASE, waybill: { mpl: { ...mpl, weight: undefined } } }).message,
      ).toMatch(/weight/)
      expect(
        validationError({ ...BASE, waybill: { mpl: { ...mpl, declaredValue: Number.NaN } } })
          .message,
      ).toMatch(/declaredValue/)
      expect(resolve({ ...BASE, waybill: { mpl } }).input.waybill?.mpl).toEqual(mpl)
    })
  })
})

describe('resolveInvoice alapértékek', () => {
  test('a számított tételeket névvel együtt adja vissza', () => {
    const resolved = resolve({
      ...BASE,
      items: [{ name: 'Könyv', quantity: 3, grossUnitPrice: 500, vat: 27 }],
    })

    expect(resolved.items[0]?.amounts).toMatchObject({
      name: 'Könyv',
      quantity: 3,
      vat: 27,
      netAmount: 1181,
      vatAmount: 319,
      grossAmount: 1500,
    })
    expect(resolved.items[0]?.unit).toBe('db')
  })

  test('üres alapértékek helyett a beépített alapértékeket használja', () => {
    expect(
      resolve(BASE, { currency: ' ', paymentMethod: '', prefix: '', language: undefined }),
    ).toMatchObject({
      currency: 'HUF',
      paymentMethod: 'Átutalás',
      prefix: undefined,
      language: 'hu',
      eInvoice: false,
      downloadPdf: true,
      sendEmail: false,
      attachments: [],
    })
  })

  test('presentText az üres és a csak szóközös szöveget kihagyja', () => {
    expect(presentText(undefined)).toBeUndefined()
    expect(presentText(' ')).toBeUndefined()
    expect(presentText(' a ')).toBe(' a ')
  })
})
