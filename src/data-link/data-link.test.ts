import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  bankTransactionXml,
  DATA_LINK_KEY,
  incomingInvoiceXml,
  outgoingInvoiceXml,
  receiptArchiveXml,
} from '../../tests/data-link-fixtures'
import { canValidateXsd, type SchemaPath, validateAgainstXsd } from '../../tests/xsd'
import { DATA_LINK_KEY_HEADER, dataLinkHandler } from './handler'
import { DataLinkError, type DataLinkPush, parseDataLinkPush } from './push'
import { dataLinkResponse, dataLinkResponseXml } from './response'

afterEach(() => {
  vi.restoreAllMocks()
})

function expectValid(xml: string, schema: SchemaPath): void {
  if (canValidateXsd(schema)) expect(validateAgainstXsd(xml, schema)).toEqual([])
}

function push(xml: string, key: string | null = DATA_LINK_KEY): Request {
  const headers: Record<string, string> = { 'content-type': 'application/xml; charset=UTF-8' }
  if (key !== null) headers[DATA_LINK_KEY_HEADER] = key
  return new Request('https://konyvelo.example.hu/szamlazz', { method: 'POST', body: xml, headers })
}

describe('parseDataLinkPush', () => {
  test('a kimenő számlát a számlaolvasóval, belső azonosítóval és PDF-fel olvassa', () => {
    const result = parseDataLinkPush(
      outgoingInvoiceXml({ registrationNumber: 'IKT-1' }),
      ` ${DATA_LINK_KEY} `,
    )
    if (result.kind !== 'invoice') throw new Error('kimenő számla várt')
    expect(result).toMatchObject({ kind: 'invoice', key: DATA_LINK_KEY, id: 2001, deleted: false })
    expect(result.invoice.header).toMatchObject({
      id: 2001,
      number: 'E-KASSZA-2026-12',
      type: 'invoice',
      registrationNumber: 'IKT-1',
      paymentMethod: 'Stripe bankkártya',
      unifiedPaymentMethod: 'bankkártya',
      cash: false,
      orderNumber: 'STRIPE-pi_1',
      test: true,
    })
    expect(result.invoice.buyer).toMatchObject({ name: 'Vevő Kft.', taxNumber: '11111111-2-42' })
    expect(result.invoice.items[0]).toMatchObject({
      name: 'Tanácsadás',
      quantity: 2,
      grossAmount: 25400,
    })
    expect(result.invoice.totals.grossAmount).toBe(25400)
    expect(new TextDecoder().decode(result.invoice.pdf)).toContain('%PDF-1.4')
  })

  test('a bejövő számlát és a törölt jelzést is olvassa', () => {
    const result = parseDataLinkPush(incomingInvoiceXml({ deleted: true }), DATA_LINK_KEY)
    if (result.kind !== 'incoming-invoice') throw new Error('bejövő számla várt')
    expect(result).toMatchObject({ id: 3001, deleted: true })
    expect(result.invoice.header).toMatchObject({
      number: 'BESZ-2026-5',
      currency: 'EUR',
      exchangeRate: 395.5,
    })
    expect(result.invoice.seller.name).toBe('Beszállító Bt.')
  })

  test('a banki tranzakciót típusos objektummá alakítja', () => {
    const incoming = parseDataLinkPush(bankTransactionXml('BE'), DATA_LINK_KEY)
    expect(incoming).toMatchObject({
      kind: 'bank-transaction',
      transaction: {
        id: 4001,
        accountNumber: '11773016-11111018',
        valueDate: '2026-10-01',
        direction: 'in',
        type: 'átutalás',
        technical: false,
        amount: 25400,
        currency: 'HUF',
        partner: { name: 'Vevő Kft.', accountNumber: '10918001-00000000-00000000' },
        reference: 'E-KASSZA-2026-12',
      },
    })
    expect(parseDataLinkPush(bankTransactionXml('KI'))).toMatchObject({
      key: undefined,
      transaction: { direction: 'out' },
    })
  })

  test('a napi nyugtaarchívum minden nyugtáját a kibocsátó adószámával adja', () => {
    const result = parseDataLinkPush(receiptArchiveXml(), DATA_LINK_KEY)
    if (result.kind !== 'receipts') throw new Error('nyugtaarchívum várt')
    expect(result.receipts).toHaveLength(2)
    expect(result.receipts[0]).toMatchObject({
      issuerTaxNumber: '12345676-2-42',
      receipt: {
        number: 'NYGT-2026-41',
        type: 'receipt',
        isReversed: true,
        callId: 'CALL-1',
        orderNumber: 'WEB-1',
      },
    })
    expect(result.receipts[1]?.receipt).toMatchObject({
      number: 'NYGT-2026-42',
      type: 'reversal',
      reversedReceiptNumber: 'NYGT-2026-41',
      totals: { grossAmount: -890 },
    })
  })

  test.each([
    ['üres üzenet', '   ', 'invalid_payload'],
    ['nem XML', '<szamla><alap>', 'invalid_payload'],
    ['ismeretlen gyökérelem', '<dijbekero xmlns="x"/>', 'unknown_document'],
    [
      'azonosító nélküli számla',
      '<szamla><alap><szamlaszam>1</szamlaszam></alap></szamla>',
      'invalid_payload',
    ],
    ['nem egész azonosító', '<szamla><alap><id>12a</id></alap></szamla>', 'invalid_payload'],
    ['hiányos számla', '<szamla><alap><id>1</id></alap></szamla>', 'invalid_payload'],
    [
      'ismeretlen irány',
      bankTransactionXml().replace('<irany>BE</irany>', '<irany>XX</irany>'),
      'invalid_payload',
    ],
    [
      'összeg nélküli tranzakció',
      bankTransactionXml().replace('<osszeg>25400</osszeg>', ''),
      'invalid_payload',
    ],
    [
      'üres nyugtaarchívum',
      '<xmlnyugtaarchiv xmlns="http://www.szamlazz.hu/xmlnyugtaarchiv"/>',
      'invalid_payload',
    ],
    [
      'alap nélküli nyugta',
      '<xmlnyugtaarchiv><nyugta><tetelek/></nyugta></xmlnyugtaarchiv>',
      'invalid_payload',
    ],
  ])('%s esetén DataLinkError-t dob', (_label, xml, reason) => {
    expect(() => parseDataLinkPush(xml, DATA_LINK_KEY)).toThrow(
      expect.objectContaining({ name: 'DataLinkError', reason }),
    )
  })
})

