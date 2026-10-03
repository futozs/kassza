import { describe, expect, test, vi } from 'vitest'
import { type RecordedRequest, routedFetch } from '../../tests/payment-fetch'
import { canValidateXsd, validateAgainstXsd } from '../../tests/xsd'
import { parseXml } from '../core/xml/parse'
import {
  createNavReceiptClient,
  NAV_RECEIPT_URLS,
  type NavReceiptClientOptions,
  navLegacyRequestId,
  navPasswordHash,
  navRequestSignature,
  navSignatureTimestamp,
} from './client'
import type { NavReceiptData, NavReportListItem } from './types'

const SCHEMA = 'nav-receipt/receipt-if-schema-v1.1.1.xsd'
const BASE = NAV_RECEIPT_URLS.test
const NOW = new Date('2026-10-02T08:30:00.000Z')
const SERVICE_NS =
  'xmlns="http://schemas.nav.gov.hu/NTCA/2.0/common/service" xmlns:ns2="http://schemas.nav.gov.hu/NTCA/1.0/receipt" xmlns:ns3="http://schemas.nav.gov.hu/NTCA/2.0/common/paging"'
const CONTEXT =
  '<context><requestId>584b4d7e-8e5c-459c-bb91-3099575d846d</requestId><timestamp>2026-10-02T08:30:00.1Z</timestamp></context>'

const REPORT: NavReceiptData = {
  applicableDate: '2026-10-01',
  serialNumber: 'NYGT-2026-41',
  currency: 'HUF',
  exchangeRate: null,
  vatCategories: [
    { vat: '27%', saleDocument: 1780, modifyingDocument: -890 },
    { vat: '5%', saleDocument: 250, modifyingDocument: -250 },
  ],
  total: 890,
  numberOfSaleDocument: 2,
  numberOfModifyingDocument: 1,
}

const OPTIONS: NavReceiptClientOptions = {
  environment: 'test',
  login: 'technikai_user',
  password: 'Titkos-Jelszo-1',
  signatureKey: 'ce-8f5e-215119fa7dd621DLMRHRLH2S',
  taxNumber: '12345678-2-42',
  softwareName: 'Kassza 1.0',
  now: () => NOW,
}

