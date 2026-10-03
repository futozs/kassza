import { describe, expect, test } from 'vitest'
import { MODERN_META, mcpHarness, toolsOf } from '../../tests/mcp'
import { KASSZA_VERSION } from '../core/version'
import { createKasszaMcpServer, MCP_SUPPORTED_VERSIONS } from './index'

const WRITE_TOOLS = ['create_invoice', 'create_receipt', 'reverse_invoice', 'reverse_receipt']

describe('kassza MCP szerver: protokoll', () => {
  test('a server/discover a modern és a legacy verziókat, a képességeket és az azonosítót adja', async () => {
    const { request } = mcpHarness()

    const response = await request('server/discover')

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      result: {
        resultType: 'complete',
        supportedVersions: ['2026-07-28', '2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'],
        capabilities: { tools: {} },
        ttlMs: 3_600_000,
        cacheScope: 'private',
        _meta: {
          'io.modelcontextprotocol/serverInfo': { name: 'kassza', version: KASSZA_VERSION },
        },
      },
    })
    expect(JSON.stringify(response)).toContain('KASSZA_MCP_ALLOW_WRITE')
  })

  test('nem támogatott modern verzióra -32022-t ad a támogatott verziók listájával', async () => {
    const connection = createKasszaMcpServer().connect()

    const response = await connection.handle({
      jsonrpc: '2.0',
      id: 'v1',
      method: 'tools/list',
      params: {
        _meta: { ...MODERN_META, 'io.modelcontextprotocol/protocolVersion': '1900-01-01' },
      },
    })

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 'v1',
      error: {
        code: -32022,
        message: 'Unsupported protocol version',
        data: { supported: [...MCP_SUPPORTED_VERSIONS], requested: '1900-01-01' },
      },
    })
  })

  test('hiányzó kliensképességekre, hibás verziótípusra és _meta nélküli kérésre -32602-t ad', async () => {
    const connection = createKasszaMcpServer().connect()
    const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' }

    const missingCapabilities = await connection.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
      params: { _meta: meta },
    })
    const wrongType = await connection.handle({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: { _meta: { ...MODERN_META, 'io.modelcontextprotocol/protocolVersion': 2026 } },
    })
    const withoutMeta = await connection.handle({ jsonrpc: '2.0', id: 3, method: 'tools/list' })

    expect(missingCapabilities).toMatchObject({ id: 1, error: { code: -32602 } })
    expect(wrongType).toMatchObject({ id: 2, error: { code: -32602 } })
    expect(withoutMeta).toMatchObject({
      id: 3,
      error: { code: -32602, message: expect.stringContaining('initialize') },
    })
  })

  test('legacy initialize után _meta nélkül is kiszolgál, a ping működik', async () => {
    const connection = createKasszaMcpServer().connect()

    const ping = await connection.handle({ jsonrpc: '2.0', id: 0, method: 'ping' })
    const initialize = await connection.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'regi-kliens', version: '0.1.0' },
      },
    })
    const initialized = await connection.handle({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    })
    const list = await connection.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' })

    expect(ping).toEqual({ jsonrpc: '2.0', id: 0, result: {} })
    expect(initialize).toMatchObject({
      id: 1,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'kassza', version: KASSZA_VERSION },
      },
    })
    expect(initialized).toBeUndefined()
    expect(list).toMatchObject({ id: 2, result: { tools: expect.any(Array) } })
    expect(JSON.stringify(list)).not.toContain('resultType')
  })

  test('ismeretlen legacy verziónál a legújabb támogatott legacy verziót ajánlja', async () => {
    const connection = createKasszaMcpServer().connect()

    const response = await connection.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2099-01-01', capabilities: {} },
    })
    const missing = await connection.handle({
      jsonrpc: '2.0',
      id: 2,
      method: 'initialize',
      params: {},
    })

    expect(response).toMatchObject({ result: { protocolVersion: '2025-11-25' } })
    expect(missing).toMatchObject({ id: 2, error: { code: -32602 } })
  })

  test('hibás JSON-ra -32700-at, hibás üzenetekre -32600-at vagy -32602-t ad', async () => {
    const connection = createKasszaMcpServer().connect()

    const parseError = await connection.handleLine('{nem json')
    const noVersion = await connection.handle({ id: 1, method: 'tools/list' })
    const nullId = await connection.handle({ jsonrpc: '2.0', id: null, method: 'tools/list' })
    const noMethod = await connection.handle({ jsonrpc: '2.0', id: 4 })
    const arrayParams = await connection.handle({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/list',
      params: [],
    })

    expect(JSON.parse(parseError ?? '')).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Érvénytelen JSON.' },
    })
    expect(noVersion).toMatchObject({ id: 1, error: { code: -32600 } })
    expect(nullId).toMatchObject({ id: null, error: { code: -32600 } })
    expect(noMethod).toMatchObject({ id: 4, error: { code: -32600 } })
    expect(arrayParams).toMatchObject({ id: 5, error: { code: -32602 } })
  })

  test('ismeretlen metódusra -32601-et ad mindkét érában', async () => {
    const { request, connection } = mcpHarness()
    await connection.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-11-25', capabilities: {} },
    })

    const modern = await request('resources/list')
    const legacy = await connection.handle({ jsonrpc: '2.0', id: 2, method: 'prompts/list' })
    const modernPing = await request('ping')

    expect(modern).toMatchObject({ error: { code: -32601 } })
    expect(legacy).toMatchObject({ id: 2, error: { code: -32601 } })
    expect(modernPing).toMatchObject({ error: { code: -32601 } })
  })

  test('értesítésre és a kliens válaszaira nem válaszol, a batchet tömbként kezeli', async () => {
    const connection = createKasszaMcpServer().connect()

    const notification = await connection.handle({
      jsonrpc: '2.0',
      method: 'notifications/cancelled',
      params: { requestId: 1 },
    })
    const clientResponse = await connection.handle({ jsonrpc: '2.0', id: 9, result: {} })
    const batch = await connection.handle([
      { jsonrpc: '2.0', id: 'a', method: 'server/discover', params: { _meta: MODERN_META } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { jsonrpc: '2.0', id: 'b', method: 'nincs/ilyen', params: { _meta: MODERN_META } },
    ])
    const onlyNotifications = await connection.handle([
      { jsonrpc: '2.0', method: 'notifications/initialized' },
    ])
    const empty = await connection.handle([])

    expect(notification).toBeUndefined()
    expect(clientResponse).toBeUndefined()
    expect(batch).toMatchObject([
      { id: 'a', result: { resultType: 'complete' } },
      { id: 'b', error: { code: -32601 } },
    ])
    expect(onlyNotifications).toBeUndefined()
    expect(empty).toMatchObject({ id: null, error: { code: -32600 } })
  })

  test('a handleLine egysoros JSON-t ad vissza, az üres sort figyelmen kívül hagyja', async () => {
    const connection = createKasszaMcpServer().connect()

    const line = await connection.handleLine(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'server/discover',
        params: { _meta: MODERN_META },
      }),
    )

    expect(line).toBeDefined()
    expect(line).not.toContain('\n')
    expect(JSON.parse(line ?? '')).toMatchObject({ id: 1, result: { resultType: 'complete' } })
    expect(await connection.handleLine('   ')).toBeUndefined()
  })
})