describe('dataLinkResponseXml', () => {
  test('a kimenő számla válasza visszhangozza az azonosítót, iktatószámmal, XSD-validan', () => {
    const result = parseDataLinkPush(outgoingInvoiceXml(), DATA_LINK_KEY)
    const xml = dataLinkResponseXml(result, { registrationNumber: ' IKT-2026-1 ' })
    expect(xml).toContain('<szamlavalasz xmlns="http://www.szamlazz.hu/szamlavalasz">')
    expect(xml).toContain('<id>2001</id>')
    expect(xml).toContain('<iktatoszam>IKT-2026-1</iktatoszam>')
    expect(xml).not.toContain('hibakod')
    expectValid(xml, 'szamla/szamlavalasz.xsd')
  })

  test('kulcshibánál is visszaküldi az azonosítót, és hibakódot ad', () => {
    const result = parseDataLinkPush(incomingInvoiceXml(), DATA_LINK_KEY)
    const xml = dataLinkResponseXml(result, { keyError: 'KEY_DEL' })
    expect(xml).toContain('<szamlabevalasz xmlns="http://www.szamlazz.hu/szamlabevalasz">')
    expect(xml).toContain('<id>3001</id>')
    expect(xml).toContain('<hibakod>KEY_DEL</hibakod>')
    expectValid(xml, 'szamlabe/szamlabevalasz.xsd')
  })

  test('a banki tranzakció és a nyugtaarchívum válasza XSD-valid, hibakóddal is', () => {
    const bank = parseDataLinkPush(bankTransactionXml(), DATA_LINK_KEY)
    const receipts = parseDataLinkPush(receiptArchiveXml(), DATA_LINK_KEY)
    expectValid(dataLinkResponseXml(bank), 'banktranz/banktranzvalasz.xsd')
    expectValid(dataLinkResponseXml(bank, { keyError: 'KEY_ERR' }), 'banktranz/banktranzvalasz.xsd')
    expectValid(dataLinkResponseXml(receipts), 'nyugta/nyugtavalasz.xsd')
    expectValid(dataLinkResponseXml(receipts, { keyError: 'KEY_ERR' }), 'nyugta/nyugtavalasz.xsd')
    expect(dataLinkResponseXml(receipts, { keyError: 'KEY_ERR' })).toContain(
      '<nyugtavalasz xmlns="http://www.szamlazz.hu/nyugtavalasz">',
    )
  })

  test('nem számlánál az iktatószámot és az ismeretlen kulcshibát elutasítja', () => {
    const bank = parseDataLinkPush(bankTransactionXml(), DATA_LINK_KEY)
    expect(() => dataLinkResponseXml(bank, { registrationNumber: 'IKT' })).toThrow(TypeError)
    expect(() => dataLinkResponseXml(bank, { keyError: 'ROSSZ' as unknown as 'KEY_ERR' })).toThrow(
      TypeError,
    )
    const invoice = parseDataLinkPush(outgoingInvoiceXml(), DATA_LINK_KEY)
    expect(() =>
      dataLinkResponseXml(invoice, { registrationNumber: 42 as unknown as string }),
    ).toThrow(TypeError)
    expect(dataLinkResponseXml(invoice, { registrationNumber: '  ' })).not.toContain('iktatoszam')
  })

  test('a válasz 200-as, UTF-8 XML', async () => {
    const response = dataLinkResponse(parseDataLinkPush(bankTransactionXml(), DATA_LINK_KEY))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/xml; charset=UTF-8')
    expect(await response.text()).toContain('banktranzvalasz')
  })
})