function xml(root: string, inner: string, resultCode = true): Response {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><ns2:${root} ${SERVICE_NS}>${CONTEXT}${resultCode ? '<resultCode>SUCCESS</resultCode>' : ''}${inner}</ns2:${root}>`,
    { status: 200, headers: { 'content-type': 'application/xml' } },
  )
}

function tokenResponse(token: string, validTo: string): Response {
  return xml(
    'AuthTokenResponse',
    `<ns2:token>${token}</ns2:token><ns2:validTo>${validTo}</ns2:validTo>`,
    false,
  )
}

function listItem(item: Partial<NavReportListItem> & { id: string }): string {
  const value = {
    applicableDate: '2026-10-01',
    serialNumber: 'NYGT-2026-41',
    numberOfSaleDocument: 2,
    numberOfModifyingDocument: 1,
    totalAmount: 890,
    totalAmountInForint: 890,
    status: 'RECORDED',
    softwareName: 'Szamlazz.hu',
    ...item,
  }
  return `<ns2:receipt><ns2:id>${value.id}</ns2:id><ns2:applicableDate>${value.applicableDate}</ns2:applicableDate><ns2:serialNumber>${value.serialNumber}</ns2:serialNumber><ns2:numberOfSaleDocument>${value.numberOfSaleDocument}</ns2:numberOfSaleDocument><ns2:numberOfModifyingDocument>${value.numberOfModifyingDocument}</ns2:numberOfModifyingDocument><ns2:totalAmount>${value.totalAmount}</ns2:totalAmount><ns2:totalAmountInForint>${value.totalAmountInForint}</ns2:totalAmountInForint><ns2:status>${value.status}</ns2:status><ns2:issuingSoftware><ns2:name>${value.softwareName}</ns2:name></ns2:issuingSoftware></ns2:receipt>`
}

function listResponse(items: readonly string[], page = 1, total = items.length): Response {
  return xml(
    'ReceiptListResponse',
    `<ns2:paging><ns3:pageSize>100</ns3:pageSize><ns3:page>${page}</ns3:page><ns3:totalRowCount>${total}</ns3:totalRowCount></ns2:paging><ns2:result>${items.join('')}</ns2:result>`,
  )
}

interface ServerOptions {
  readonly list?: (request: RecordedRequest) => Response
  readonly software?: readonly string[]
  readonly unauthorizedOnce?: boolean
}

function navServer(serverOptions: ServerOptions = {}) {
  let tokens = 0
  let unauthorized = serverOptions.unauthorizedOnce === true
  const guard = (request: RecordedRequest, respond: () => Response): Response => {
    if (unauthorized) {
      unauthorized = false
      return new Response('', { status: 401 })
    }
    expect(request.headers.get('authorization')).toMatch(/^Bearer token-\d+$/)
    return respond()
  }
  return routedFetch([
    [
      `${BASE}/auth/token`,
      () => {
        tokens += 1
        return tokenResponse(`token-${tokens}`, '2026-10-02T08:35:00.000Z')
      },
    ],
    [
      `${BASE}/receipt/list`,
      (request) => guard(request, () => (serverOptions.list ?? (() => listResponse([])))(request)),
    ],
    [
      `${BASE}/receipt/create`,
      (request) =>
        guard(request, () => xml('CreateReceiptResponse', '<ns2:id>12345678_20261001_7</ns2:id>')),
    ],
    [
      `${BASE}/receipt/modify`,
      (request) =>
        guard(request, () => xml('ModifyReceiptResponse', '<ns2:id>12345678_20261001_8</ns2:id>')),
    ],
    [
      `${BASE}/receipt/invalidate`,
      (request) => guard(request, () => xml('InvalidateReceiptResponse', '')),
    ],
    [
      `${BASE}/receipt/detail`,
      (request) =>
        guard(request, () =>
          xml(
            'ReceiptDetailResponse',
            '<ns2:id>12345678_20261001_7</ns2:id><ns2:issuingSoftware><ns2:name>Kassza 1.0</ns2:name></ns2:issuingSoftware><ns2:applicableDate>2026-10-01</ns2:applicableDate><ns2:status>RECORDED</ns2:status><ns2:serialNumber>NYGT-2026-41</ns2:serialNumber><ns2:currency>HUF</ns2:currency><ns2:exchangeRate xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:nil="true"/><ns2:vatCategoryItems><ns2:vatCategory><ns2:vat>27%</ns2:vat><ns2:saleDocument>1780</ns2:saleDocument><ns2:modifyingDocument>-890</ns2:modifyingDocument></ns2:vatCategory></ns2:vatCategoryItems><ns2:total>890</ns2:total><ns2:totalAmountInForint>890</ns2:totalAmountInForint><ns2:numberOfSaleDocument>2</ns2:numberOfSaleDocument><ns2:numberOfModifyingDocument>1</ns2:numberOfModifyingDocument>',
          ),
        ),
    ],
    [
      `${BASE}/issuing-software/list`,
      (request) =>
        guard(request, () =>
          xml(
            'IssuingSoftwareListResponse',
            `<ns2:issuingSoftwareList>${(serverOptions.software ?? []).map((name) => `<ns2:software><ns2:name>${name}</ns2:name></ns2:software>`).join('')}</ns2:issuingSoftwareList>`,
          ),
        ),
    ],
    [
      `${BASE}/issuing-software/create`,
      (request) => guard(request, () => xml('CreateIssuingSoftwareResponse', '')),
    ],
    [
      `${BASE}/vat-category/list`,
      (request) =>
        guard(request, () =>
          xml(
            'VatCategoryResponse',
            '<ns2:categories><ns2:category><ns2:name>27%</ns2:name><ns2:validFrom>2026-09-01</ns2:validFrom></ns2:category></ns2:categories>',
          ),
        ),
    ],
    [
      `${BASE}/currency/list`,
      (request) =>
        guard(request, () =>
          xml(
            'CurrencyResponse',
            '<ns2:currencies><ns2:currency><ns2:name>Magyar forint</ns2:name><ns2:code>HUF</ns2:code></ns2:currency></ns2:currencies>',
          ),
        ),
    ],
  ])
}

function paths(requests: readonly RecordedRequest[]): string[] {
  return requests.map((request) => request.url.slice(BASE.length))
}

function expectValid(body: string): void {
  if (canValidateXsd(SCHEMA)) expect(validateAgainstXsd(body, SCHEMA)).toEqual([])
}

describe('NAV hitelesítési segédek', () => {
  test('a jelszó hash nagybetűs SHA-512', async () => {
    expect(await navPasswordHash('abc')).toBe(
      'DDAF35A193617ABACC417349AE20413112E6FA4E89A97EA20A9EEEE64B55D39A2192992A274FC1A836BA3C23A3FEEBBD454D4423643CE80E2A9AC94FA54CA49F',
    )
  })

  test('a requestSignature a NAV specifikáció példáját adja', () => {
    expect(
      navRequestSignature(
        'DPrHL3Tr6djsrPt',
        '2026-08-24T06:50:53.000Z',
        'ce-8f5e-215119fa7dd621DLMRHRLH2S',
      ),
    ).toBe(
      '2FD464BE4D01BE6BB72A30E9AD864BB433D3D253BEFA9FA921316075A1341844567CFBC7CBAEB9E20E4723F583DB8962F46054F928FB203EFC6467B77B969625',
    )
  })

  test('az aláírási időbélyeget UTC yyyyMMddHHmmss alakra hozza, a hibásat elutasítja', () => {
    expect(navSignatureTimestamp('2026-10-02T08:30:00.123456789Z')).toBe('20261002083000')
    expect(() => navSignatureTimestamp('2026-10-02 08:30:00')).toThrow(
      expect.objectContaining({ category: 'validation' }),
    )
  })

  test('a legacy kérésazonosító 30 karakteres és mintának megfelelő', () => {
    const ids = new Set(Array.from({ length: 50 }, () => navLegacyRequestId()))
    expect(ids.size).toBe(50)
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9]{30}$/)
  })
})

describe('createNavReceiptClient: hitelesítés', () => {
  test('XSD-valid, helyesen aláírt token kérést küld', async () => {
    const server = navServer()
    const client = createNavReceiptClient({ ...OPTIONS, fetch: server.fetch })

    await expect(client.authenticate()).resolves.toEqual({
      token: 'token-1',
      validTo: '2026-10-02T08:35:00.000Z',
    })

    const body = server.requests[0]?.body ?? ''
    expectValid(body)
    const root = parseXml(body)
    const context = root.children.find((child) => child.name === 'context')
    const auth = root.children.find((child) => child.name === 'auth')
    const field = (name: string, parent = auth) =>
      parent?.children.find((child) => child.name === name)?.text ?? ''
    const requestId = field('requestId', context)
    const timestamp = field('timestamp', context)
    expect(requestId).toMatch(/^[A-Za-z0-9]{30}$/)
    expect(timestamp).toBe('2026-10-02T08:30:00.000Z')
    expect(field('login')).toBe('technikai_user')
    expect(field('taxNumber')).toBe('12345678')
    expect(field('passwordHash')).toBe(await navPasswordHash('Titkos-Jelszo-1'))
    expect(field('requestSignature')).toBe(
      navRequestSignature(requestId, timestamp, 'ce-8f5e-215119fa7dd621DLMRHRLH2S'),
    )
    expect(server.requests[0]?.headers.get('authorization')).toBeNull()
    expect(server.requests[0]?.headers.get('content-type')).toBe('application/xml; charset=UTF-8')
  })

  test('a megadott jelszó hash-t és jogelőd adószámot használja', async () => {
    const server = navServer()
    const client = createNavReceiptClient({
      ...OPTIONS,
      password: undefined,
      passwordHash: 'a'.repeat(128),
      predecessorTaxNumber: '87654321',
      fetch: server.fetch,
    })
    await client.authenticate()
    expect(server.requests[0]?.body).toContain(`>${'A'.repeat(128)}</auth:passwordHash>`)
    expect(server.requests[0]?.body).toContain(
      '<auth:predecessorTaxNumber>87654321</auth:predecessorTaxNumber>',
    )
  })

  test('a tokent a lejárat előtt újrahasznosítja, utána újat kér', async () => {
    let now = NOW
    const server = navServer()
    const client = createNavReceiptClient({ ...OPTIONS, fetch: server.fetch, now: () => now })
    await client.vatCategories()
    await client.currencies()
    now = new Date('2026-10-02T08:34:31.000Z')
    await client.vatCategories()
    expect(paths(server.requests)).toEqual([
      '/auth/token',
      '/vat-category/list',
      '/currency/list',
      '/auth/token',
      '/vat-category/list',
    ])
    expect(server.requests[4]?.headers.get('authorization')).toBe('Bearer token-2')
  })

  test('párhuzamos hívásoknál egyetlen tokent kér', async () => {
    const server = navServer()
    const client = createNavReceiptClient({ ...OPTIONS, fetch: server.fetch })
    await Promise.all([client.vatCategories(), client.currencies(), client.listSoftware()])
    expect(paths(server.requests).filter((path) => path === '/auth/token')).toHaveLength(1)
  })

  test('401-es válasznál egyszer új tokennel megismétli a kérést', async () => {
    const server = navServer({ unauthorizedOnce: true })
    const client = createNavReceiptClient({ ...OPTIONS, fetch: server.fetch })
    await expect(client.currencies()).resolves.toEqual([{ code: 'HUF', name: 'Magyar forint' }])
    expect(paths(server.requests)).toEqual([
      '/auth/token',
      '/currency/list',
      '/auth/token',
      '/currency/list',
    ])
  })

  test('ismételt 401-re hitelesítési hibát dob', async () => {
    const server = routedFetch([
      [`${BASE}/auth/token`, () => tokenResponse('t', '2026-10-02T08:35:00.000Z')],
      [`${BASE}/currency/list`, () => new Response('', { status: 401 })],
    ])
    const client = createNavReceiptClient({ ...OPTIONS, fetch: server.fetch })
    await expect(client.currencies()).rejects.toMatchObject({ category: 'auth', httpStatus: 401 })
    expect(server.requests).toHaveLength(4)
  })
})

describe('createNavReceiptClient: olvasás', () => {
  test('a lista kérést XSD-validan, a megadott időszakra küldi', async () => {
    const server = navServer({
      list: () => listResponse([listItem({ id: '12345678_20261001_1' })]),
    })
    const client = createNavReceiptClient({ ...OPTIONS, fetch: server.fetch })
    const page = await client.listReports({
      from: '2026-10-01',
      to: '2026-10-01',
      orderBy: 'SERIAL_NUMBER',
    })
    expect(page.items.map((item) => item.id)).toEqual(['12345678_20261001_1'])
    const body = server.requests[1]?.body ?? ''
    expect(body).toContain('<from>2026-10-01</from>')
    expect(body).toContain('<property>SERIAL_NUMBER</property>')
    expectValid(body)
  })

  test('a listAllReports minden oldalt bejár', async () => {
    const server = navServer({
      list: (request) => {
        const page = Number(/<page:page>(\d+)<\/page:page>/.exec(request.body)?.[1])
        const items = Array.from({ length: page === 1 ? 100 : 50 }, (_, index) =>
          listItem({ id: `12345678_20261001_${page * 1000 + index}` }),
        )
        return listResponse(items, page, 150)
      },
    })
    const client = createNavReceiptClient({ ...OPTIONS, fetch: server.fetch })
    const items = await client.listAllReports({ from: '2026-10-01', to: '2026-10-01' })
    expect(items).toHaveLength(150)
    expect(paths(server.requests).filter((path) => path === '/receipt/list')).toHaveLength(2)
  })

  test('üres oldalnál leáll akkor is, ha a totalRowCount többet ígér', async () => {
    const server = navServer({ list: () => listResponse([], 1, 10) })
    const client = createNavReceiptClient({ ...OPTIONS, fetch: server.fetch })
    await expect(client.listAllReports({ from: '2026-10-01', to: '2026-10-02' })).resolves.toEqual(
      [],
    )
  })

  test('a hibás lekérdezési paramétereket kérés előtt elutasítja', async () => {
    const server = navServer()
    const client = createNavReceiptClient({ ...OPTIONS, fetch: server.fetch })
    await expect(
      client.listReports({ from: '2026-10-02', to: '2026-10-01' }),
    ).rejects.toMatchObject({
      category: 'validation',
    })
    await expect(
      client.listReports({ from: '2026-10-01', to: '2026-10-02', pageSize: 101 }),
    ).rejects.toMatchObject({ category: 'validation' })
    await expect(
      client.listReports({ from: '2026-10-01', to: '2026-10-02', page: 0 }),
    ).rejects.toMatchObject({ category: 'validation' })
    await expect(client.getReport('rossz-azonosito')).rejects.toMatchObject({
      category: 'validation',
    })
    expect(server.requests).toHaveLength(0)
  })

  test('a részletes adatot, a szoftverlistát, az áfakategóriákat és a pénznemeket lekéri', async () => {
    const server = navServer({ software: ['Kassza 1.0'] })
    const client = createNavReceiptClient({ ...OPTIONS, fetch: server.fetch })
    await expect(client.getReport('12345678_20261001_7')).resolves.toMatchObject({
      id: '12345678_20261001_7',
      exchangeRate: null,
      total: 890,
    })
    await expect(client.listSoftware()).resolves.toEqual(['Kassza 1.0'])
    await expect(client.vatCategories()).resolves.toEqual([
      { name: '27%', validFrom: '2026-09-01', validTo: undefined },
    ])
    for (const request of server.requests.slice(1)) expectValid(request.body)
  })
})

describe('createNavReceiptClient: írás', () => {
  test('alapból csak olvas: írási hívásra write_blocked hibát dob kérés nélkül', async () => {
    const server = navServer()
    const client = createNavReceiptClient({ ...OPTIONS, fetch: server.fetch })
    expect(client.canWrite).toBe(false)
    for (const action of [
      () => client.submitReport(REPORT),
      () => client.modifyReport('12345678_20261001_7', REPORT),
      () => client.invalidateReport('12345678_20261001_7'),
      () => client.registerSoftware(),
    ]) {
      await expect(action()).rejects.toMatchObject({
        category: 'write_blocked',
        hint: expect.stringContaining('allowWrite'),
      })
    }
    expect(server.requests).toHaveLength(0)
  })

  test('ütközés nélkül beküldi a jelentést, XSD-valid kéréssel', async () => {
    const server = navServer()
    const client = createNavReceiptClient({ ...OPTIONS, allowWrite: true, fetch: server.fetch })
    await expect(client.submitReport(REPORT)).resolves.toEqual({
      id: '12345678_20261001_7',
      created: true,
      softwareName: 'Kassza 1.0',
    })
    expect(paths(server.requests)).toEqual(['/auth/token', '/receipt/list', '/receipt/create'])
    const body = server.requests[2]?.body ?? ''
    expect(body).toContain('<issuingSoftware>')
    expect(body).toContain('<serialNumber>NYGT-2026-41</serialNumber>')
    expectValid(body)
  })

  test('azonos, már rögzített jelentésnél nem küldi be újra', async () => {
    const server = navServer({
      list: () => listResponse([listItem({ id: '12345678_20261001_3' })]),
    })
    const client = createNavReceiptClient({ ...OPTIONS, allowWrite: true, fetch: server.fetch })
    await expect(client.submitReport(REPORT)).resolves.toEqual({
      id: '12345678_20261001_3',
      created: false,
      softwareName: 'Szamlazz.hu',
    })
    expect(paths(server.requests)).not.toContain('/receipt/create')
  })

  test('eltérő, már rögzített jelentésnél ütközési hibát dob', async () => {
    const server = navServer({
      list: () => listResponse([listItem({ id: '12345678_20261001_3', totalAmount: 1000 })]),
    })
    const client = createNavReceiptClient({ ...OPTIONS, allowWrite: true, fetch: server.fetch })
    await expect(client.submitReport(REPORT)).rejects.toMatchObject({
      category: 'conflict',
      details: { existingId: '12345678_20261001_3', existingSoftware: 'Szamlazz.hu' },
    })
    expect(paths(server.requests)).not.toContain('/receipt/create')
  })

  test('az érvénytelenített és a más sorszámú rekordot nem tekinti ütközésnek', async () => {
    const server = navServer({
      list: () =>
        listResponse([
          listItem({ id: '12345678_20261001_1', status: 'INVALIDATED' }),
          listItem({ id: '12345678_20261001_2', serialNumber: 'MASIK-1' }),
        ]),
    })
    const client = createNavReceiptClient({ ...OPTIONS, allowWrite: true, fetch: server.fetch })
    await expect(client.submitReport(REPORT)).resolves.toMatchObject({ created: true })
  })

  test('a hibás jelentést és a hiányzó szoftvernevet beküldés előtt elutasítja', async () => {
    const server = navServer()
    const client = createNavReceiptClient({
      ...OPTIONS,
      softwareName: undefined,
      allowWrite: true,
      fetch: server.fetch,
    })
    await expect(client.submitReport(REPORT)).rejects.toMatchObject({ category: 'configuration' })
    await expect(
      client.submitReport({ ...REPORT, total: 1 }, { softwareName: 'Kassza 1.0' }),
    ).rejects.toMatchObject({ category: 'validation' })
    await expect(
      client.submitReport(
        { ...REPORT, applicableDate: '2026-10-03' },
        { softwareName: 'Kassza 1.0' },
      ),
    ).rejects.toMatchObject({
      category: 'validation',
      message: expect.stringContaining('jövőbeli'),
    })
    expect(server.requests).toHaveLength(0)
  })

  test('módosít és érvénytelenít, XSD-valid kérésekkel', async () => {
    const server = navServer()
    const client = createNavReceiptClient({ ...OPTIONS, allowWrite: true, fetch: server.fetch })
    await expect(client.modifyReport('12345678_20261001_7', REPORT)).resolves.toEqual({
      id: '12345678_20261001_8',
    })
    await expect(client.invalidateReport('12345678_20261001_8')).resolves.toBeUndefined()
    expectValid(server.requests[1]?.body ?? '')
    expectValid(server.requests[2]?.body ?? '')
    await expect(client.modifyReport('rossz', REPORT)).rejects.toMatchObject({
      category: 'validation',
    })
  })

  test('a szoftvert csak akkor rögzíti, ha még nincs a listában', async () => {
    const registered = navServer({ software: ['Kassza 1.0'] })
    await expect(
      createNavReceiptClient({
        ...OPTIONS,
        allowWrite: true,
        fetch: registered.fetch,
      }).registerSoftware(),
    ).resolves.toEqual({ created: false })
    expect(paths(registered.requests)).not.toContain('/issuing-software/create')
    const fresh = navServer({ software: [] })
    await expect(
      createNavReceiptClient({ ...OPTIONS, allowWrite: true, fetch: fresh.fetch }).registerSoftware(
        'Kassza 2.0',
      ),
    ).resolves.toEqual({ created: true })
    const body =
      fresh.requests.find((request) => request.url.endsWith('/issuing-software/create'))?.body ?? ''
    expect(body).toContain('<name>Kassza 2.0</name>')
    expectValid(body)
  })
})

describe('createNavReceiptClient: hibák és beállítások', () => {
  test('a hálózati hibát network, az időtúllépést timeout kategóriával jelzi', async () => {
    const offline = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    await expect(
      createNavReceiptClient({ ...OPTIONS, fetch: offline }).currencies(),
    ).rejects.toMatchObject({ category: 'network', operation: 'authToken', retryable: true })
    const hanging = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
      })) as typeof globalThis.fetch
    await expect(
      createNavReceiptClient({ ...OPTIONS, fetch: hanging, timeoutMs: 20 }).currencies(),
    ).rejects.toMatchObject({ category: 'timeout' })
  })

  test('a hívó megszakítását változatlanul továbbadja', async () => {
    const controller = new AbortController()
    const hanging = ((_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
      })) as typeof globalThis.fetch
    const pending = createNavReceiptClient({ ...OPTIONS, fetch: hanging }).currencies({
      signal: controller.signal,
    })
    controller.abort(new Error('felhasználói megszakítás'))
    await expect(pending).rejects.toThrow('felhasználói megszakítás')
  })

  test('az éles környezet és az egyedi URL címét használja', async () => {
    const server = routedFetch([[/./, () => tokenResponse('t', '2026-10-02T08:35:00.000Z')]])
    await createNavReceiptClient({
      ...OPTIONS,
      environment: 'production',
      fetch: server.fetch,
    }).authenticate()
    await createNavReceiptClient({
      ...OPTIONS,
      baseUrl: 'http://localhost:9999/v1/',
      fetch: server.fetch,
    }).authenticate()
    expect(server.requests.map((request) => request.url)).toEqual([
      'https://receipt-if.enyugta.nav.gov.hu/v1/auth/token',
      'http://localhost:9999/v1/auth/token',
    ])
  })

  test.each([
    ['hiányzó környezet', { environment: undefined }],
    ['hiányzó login', { login: ' ' }],
    ['túl hosszú login', { login: 'x'.repeat(51) }],
    ['hiányzó jelszó', { password: undefined }],
    ['hibás jelszó hash', { password: undefined, passwordHash: 'abc' }],
    ['hiányzó aláírókulcs', { signatureKey: '' }],
    ['hibás adószám', { taxNumber: '1234' }],
    ['hibás jogelőd adószám', { predecessorTaxNumber: 'x' }],
    ['érvénytelen timeout', { timeoutMs: 0 }],
  ])('%s esetén konfigurációs hibát dob', (_label, overrides) => {
    expect(() =>
      createNavReceiptClient({ ...OPTIONS, ...overrides } as unknown as NavReceiptClientOptions),
    ).toThrow(expect.objectContaining({ category: 'configuration' }))
  })

  test('érvénytelen szoftvernévre validációs hibát dob', () => {
    expect(() => createNavReceiptClient({ ...OPTIONS, softwareName: 'Kassza/1' })).toThrow(
      expect.objectContaining({ category: 'validation' }),
    )
  })

  test('fetch nélküli környezetben konfigurációs hibát dob', () => {
    const original = globalThis.fetch
    try {
      Object.defineProperty(globalThis, 'fetch', {
        value: undefined,
        configurable: true,
        writable: true,
      })
      expect(() => createNavReceiptClient(OPTIONS)).toThrow(
        expect.objectContaining({ category: 'configuration' }),
      )
    } finally {
      Object.defineProperty(globalThis, 'fetch', {
        value: original,
        configurable: true,
        writable: true,
      })
    }
  })
})
