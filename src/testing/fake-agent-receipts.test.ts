import { describe, expect, test } from 'vitest'
import { FAKE_CREDENTIALS, fakeKassza, rawAgentRequest } from '../../tests/fake-agent'
import { canValidateXsd, validateAgainstXsd } from '../../tests/xsd'
import { isPdf } from '../core/binary'
import { buildCreateReceiptXml } from '../receipts/create'
import { buildGetReceiptXml } from '../receipts/get'
import { buildSendReceiptXml } from '../receipts/send'
import type { CreateReceiptInput } from '../receipts/types'

const RECEIPT: CreateReceiptInput = {
  orderNumber: 'WEB-1',
  callId: 'WEB-1',
  items: [{ name: 'Kávé', quantity: 2, grossUnitPrice: 890, vat: 27 }],
  payments: [{ method: 'bankkártya', amount: 1780 }],
}

function receiptXml(overrides: Partial<CreateReceiptInput> = {}): string {
  return buildCreateReceiptXml(
    FAKE_CREDENTIALS,
    { prefix: 'NYGT', paymentMethod: 'készpénz' },
    {
      ...RECEIPT,
      ...overrides,
    },
  )
}

describe('createFakeAgentFetch: nyugták', () => {
  test('nyugta kiállítása, lekérése, kiküldése és sztornója a valódi klienssel', async () => {
    const { agent, kassza } = fakeKassza()

    const created = await kassza.receipts.create(RECEIPT)
    const byOrder = await kassza.receipts.get({ orderNumber: 'WEB-1', downloadPdf: false })
    await kassza.receipts.send({ receiptNumber: created.number, emails: 'a@pelda.hu; b@pelda.hu' })
    const reversal = await kassza.receipts.reverse({
      receiptNumber: created.number,
      callId: 'WEB-1/SN',
    })
    const original = await kassza.receipts.get(created.number)

    expect(created).toMatchObject({
      id: 1,
      number: 'NYGT-2026-1',
      callId: 'WEB-1',
      type: 'receipt',
      isReversed: false,
      issueDate: '2026-10-02',
      paymentMethod: 'bankkártya',
      currency: 'HUF',
      isTest: true,
      orderNumber: 'WEB-1',
      totals: { grossAmount: 1780 },
      payments: [{ method: 'bankkártya', amount: 1780 }],
    })
    expect(created.pdf && isPdf(created.pdf)).toBe(true)
    expect(created.items).toMatchObject([
      { name: 'Kávé', quantity: 2, unit: 'db', vat: 27, grossAmount: 1780 },
    ])
    expect(byOrder.number).toBe(created.number)
    expect(byOrder.pdf).toBeUndefined()
    expect(reversal).toMatchObject({
      number: 'NYGT-2026-2',
      type: 'reversal',
      callId: 'WEB-1/SN',
      reversedReceiptNumber: 'NYGT-2026-1',
      orderNumber: 'WEB-1',
      totals: { grossAmount: -1780 },
    })
    expect(original.isReversed).toBe(true)
    expect(agent.receipts.get(created.number)?.sentTo).toEqual([['a@pelda.hu', 'b@pelda.hu']])
  })

  test('rendelésszám alapján a legutóbbi, sztornó után a sztornónyugtát adja', async () => {
    const { kassza } = fakeKassza()
    const created = await kassza.receipts.create(RECEIPT)
    await kassza.receipts.reverse(created.number)

    const latest = await kassza.receipts.get({ orderNumber: 'WEB-1' })

    expect(latest).toMatchObject({ type: 'reversal', reversedReceiptNumber: created.number })
  })

  test('ismétlődő hívásazonosítóra 338-at ad, és nem készít új nyugtát', async () => {
    const { agent, kassza } = fakeKassza()
    await kassza.receipts.create(RECEIPT)

    await expect(
      kassza.receipts.create({ ...RECEIPT, orderNumber: 'WEB-2' }),
    ).rejects.toMatchObject({ code: 338, category: 'duplicate' })
    await expect(
      kassza.receipts.reverse({ receiptNumber: 'NYGT-2026-1', callId: 'WEB-1' }),
    ).rejects.toMatchObject({ code: 338 })
    expect(agent.receipts.size).toBe(1)
  })

  test('sztornózott nyugta és sztornónyugta újbóli sztornója kód nélküli hibát ad', async () => {
    const { kassza } = fakeKassza()
    const created = await kassza.receipts.create(RECEIPT)
    const reversal = await kassza.receipts.reverse(created.number)

    await expect(kassza.receipts.reverse(created.number)).rejects.toMatchObject({
      code: undefined,
      message: expect.stringContaining('ezt a nyugtát már sztornózták: NYGT-2026-1'),
    })
    await expect(kassza.receipts.reverse(reversal.number)).rejects.toMatchObject({
      message: expect.stringContaining('ez a nyugta egy sztornónyugta'),
    })
    await expect(kassza.receipts.reverse('NYGT-2026-99')).rejects.toMatchObject({
      code: 339,
      category: 'not_found',
    })
  })

  test('ismeretlen nyugtára 339-et ad, a find null-t', async () => {
    const { kassza } = fakeKassza()

    await expect(kassza.receipts.get('NYGT-2026-1')).rejects.toMatchObject({
      code: 339,
      category: 'not_found',
    })
    expect(await kassza.receipts.find({ orderNumber: 'NINCS' })).toBeNull()
    await expect(
      kassza.receipts.send({ receiptNumber: 'NYGT-2026-1', emails: 'a@pelda.hu' }),
    ).rejects.toMatchObject({ code: 339 })
  })

  test('nyugtaelőtag-szabályok: számlaelőtag 336, nem engedélyezett 524, hibás formátum 337', async () => {
    const { agent, kassza } = fakeKassza({ receiptPrefixes: ['NYGT', 'WEB'] })
    await kassza.invoices.create({
      prefix: 'WEB',
      buyer: { name: 'Vevő', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' },
      items: [{ name: 'Tétel', netUnitPrice: 100, vat: 27 }],
    })

    await expect(kassza.receipts.create({ ...RECEIPT, prefix: 'WEB' })).rejects.toMatchObject({
      code: 336,
    })
    await expect(kassza.receipts.create({ ...RECEIPT, prefix: 'MAS' })).rejects.toMatchObject({
      code: 524,
      category: 'account',
    })
    const lowercase = await rawAgentRequest(
      agent,
      'createReceipt',
      receiptXml().replace('<elotag>NYGT</elotag>', '<elotag>nygt</elotag>'),
    )
    expect(await lowercase.text()).toContain('<hibakod>337</hibakod>')
    expect(agent.receipts.size).toBe(0)
  })

  test('rendelésszám-tiltásnál a nyugta rendelésszáma 152, sztornó után újra használható', async () => {
    const { kassza } = fakeKassza({ rejectDuplicateOrderNumbers: { receipts: true } })
    const first = await kassza.receipts.create({ ...RECEIPT, callId: undefined })

    await expect(kassza.receipts.create({ ...RECEIPT, callId: undefined })).rejects.toMatchObject({
      code: 152,
      category: 'duplicate',
    })
    await kassza.receipts.reverse(first.number)
    const again = await kassza.receipts.create({ ...RECEIPT, callId: undefined })

    expect(again.number).toBe('NYGT-2026-3')
  })

  test('devizás nyugtán megőrzi az árfolyamot, és nem alkalmazza a forintos kerekítési szabályt', async () => {
    const { kassza } = fakeKassza()

    const receipt = await kassza.receipts.create({
      orderNumber: 'WEB-EUR',
      currency: 'EUR',
      exchangeRate: 395.5,
      exchangeBank: 'MNB',
      items: [{ name: 'Coffee', grossUnitPrice: 3.99, vat: 27 }],
    })

    expect(receipt).toMatchObject({
      currency: 'EUR',
      exchangeRate: 395.5,
      exchangeBank: 'MNB',
      totals: { grossAmount: 3.99 },
    })
  })

  test.each([
    [261, '<netto>787.40157480315</netto>', '<afa>212.59842519685</afa>', '<brutto>999</brutto>'],
    [363, '<netto>787.40</netto>', '<afa>212.70</afa>', '<brutto>1000.1</brutto>'],
    [364, '<netto>787.401</netto>', '<afa>212.599</afa>', '<brutto>1000</brutto>'],
    [365, '<netto>787.40</netto>', '<afa>212.6000001</afa>', '<brutto>1000</brutto>'],
  ])('forintos nyugtán a hibás tételösszegre %i-et ad', async (code, net, vat, gross) => {
    const { agent } = fakeKassza()
    const xml = receiptXml({
      items: [{ name: 'Kávé', grossUnitPrice: 1000, vat: 27 }],
      payments: undefined,
    })
      .replace(/<netto>[^<]*<\/netto>/, net)
      .replace(/<afa>[^<]*<\/afa>/, vat)
      .replace(/<brutto>[^<]*<\/brutto>/, gross)

    const response = await rawAgentRequest(agent, 'createReceipt', xml)

    expect(await response.text()).toContain(`<hibakod>${code}</hibakod>`)
  })

  test('a kifizetések eltérő összegére 340-et ad', async () => {
    const { agent } = fakeKassza()
    const xml = receiptXml().replace('<osszeg>1780</osszeg>', '<osszeg>1700</osszeg>')

    const response = await rawAgentRequest(agent, 'createReceipt', xml)

    expect(await response.text()).toContain('<hibakod>340</hibakod>')
    expect(agent.receipts.size).toBe(0)
  })

  test('ismeretlen áfakulcsra 395-öt ad', async () => {
    const { agent } = fakeKassza()
    const xml = receiptXml().replace('<afakulcs>27</afakulcs>', '<afakulcs>33</afakulcs>')

    const response = await rawAgentRequest(agent, 'createReceipt', xml)

    expect(await response.text()).toContain('<hibakod>395</hibakod>')
  })

  test('kiküldésnél a hiányzó tárgyra 7-es hibát ad', async () => {
    const { agent, kassza } = fakeKassza()
    const receipt = await kassza.receipts.create(RECEIPT)
    const xml = buildSendReceiptXml(FAKE_CREDENTIALS, {
      receiptNumber: receipt.number,
      emails: 'a@pelda.hu',
    }).replace(/<emailTargy>[^<]*<\/emailTargy>/, '')

    const response = await rawAgentRequest(agent, 'sendReceipt', xml)

    expect(await response.text()).toContain('<hibakod>7</hibakod>')
  })

  test.skipIf(!canValidateXsd('nyugtavalasz/xmlnyugtavalasz.xsd'))(
    'a nyugtaválasz és a hibaválasz megfelel az xmlnyugtavalasz.xsd sémának',
    async () => {
      const { agent, kassza } = fakeKassza()
      const created = await kassza.receipts.create({
        ...RECEIPT,
        comment: 'Köszönjük & viszlát',
        items: [
          { name: 'Kávé', quantity: 2, grossUnitPrice: 890, vat: 27 },
          { name: 'Utalvány', grossUnitPrice: 1000, vat: 'TAM', ledger: { revenue: '911' } },
        ],
        payments: [
          { method: 'bankkártya', amount: 1780 },
          { method: 'utalvány', amount: 1000, description: 'Ajándékkártya' },
        ],
      })
      const reversal = await kassza.receipts.reverse(created.number)

      for (const number of [created.number, reversal.number, 'NINCS-2026-1']) {
        const response = await rawAgentRequest(
          agent,
          'getReceipt',
          buildGetReceiptXml(FAKE_CREDENTIALS, number),
        )
        expect(
          validateAgainstXsd(await response.text(), 'nyugtavalasz/xmlnyugtavalasz.xsd'),
        ).toEqual([])
      }
    },
  )

  test.skipIf(!canValidateXsd('nyugtasend/xmlnyugtasendvalasz.xsd'))(
    'a kiküldési válasz megfelel az xmlnyugtasendvalasz.xsd sémának',
    async () => {
      const { agent, kassza } = fakeKassza()
      const receipt = await kassza.receipts.create(RECEIPT)

      const success = await rawAgentRequest(
        agent,
        'sendReceipt',
        buildSendReceiptXml(FAKE_CREDENTIALS, {
          receiptNumber: receipt.number,
          emails: 'a@pelda.hu',
        }),
      )
      const failure = await rawAgentRequest(
        agent,
        'sendReceipt',
        buildSendReceiptXml(FAKE_CREDENTIALS, { receiptNumber: 'NINCS-1', emails: 'a@pelda.hu' }),
      )

      expect(
        validateAgainstXsd(await success.text(), 'nyugtasend/xmlnyugtasendvalasz.xsd'),
      ).toEqual([])
      expect(
        validateAgainstXsd(await failure.text(), 'nyugtasend/xmlnyugtasendvalasz.xsd'),
      ).toEqual([])
    },
  )
})