describe('dataLinkHandler', () => {
  test('ismert kulcsnál átadja az üzenetet, és az iktatószámmal válaszol', async () => {
    const pushes: DataLinkPush[] = []
    const handler = dataLinkHandler({
      keys: [DATA_LINK_KEY],
      onPush: (received) => {
        pushes.push(received)
        return { registrationNumber: 'IKT-9' }
      },
    })
    const response = await handler(push(outgoingInvoiceXml()))
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('<iktatoszam>IKT-9</iktatoszam>')
    expect(pushes).toHaveLength(1)
  })

  test('ismeretlen vagy hiányzó kulcsnál KEY_ERR-t ad, onPush nélkül', async () => {
    const onPush = vi.fn()
    const handler = dataLinkHandler({ keys: [DATA_LINK_KEY], onPush })
    const unknown = await handler(push(bankTransactionXml(), 'masik-kulcs'))
    const missing = await handler(push(bankTransactionXml(), null))
    expect(await unknown.text()).toContain('<hibakod>KEY_ERR</hibakod>')
    expect(await missing.text()).toContain('<hibakod>KEY_ERR</hibakod>')
    expect(onPush).not.toHaveBeenCalled()
  })

  test('a verifyKey KEY_DEL-t, hamist vagy igazat adhat', async () => {
    const onPush = vi.fn()
    const verifyKey = vi
      .fn()
      .mockResolvedValueOnce('KEY_DEL')
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const handler = dataLinkHandler({ verifyKey, onPush })
    expect(await (await handler(push(receiptArchiveXml()))).text()).toContain('KEY_DEL')
    expect(await (await handler(push(receiptArchiveXml()))).text()).toContain('KEY_ERR')
    expect(await (await handler(push(receiptArchiveXml()))).text()).not.toContain('hibakod')
    expect(verifyKey).toHaveBeenCalledWith(
      DATA_LINK_KEY,
      expect.objectContaining({ kind: 'receipts' }),
    )
    expect(onPush).toHaveBeenCalledTimes(1)
  })

  test('a keys lista és a verifyKey együtt is működik', async () => {
    const verifyKey = vi.fn().mockReturnValue(true)
    const handler = dataLinkHandler({ keys: [DATA_LINK_KEY], verifyKey, onPush: () => undefined })
    await handler(push(bankTransactionXml(), 'idegen'))
    expect(verifyKey).not.toHaveBeenCalled()
    await handler(push(bankTransactionXml()))
    expect(verifyKey).toHaveBeenCalledTimes(1)
  })

  test('hibás üzenetre 400-at, feldolgozási hibára 500-at ad', async () => {
    const onError = vi.fn()
    const handler = dataLinkHandler({
      keys: [DATA_LINK_KEY],
      onError,
      onPush: () => {
        throw new Error('adatbázis hiba')
      },
    })
    expect((await handler(push('<nem-xml'))).status).toBe(400)
    expect((await handler(push(bankTransactionXml()))).status).toBe(500)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'adatbázis hiba' }))
  })

  test('érvénytelen onPush visszatérési értékre 500-at ad, onError nélkül a konzolra ír', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const handler = dataLinkHandler({ keys: [DATA_LINK_KEY], onPush: () => 'kész' })
    expect((await handler(push(bankTransactionXml()))).status).toBe(500)
    expect(consoleError).toHaveBeenCalledTimes(1)
  })

  test('a túl nagy üzenetet 400-zal elutasítja', async () => {
    const handler = dataLinkHandler({ keys: [DATA_LINK_KEY], onPush: vi.fn(), maxBodyBytes: 100 })
    const response = await handler(push(outgoingInvoiceXml()))
    expect(response.status).toBe(400)
    expect(await response.text()).toContain('100 bájt')
  })

  test('ha az onError is dob, akkor is 500-at ad', async () => {
    const handler = dataLinkHandler({
      keys: [DATA_LINK_KEY],
      onError: () => {
        throw new Error('naplózó hiba')
      },
      onPush: () => {
        throw new Error('hiba')
      },
    })
    expect((await handler(push(bankTransactionXml()))).status).toBe(500)
  })

  test('kulcsellenőrzés és onPush nélkül létrehozáskor TypeError-t dob', () => {
    expect(() => dataLinkHandler({ onPush: vi.fn() })).toThrow(TypeError)
    expect(() => dataLinkHandler({ keys: [], onPush: vi.fn() })).toThrow(TypeError)
    expect(() => dataLinkHandler({ keys: [' '], onPush: vi.fn() })).toThrow(TypeError)
    expect(() =>
      dataLinkHandler({ keys: [DATA_LINK_KEY], onPush: undefined as unknown as () => void }),
    ).toThrow(TypeError)
  })

  test('a DataLinkError megőrzi az okot', () => {
    const cause = new Error('x')
    const error = new DataLinkError('invalid_payload', 'hiba', cause)
    expect(error).toMatchObject({ name: 'DataLinkError', reason: 'invalid_payload', cause })
    expect(new DataLinkError('missing_key', 'hiba').cause).toBeUndefined()
  })
})
