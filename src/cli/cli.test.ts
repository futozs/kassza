import { describe, expect, test } from 'vitest'
import { FAKE_NOW, fakeKassza } from '../../tests/fake-agent'
import { TEST_AGENT_KEY } from '../../tests/helpers'
import { MODERN_META } from '../../tests/mcp'
import { KASSZA_VERSION } from '../core/version'
import { createFakeAgentFetch, type FakeAgent } from '../testing'
import type { CliIo } from './io'
import { runCli } from './run'

interface CliRun {
  readonly code: number
  readonly stdout: string
  readonly stderr: string
}

interface CliOptions {
  readonly env?: Readonly<Record<string, string | undefined>>
  readonly files?: Readonly<Record<string, string>>
  readonly stdin?: string
  readonly lines?: readonly string[]
  readonly fetch?: typeof globalThis.fetch
  readonly nodeVersion?: string
}

async function run(argv: readonly string[], options: CliOptions = {}): Promise<CliRun> {
  const out: string[] = []
  const err: string[] = []
  const files = options.files ?? {}
  const io: CliIo = {
    argv,
    env: { SZAMLAZZ_AGENT_KEY: TEST_AGENT_KEY, ...options.env },
    nodeVersion: options.nodeVersion ?? '22.11.0',
    stdout: (text) => {
      out.push(text)
    },
    stderr: (text) => {
      err.push(text)
    },
    readFile: async (path) => {
      const content = files[path]
      if (content === undefined) throw new Error(`ENOENT: ${path}`)
      return content
    },
    readStdin: async () => options.stdin ?? '',
    stdinLines: async function* () {
      for (const line of options.lines ?? []) yield line
    },
    fetch: options.fetch,
    now: FAKE_NOW,
  }
  const code = await runCli(io)
  return { code, stdout: out.join(''), stderr: err.join('') }
}

function withHeaders(
  agent: FakeAgent,
  headers: Readonly<Record<string, string>>,
): typeof globalThis.fetch {
  const wrapped = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await agent.fetch(input, init)
    const merged = new Headers(response.headers)
    for (const [name, value] of Object.entries(headers)) merged.set(name, value)
    return new Response(await response.arrayBuffer(), { status: response.status, headers: merged })
  }
  return wrapped as typeof globalThis.fetch
}

function serverDate(offsetSeconds: number): string {
  return new Date(FAKE_NOW().getTime() + offsetSeconds * 1000).toUTCString()
}

const INVOICE_INPUT = {
  buyer: { name: 'Vevő Kft.', zip: '1111', city: 'Budapest', address: 'Fő utca 1.' },
  items: [{ name: 'Tanácsadás', netUnitPrice: 10_000, vat: 27 }],
  issueDate: '2026-10-02',
}

describe('kassza CLI: általános', () => {
  test('súgó, verzió és ismeretlen parancs', async () => {
    const help = await run(['help'])
    const empty = await run([])
    const version = await run(['--version'])
    const unknown = await run(['nincs-ilyen'])

    expect(help).toMatchObject({ code: 0, stdout: expect.stringContaining('doctor [--invoice') })
    expect(empty).toMatchObject({ code: 2, stderr: expect.stringContaining('Használat') })
    expect(version).toEqual({ code: 0, stdout: `${KASSZA_VERSION}\n`, stderr: '' })
    expect(unknown).toMatchObject({
      code: 2,
      stderr: expect.stringContaining('Ismeretlen parancs'),
    })
  })

  test('ismeretlen kapcsolóra, hiányzó értékre és fölösleges argumentumra használati hibát ad', async () => {
    const unknownFlag = await run(['verify', '--gyors'])
    const missingValue = await run(['receipt', 'get', '--order'])
    const extra = await run(['verify', 'plusz'])
    const booleanValue = await run(['doctor', '--json=igen'])

    expect(unknownFlag).toMatchObject({ code: 2, stderr: expect.stringContaining('--gyors') })
    expect(missingValue).toMatchObject({ code: 2, stderr: expect.stringContaining('érték kell') })
    expect(extra).toMatchObject({ code: 2, stderr: expect.stringContaining('Fölösleges') })
    expect(booleanValue).toMatchObject({ code: 2, stderr: expect.stringContaining('nincs értéke') })
  })
})