describe('kassza MCP szerver: eszközlista', () => {
  test('alapból csak az olvasó eszközöket listázza, determinisztikus sorrendben', async () => {
    const { request } = mcpHarness()

    const first = await request('tools/list')
    const second = await request('tools/list')

    expect(toolsOf(first).map((tool) => tool.name)).toEqual([
      'preview_invoice',
      'preview_receipt',
      'preview_reversal',
      'get_invoice',
      'get_receipt',
      'query_taxpayer',
      'nav_daily_summary',
    ])
    expect(toolsOf(second)).toEqual(toolsOf(first))
    expect(first).toMatchObject({
      result: { resultType: 'complete', ttlMs: 3_600_000, cacheScope: 'private' },
    })
  })

  test('írási engedéllyel az író eszközöket is listázza, megfelelő annotációkkal', async () => {
    const { request } = mcpHarness({ allowWrite: true })

    const tools = toolsOf(await request('tools/list'))

    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([...WRITE_TOOLS, 'preview_invoice']),
    )
    expect(tools).toHaveLength(11)
    for (const tool of tools) expect(tool.inputSchema.type).toBe('object')
    expect(tools.find((tool) => tool.name === 'reverse_invoice')?.annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: true,
    })
    expect(tools.find((tool) => tool.name === 'preview_invoice')?.annotations).toMatchObject({
      readOnlyHint: true,
      openWorldHint: false,
    })
  })

  test('cursorra, ismeretlen eszközre, hiányzó névre és hibás argumentumra -32602-t ad', async () => {
    const { request } = mcpHarness()

    const cursor = await request('tools/list', { cursor: 'masodik-oldal' })
    const unknownTool = await request('tools/call', { name: 'nincs_ilyen', arguments: {} })
    const missingName = await request('tools/call', { arguments: {} })
    const badArguments = await request('tools/call', { name: 'get_invoice', arguments: 'x' })

    for (const response of [cursor, unknownTool, missingName, badArguments]) {
      expect(response).toMatchObject({ error: { code: -32602 } })
    }
    expect(unknownTool).toMatchObject({ error: { message: 'Ismeretlen eszköz: nincs_ilyen' } })
  })

  test('kikapcsolt írásnál az író eszköz hívása eszközhibát ad, és nem ír', async () => {
    const { call, agent } = mcpHarness()

    const result = await call('create_invoice', { confirmation: 'x' })

    expect(result.isError).toBe(true)
    expect(result.text).toContain('KASSZA_MCP_ALLOW_WRITE=1')
    expect(agent.requests).toHaveLength(0)
  })

  test('a szerver kiírja az eszközök listáját az írási jelzéssel', () => {
    const server = createKasszaMcpServer()

    expect(server.tools.filter((tool) => tool.write).map((tool) => tool.name)).toEqual(WRITE_TOOLS)
  })
})
