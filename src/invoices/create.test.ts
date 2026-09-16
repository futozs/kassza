import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  createTestContext,
  FAKE_PDF_BYTES,
  invoiceXmlResponse,
  textErrorResponse,
} from '../../tests/helpers'
import { bytesToBase64 } from '../core/binary'
import { childText, findChild, parseXml } from '../core/xml/parse'
import { createInvoice, previewInvoice } from './create'
import type { CreateInvoiceInput } from './create-types'

const INPUT: CreateInvoiceInput = {
  buyer: {
    name: 'Vevő Kft.',
    zip: '1234',
    city: 'Budapest',
    address: 'Fő utca 1.',
    email: 'a@b.hu',
    taxNumber: '12345678-2-42',
  },
  items: [{ name: 'Termék', quantity: 2, unit: 'db', netUnitPrice: 10000, vat: 27 }],
}

const SUCCESS = invoiceXmlResponse(
  `<sikeres>true</sikeres><szamlaszam>WEB-2026-1</szamlaszam><szamlanetto>20000</szamlanetto><szamlabrutto>25400</szamlabrutto><kintlevoseg>25400</kintlevoseg><pdf>${bytesToBase64(FAKE_PDF_BYTES)}</pdf>`,
)

afterEach(() => {
  vi.useRealTimers()
})

describe('createInvoice', () => {
  test('az action-xmlagentxmlfile mezőben küldi a számla XML-t és visszaadja a számlát', async () => {
    const { ctx, agent } = createTestContext(SUCCESS)

    const invoice = await createInvoice(ctx, {}, INPUT)

    expect(agent.calls).toHaveLength(1)
    expect(agent.lastCall().field).toBe('action-xmlagentxmlfile')
    expect(agent.lastCall().attachments).toEqual([])
    const root = parseXml(agent.lastCall().xml)
    expect(childText(findChild(root, 'beallitasok'), 'szamlaagentkulcs')).toBe(
      'tesztkulcs0123456789abcdef',
    )
    expect(childText(findChild(root, 'vevo'), 'sendEmail')).toBe('true')
    expect(invoice).toEqual({
      number: 'WEB-2026-1',
      netTotal: 20000,
      grossTotal: 25400,
      outstanding: 25400,
      buyerAccountUrl: undefined,
      pdf: FAKE_PDF_BYTES,
      items: [
        {
          name: 'Termék',
          quantity: 2,
          vat: 27,
          netUnitPrice: 10000,
          netAmount: 20000,
          vatAmount: 5400,
          grossAmount: 25400,
        },
      ],
    })
  })

  test('a mellékleteket attachfile mezőkben továbbítja', async () => {
    const { ctx, agent } = createTestContext(SUCCESS)

    await createInvoice(
      ctx,
      {},
      {
        ...INPUT,
        attachments: [
          { filename: 'aszf.pdf', content: FAKE_PDF_BYTES, contentType: 'application/pdf' },
          { filename: 'info.txt', content: 'hello' },
        ],
      },
    )

    expect(agent.lastCall().attachments).toEqual([
      { field: 'attachfile1', filename: 'aszf.pdf', size: FAKE_PDF_BYTES.length },
      { field: 'attachfile2', filename: 'info.txt', size: 5 },
    ])
  })

  test('a kliensszintű alapértékeket alkalmazza', async () => {
    const { ctx, agent } = createTestContext(SUCCESS)

    await createInvoice(ctx, { prefix: 'WEB', seller: { bank: 'OTP' } }, INPUT)

    const root = parseXml(agent.lastCall().xml)
    expect(childText(findChild(root, 'fejlec'), 'szamlaszamElotag')).toBe('WEB')
    expect(childText(findChild(root, 'elado'), 'bank')).toBe('OTP')
  })

  test('a kelt dátumot magyar idő szerint számolja éjfél után', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-15T22:15:00Z'))
    const { ctx, agent } = createTestContext(SUCCESS)

    await createInvoice(ctx, {}, INPUT)

    expect(childText(findChild(parseXml(agent.lastCall().xml), 'fejlec'), 'keltDatum')).toBe(
      '2026-09-16',
    )
  })

  test('validációs hibánál nem küld kérést', async () => {
    const { ctx, agent } = createTestContext(SUCCESS)

    await expect(createInvoice(ctx, {}, { ...INPUT, items: [] })).rejects.toMatchObject({
      category: 'validation',
    })
    expect(agent.calls).toHaveLength(0)
  })

  test('hálózati hiba után sem küldi újra a számlát', async () => {
    const { ctx, agent } = createTestContext(new TypeError('fetch failed'), { maxAttempts: 5 })

    await expect(createInvoice(ctx, {}, INPUT)).rejects.toMatchObject({ category: 'network' })
    expect(agent.calls).toHaveLength(1)
  })

  test('karbantartási hiba után sem küldi újra a számlát', async () => {
    const { ctx, agent } = createTestContext([textErrorResponse('Karbantartás', 1), SUCCESS])

    await expect(createInvoice(ctx, {}, INPUT)).rejects.toMatchObject({ code: 1 })
    expect(agent.calls).toHaveLength(1)
  })

  test('a duplikált rendelésszám hibát duplicate kategóriával adja vissza', async () => {
    const { ctx } = createTestContext(textErrorResponse('Már létező rendelésszám: R-1.', 152))

    const error = await createInvoice(ctx, {}, { ...INPUT, orderNumber: 'R-1' }).catch(
      (caught: unknown) => caught,
    )

    expect(error).toMatchObject({ code: 152, isDuplicate: true })
  })

  test('az AbortSignal-t továbbadja', async () => {
    const { ctx } = createTestContext(SUCCESS)
    const controller = new AbortController()
    controller.abort(new Error('megszakítva'))

    await expect(createInvoice(ctx, {}, INPUT, { signal: controller.signal })).rejects.toThrow(
      'megszakítva',
    )
  })
})

describe('previewInvoice', () => {
  test('előnézeti kérést küld melléklet nélkül és a PDF-et adja vissza', async () => {
    const { ctx, agent } = createTestContext({
      headers: { 'content-type': 'application/pdf' },
      body: FAKE_PDF_BYTES,
    })

    const preview = await previewInvoice(
      ctx,
      { downloadPdf: false },
      {
        ...INPUT,
        attachments: [{ filename: 'a.txt', content: 'x' }],
      },
    )

    const root = parseXml(agent.lastCall().xml)
    expect(childText(findChild(root, 'fejlec'), 'elonezetpdf')).toBe('true')
    expect(childText(findChild(root, 'beallitasok'), 'szamlaLetoltes')).toBe('true')
    expect(agent.lastCall().attachments).toEqual([])
    expect(preview).toMatchObject({ pdf: FAKE_PDF_BYTES, netTotal: 20000, grossTotal: 25400 })
    expect(preview.items).toHaveLength(1)
  })
})