describe('kassza CLI: doctor', () => {
  test('rendben lévő környezetben minden ellenőrzés sikeres', async () => {
    const agent = createFakeAgentFetch({ now: FAKE_NOW })
    const fetch = withHeaders(agent, {
      date: serverDate(0),
      'set-cookie': 'JSESSIONID=abc; Path=/',
    })

    const result = await run(['doctor'], { fetch })

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('✓ Node.js 22.11.0')
    expect(result.stdout).toContain(`✓ Agent kulcs: ${TEST_AGENT_KEY.length} karakter, kisbetűs.`)
    expect(result.stdout).toContain('✓ Hitelesítés: a Számlázz.hu elfogadta az Agent kulcsot.')
    expect(result.stdout).toContain('✓ Óra: legfeljebb')
    expect(result.stdout).toContain('✓ Munkamenet')
    expect(result.stdout).toContain('- Fiók típusa: add meg')
    expect(result.stdout).toContain('Összegzés: 0 hiba, 0 figyelmeztetés.')
    expect(result.stdout).not.toContain(TEST_AGENT_KEY)
  })

  test('siető órára figyelmeztet, késő órára hibát ad, süti nélkül figyelmeztet', async () => {
    const agent = createFakeAgentFetch({ now: FAKE_NOW })

    const fast = await run(['doctor'], { fetch: withHeaders(agent, { date: serverDate(-10) }) })
    const slow = await run(['doctor'], { fetch: withHeaders(agent, { date: serverDate(120) }) })

    expect(fast.code).toBe(0)
    expect(fast.stdout).toContain('! Óra: a gép órája 9,5 mp-et siet')
    expect(fast.stdout).toContain('352')
    expect(fast.stdout).toContain('! Munkamenet: nem érkezett munkamenet-süti')
    expect(slow.code).toBe(1)
    expect(slow.stdout).toContain('✗ Óra: a gép órája 120,5 mp-et késik')
  })

  test('Date fejléc nélkül kihagyja az óra-ellenőrzést', async () => {
    const agent = createFakeAgentFetch({ now: FAKE_NOW })

    const result = await run(['doctor'], { fetch: agent.fetch })

    expect(result.stdout).toContain('- Óra: a Számlázz.hu válaszában nem volt Date fejléc.')
  })

  test('hiányzó, nagybetűs és szóközös Agent kulcsot jelez', async () => {
    const agent = createFakeAgentFetch({ now: FAKE_NOW })

    const missing = await run(['doctor'], { env: { SZAMLAZZ_AGENT_KEY: undefined } })
    const uppercase = await run(['doctor'], { env: { SZAMLAZZ_AGENT_KEY: 'ABCdef' } })
    const spaced = await run(['doctor'], {
      env: { SZAMLAZZ_AGENT_KEY: ` ${TEST_AGENT_KEY} ` },
      fetch: agent.fetch,
    })

    expect(missing).toMatchObject({
      code: 1,
      stdout: expect.stringContaining('✗ Agent kulcs: hiányzik'),
    })
    expect(missing.stdout).toContain('- Hitelesítés: Agent kulcs nélkül nem próbálható.')
    expect(uppercase).toMatchObject({ code: 1, stdout: expect.stringContaining('nagybetűt') })
    expect(spaced.stdout).toContain(
      `! Agent kulcs: ${TEST_AGENT_KEY.length} karakter, de az elején vagy a végén szóköz van`,
    )
  })

  test('elutasított kulcsnál és régi Node.js-nél hibát ad', async () => {
    const strict = createFakeAgentFetch({ now: FAKE_NOW, agentKeys: ['masik-kulcs'] })

    const rejected = await run(['doctor'], { fetch: strict.fetch })
    const oldNode = await run(['doctor'], { fetch: strict.fetch, nodeVersion: '20.18.0' })

    expect(rejected).toMatchObject({ code: 1, stdout: expect.stringContaining('elutasította') })
    expect(rejected.stdout).toContain('- Fiók típusa: sikertelen hitelesítés miatt kimaradt.')
    expect(oldNode.stdout).toContain('✗ Node.js 20.18.0: a kasszához legalább Node.js 22 kell.')
  })

  test('hálózati hibánál a hitelesítési próba hibát ad', async () => {
    const agent = createFakeAgentFetch({ now: FAKE_NOW })
    agent.fail('networkError')

    const result = await run(['doctor'], { fetch: agent.fetch })

    expect(result).toMatchObject({
      code: 1,
      stdout: expect.stringContaining('✗ Hitelesítés: a próba nem sikerült'),
    })
  })

  test('meglévő bizonylatból megállapítja a fiók típusát, JSON kimenettel is', async () => {
    const { agent, kassza } = fakeKassza({ testAccount: false })
    const invoice = await kassza.invoices.create(INVOICE_INPUT)
    const receipt = await kassza.receipts.create({
      items: [{ name: 'Kávé', grossUnitPrice: 890, vat: 27 }],
    })

    const byInvoice = await run(['doctor', '--invoice', invoice.number], { fetch: agent.fetch })
    const byReceipt = await run(['doctor', '--receipt', receipt.number, '--json'], {
      fetch: agent.fetch,
    })
    const missing = await run(['doctor', '--receipt', 'NYGT-2026-99'], { fetch: agent.fetch })

    expect(byInvoice.stdout).toContain('✓ Fiók típusa: éles fiók')
    expect(JSON.parse(byReceipt.stdout)).toMatchObject({
      checks: expect.arrayContaining([
        { id: 'account', status: 'ok', message: expect.stringContaining('éles fiók') },
      ]),
    })
    expect(missing.stdout).toContain('! Fiók típusa: a(z) NYGT-2026-99 nyugta nem található.')
  })

  test('tesztfiók bizonylatából tesztfiókot állapít meg', async () => {
    const { agent, kassza } = fakeKassza()
    const invoice = await kassza.invoices.create(INVOICE_INPUT)

    const result = await run(['doctor', '--invoice', invoice.number], { fetch: agent.fetch })

    expect(result.stdout).toContain('✓ Fiók típusa: tesztfiók.')
  })
})

