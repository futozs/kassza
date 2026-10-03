import type { JsonRpcResponse, KasszaMcpServerOptions, McpConnection } from '../src/mcp'
import { createKasszaMcpServer } from '../src/mcp'
import { createFakeAgentFetch, type FakeAgent, type FakeAgentOptions } from '../src/testing'
import { FAKE_NOW } from './fake-agent'
import { TEST_AGENT_KEY } from './helpers'

export const MODERN_META: Readonly<Record<string, unknown>> = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientCapabilities': {},
  'io.modelcontextprotocol/clientInfo': { name: 'kassza-teszt', version: '1.0.0' },
}

export interface McpHarness {
  readonly agent: FakeAgent
  readonly connection: McpConnection
  request(method: string, params?: Record<string, unknown>): Promise<JsonRpcResponse>
  call(name: string, args?: Record<string, unknown>): Promise<McpCallResult>
}

export interface McpCallResult {
  readonly isError: boolean
  readonly text: string
  readonly data: Record<string, unknown>
}

let nextId = 1

export function mcpHarness(
  options: Partial<KasszaMcpServerOptions> = {},
  agentOptions: FakeAgentOptions = {},
): McpHarness {
  const agent = createFakeAgentFetch({ now: FAKE_NOW, ...agentOptions })
  const server = createKasszaMcpServer({
    agentKey: TEST_AGENT_KEY,
    fetch: agent.fetch,
    retryDelayMs: 0,
    recoveryDelayMs: 0,
    now: FAKE_NOW,
    confirmationSecret: 'kassza-teszt-titok',
    defaults: { receipt: { prefix: 'NYGT', paymentMethod: 'készpénz' } },
    ...options,
  })
  const connection = server.connect()
  const request = async (
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<JsonRpcResponse> => {
    const response = await connection.handle({
      jsonrpc: '2.0',
      id: nextId++,
      method,
      params: { ...params, _meta: MODERN_META },
    })
    if (response === undefined || Array.isArray(response)) {
      throw new Error('Egyetlen JSON-RPC választ vártunk.')
    }
    return response as JsonRpcResponse
  }
  const call = async (name: string, args: Record<string, unknown> = {}): Promise<McpCallResult> => {
    const response = await request('tools/call', { name, arguments: args })
    if (!('result' in response)) throw new Error(`Protokollhiba: ${response.error.message}`)
    const result = response.result as {
      readonly isError: boolean
      readonly content: readonly { readonly text: string }[]
      readonly structuredContent?: Record<string, unknown>
    }
    return {
      isError: result.isError,
      text: result.content.map((block) => block.text).join('\n'),
      data: result.structuredContent ?? {},
    }
  }
  return { agent, connection, request, call }
}

export interface ListedTool {
  readonly name: string
  readonly inputSchema: { readonly type: string }
  readonly annotations: Readonly<Record<string, boolean>>
}

export function toolsOf(response: JsonRpcResponse): readonly ListedTool[] {
  if (!('result' in response)) throw new Error(`Protokollhiba: ${response.error.message}`)
  const tools = response.result.tools
  if (!Array.isArray(tools)) throw new Error('A válaszban nincs tools tömb.')
  return tools as readonly ListedTool[]
}