describe('kassza CLI: verify és lekérdezések', () => {
  test('verify sikeres és elutasított kulccsal', async () => {
    const agent = createFakeAgentFetch({ now: FAKE_NOW })
    const strict = createFakeAgentFetch({ now: FAKE_NOW, agentKeys: ['masik-kulcs'] })

    const ok = await run(['verify'], { fetch: agent.fetch })
    const rejected = await run(['verify'], { fetch: strict.fetch })
    const missing = await run(['verify'], { env: { SZAMLAZZ_AGENT_KEY: '' } })

    expect(ok).toMatchObject({ code: 0, stdout: expect.stringContaining('érvényes') })
    expect(rejected).toMatchObject({ code: 1, stderr: expect.stringContaining('elutasította') })
    expect(missing).toMatchObject({
      code: 1,
      stderr: expect.stringContaining('SZAMLAZZ_AGENT_KEY'),
    })
  })

  test('számla lekérdezése számlaszám, rendelésszám és külső azonosító alapján', async () => {
    const { agent, kassza } = fakeKassza()
    await kassza.invoices.create({ ...INVOICE_INPUT, orderNumber: 'WEB-1', externalId: 'CRM-1' })

    const byNumber = await run(['invoice', 'get', 'KASSZA-2026-1'], { fetch: agent.fetch })
    const byOrder = await run(['invoice', 'get', '--order', 'WEB-1'], { fetch: agent.fetch })
    const byExternal = await run(['invoice', 'get', '--external=CRM-1'], { fetch: agent.fetch })
    const missing = await run(['invoice', 'get', 'NINCS-1'], { fetch: agent.fetch })
    const ambiguous = await run(['invoice', 'get', 'A', '--order', 'B'], { fetch: agent.fetch })

    for (const result of [byNumber, byOrder, byExternal]) {
      expect(result.code).toBe(0)
      expect(JSON.parse(result.stdout)).toMatchObject({ header: { number: 'KASSZA-2026-1' } })
    }
    expect(missing).toMatchObject({
      code: 1,
      stderr: expect.stringContaining('Nincs ilyen számla'),
    })
    expect(ambiguous).toMatchObject({ code: 2, stderr: expect.stringContaining('Pontosan egyet') })
  })

  test('nyugta lekérdezése nyugtaszám és rendelésszám alapján', async () => {
    const { agent, kassza } = fakeKassza()
    await kassza.receipts.create({
      orderNumber: 'WEB-9',
      items: [{ name: 'Kávé', grossUnitPrice: 890, vat: 27 }],
    })

    const byNumber = await run(['receipt', 'get', 'NYGT-2026-1'], { fetch: agent.fetch })
    const byOrder = await run(['receipt', 'get', '--order', 'WEB-9'], { fetch: agent.fetch })
    const missing = await run(['receipt', 'get', 'NYGT-2026-5'], { fetch: agent.fetch })
    const none = await run(['receipt', 'get'], { fetch: agent.fetch })

    expect(JSON.parse(byNumber.stdout)).toMatchObject({
      number: 'NYGT-2026-1',
      orderNumber: 'WEB-9',
    })
    expect(JSON.parse(byOrder.stdout)).toMatchObject({ number: 'NYGT-2026-1' })
    expect(byNumber.stdout).not.toContain('"pdf"')
    expect(missing).toMatchObject({
      code: 1,
      stderr: expect.stringContaining('Nincs ilyen nyugta'),
    })
    expect(none.code).toBe(2)
  })

  test('a Számlázz.hu hibáját tippel együtt írja ki', async () => {
    const agent = createFakeAgentFetch({ now: FAKE_NOW })
    agent.fail({ code: 136 })

    const result = await run(['receipt', 'get', 'NYGT-2026-1'], { fetch: agent.fetch })

    expect(result).toMatchObject({ code: 1, stderr: expect.stringContaining('Tipp:') })
  })
})

describe('kassza CLI: xml preview', () => {
  test('a számla XML-t az Agent kulcs nélkül írja ki', async () => {
    const result = await run(['xml', 'preview', 'szamla.json'], {
      files: { 'szamla.json': JSON.stringify(INVOICE_INPUT) },
    })

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('<xmlszamla')
    expect(result.stdout).toContain('<szamlaagentkulcs>***</szamlaagentkulcs>')
    expect(result.stdout).toContain('<keltDatum>2026-10-02</keltDatum>')
    expect(result.stdout).not.toContain(TEST_AGENT_KEY)
  })

  test('nyugtát stdin-ről, alapbeállításokkal együtt is fogad', async () => {
    const stdin = JSON.stringify({
      defaults: { receipt: { prefix: 'NYGT', paymentMethod: 'készpénz' } },
      input: { items: [{ name: 'Kávé', grossUnitPrice: 890, vat: 27 }] },
    })

    const embedded = await run(['xml', 'preview', '-', '--type', 'receipt'], { stdin })
    const fromFile = await run(
      ['xml', 'preview', 'nyugta.json', '--type=receipt', '--defaults', 'alap.json'],
      {
        files: {
          'nyugta.json': JSON.stringify({ items: [{ name: 'Tea', grossUnitPrice: 500, vat: 27 }] }),
          'alap.json': JSON.stringify({ receipt: { prefix: 'BOLT', paymentMethod: 'bankkártya' } }),
        },
      },
    )

    expect(embedded.stdout).toContain('<elotag>NYGT</elotag>')
    expect(fromFile.stdout).toContain('<elotag>BOLT</elotag>')
    expect(fromFile.stdout).toContain('<fizmod>bankkártya</fizmod>')
  })

  test('hibás bemenetre érthető hibát ad', async () => {
    const files = {
      'rossz.json': '{nem json',
      'tomb.json': '[]',
      'vevo.json': JSON.stringify({ items: [] }),
      'tetel.json': JSON.stringify({ buyer: INVOICE_INPUT.buyer, items: 'sok' }),
      'ures.json': JSON.stringify({ buyer: INVOICE_INPUT.buyer, items: [] }),
      'alap.json': '[]',
    }

    const invalidJson = await run(['xml', 'preview', 'rossz.json'], { files })
    const notObject = await run(['xml', 'preview', 'tomb.json'], { files })
    const noBuyer = await run(['xml', 'preview', 'vevo.json'], { files })
    const badItems = await run(['xml', 'preview', 'tetel.json'], { files })
    const noItems = await run(['xml', 'preview', 'ures.json'], { files })
    const badDefaults = await run(['xml', 'preview', 'ures.json', '--defaults', 'alap.json'], {
      files,
    })
    const missingFile = await run(['xml', 'preview', 'nincs.json'], { files })
    const noPath = await run(['xml', 'preview'])
    const badType = await run(['xml', 'preview', 'ures.json', '--type', 'storno'], { files })

    expect(invalidJson).toMatchObject({
      code: 1,
      stderr: expect.stringContaining('nem érvényes JSON'),
    })
    expect(notObject).toMatchObject({ code: 1, stderr: expect.stringContaining('objektumnak') })
    expect(noBuyer).toMatchObject({ code: 1, stderr: expect.stringContaining('buyer') })
    expect(badItems).toMatchObject({ code: 1, stderr: expect.stringContaining('items') })
    expect(noItems).toMatchObject({ code: 1, stderr: expect.stringContaining('tétel') })
    expect(badDefaults).toMatchObject({
      code: 1,
      stderr: expect.stringContaining('KasszaDefaults'),
    })
    expect(missingFile).toMatchObject({ code: 1, stderr: expect.stringContaining('nem olvasható') })
    expect(noPath.code).toBe(2)
    expect(badType).toMatchObject({
      code: 2,
      stderr: expect.stringContaining('invoice vagy receipt'),
    })
  })
})

describe('kassza CLI: nav summary', () => {
  async function receiptsFile(): Promise<string> {
    const { kassza } = fakeKassza({ testAccount: false })
    const first = await kassza.receipts.create({
      items: [{ name: 'Kávé', grossUnitPrice: 890, vat: 27 }],
      downloadPdf: false,
    })
    const second = await kassza.receipts.create({
      items: [{ name: 'Könyv', grossUnitPrice: 5000, vat: 5 }],
      downloadPdf: false,
    })
    const reversal = await kassza.receipts.reverse({
      receiptNumber: first.number,
      downloadPdf: false,
    })
    return JSON.stringify([first, second, reversal])
  }

  test('napi összesítőt készít szövegként és JSON-ként', async () => {
    const files = { 'nyugtak.json': await receiptsFile() }

    const text = await run(['nav', 'summary', '--file', 'nyugtak.json'], { files })
    const json = await run(['nav', 'summary', '--file', 'nyugtak.json', '--json'], { files })

    expect(text.code).toBe(0)
    expect(text.stdout).toContain('Tárgynap: 2026-10-02')
    expect(text.stdout).toContain('Kezdő nyugtasorszám: NYGT-2026-1')
    expect(text.stdout).toContain('5%: értékesítés')
    expect(JSON.parse(json.stdout)).toMatchObject([
      {
        numberOfSaleDocument: 2,
        numberOfModifyingDocument: 1,
        total: 5000,
        vatCategories: [
          { vat: '5%', saleDocument: 5000, modifyingDocument: 0 },
          { vat: '27%', saleDocument: 890, modifyingDocument: -890 },
        ],
      },
    ])
  })

  test('időszakra szűr, a tesztnyugtákat csak kérésre veszi be', async () => {
    const { kassza } = fakeKassza()
    const receipt = await kassza.receipts.create({
      items: [{ name: 'Kávé', grossUnitPrice: 890, vat: 27 }],
      downloadPdf: false,
    })
    const files = { 'teszt.json': JSON.stringify({ receipts: [receipt] }) }

    const skipped = await run(['nav', 'summary', '--file', 'teszt.json'], { files })
    const included = await run(['nav', 'summary', '--file', 'teszt.json', '--include-test'], {
      files,
    })
    const outside = await run(
      ['nav', 'summary', '--file', 'teszt.json', '--include-test', '--from', '2026-10-03'],
      { files },
    )

    expect(skipped.stdout).toContain('Nincs összesíthető nyugta')
    expect(included.stdout).toContain('Végösszeg: 890')
    expect(outside.stdout).toContain('Nincs összesíthető nyugta')
  })

  test('hibás paraméterekre és fájlra hibát ad', async () => {
    const files = { 'rossz.json': JSON.stringify([{ number: 'X' }]), 'obj.json': '{}' }

    const noFile = await run(['nav', 'summary'])
    const badDate = await run(['nav', 'summary', '--file', 'rossz.json', '--from', '2026.10.01'])
    const reversed = await run([
      'nav',
      'summary',
      '--file',
      'rossz.json',
      '--from',
      '2026-10-05',
      '--to',
      '2026-10-01',
    ])
    const badItem = await run(['nav', 'summary', '--file', 'rossz.json'], { files })
    const notList = await run(['nav', 'summary', '--file', 'obj.json'], { files })

    expect(noFile.code).toBe(2)
    expect(badDate).toMatchObject({ code: 2, stderr: expect.stringContaining('ÉÉÉÉ-HH-NN') })
    expect(reversed.code).toBe(2)
    expect(badItem).toMatchObject({
      code: 1,
      stderr: expect.stringContaining('1. elem nem kassza nyugta'),
    })
    expect(notList).toMatchObject({ code: 1, stderr: expect.stringContaining('tömbjét') })
  })
})

describe('kassza CLI: mcp', () => {
  function discover(id: number): string {
    return JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'tools/list',
      params: { _meta: MODERN_META },
    })
  }

  test('stdio-n soronként válaszol, csak olvasó módban', async () => {
    const agent = createFakeAgentFetch({ now: FAKE_NOW })

    const result = await run(['mcp'], {
      fetch: agent.fetch,
      lines: [
        discover(1),
        '',
        '{rossz',
        JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
      ],
    })
    const responses = result.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))

    expect(result.code).toBe(0)
    expect(result.stderr).toContain('csak olvasás')
    expect(responses).toHaveLength(2)
    expect(responses[0]).toMatchObject({ id: 1, result: { resultType: 'complete' } })
    expect(responses[0].result.tools.map((tool: { name: string }) => tool.name)).not.toContain(
      'create_invoice',
    )
    expect(responses[1]).toMatchObject({ id: null, error: { code: -32700 } })
  })

  test('írás engedélyezhető kapcsolóval és környezeti változóval, kulcs nélkül figyelmeztet', async () => {
    const byFlag = await run(['mcp', '--allow-write'], { lines: [discover(1)] })
    const byEnv = await run(['mcp'], {
      env: { KASSZA_MCP_ALLOW_WRITE: 'igen', SZAMLAZZ_AGENT_KEY: '' },
      lines: [discover(2)],
    })

    expect(byFlag.stderr).toContain('írás engedélyezve')
    expect(byFlag.stdout).toContain('"name":"create_invoice"')
    expect(byEnv.stderr).toContain('írás engedélyezve')
    expect(byEnv.stderr).toContain('hiányzik a SZAMLAZZ_AGENT_KEY')
  })

  test('alapbeállításokat fájlból olvas', async () => {
    const result = await run(['mcp', '--defaults', 'alap.json'], {
      files: {
        'alap.json': JSON.stringify({ receipt: { prefix: 'BOLT', paymentMethod: 'készpénz' } }),
      },
      lines: [
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'preview_receipt',
            arguments: { items: [{ name: 'Kávé', grossUnitPrice: 890, vat: 27 }] },
            _meta: MODERN_META,
          },
        }),
      ],
    })

    expect(JSON.parse(result.stdout)).toMatchObject({
      result: { isError: false, structuredContent: { prefix: 'BOLT' } },
    })
  })
})
