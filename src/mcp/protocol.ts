export const MCP_MODERN_VERSIONS: readonly string[] = ['2026-07-28']

export const MCP_LEGACY_VERSIONS: readonly string[] = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
  '2024-11-05',
]

export const MCP_SUPPORTED_VERSIONS: readonly string[] = [
  ...MCP_MODERN_VERSIONS,
  ...MCP_LEGACY_VERSIONS,
]

export const META_PROTOCOL_VERSION = 'io.modelcontextprotocol/protocolVersion'
export const META_CLIENT_CAPABILITIES = 'io.modelcontextprotocol/clientCapabilities'
export const META_SERVER_INFO = 'io.modelcontextprotocol/serverInfo'

export const JSON_RPC_PARSE_ERROR = -32700
export const JSON_RPC_INVALID_REQUEST = -32600
export const JSON_RPC_METHOD_NOT_FOUND = -32601
export const JSON_RPC_INVALID_PARAMS = -32602
export const JSON_RPC_INTERNAL_ERROR = -32603
export const MCP_UNSUPPORTED_PROTOCOL_VERSION = -32022

export type JsonRpcId = string | number

export type JsonObject = Readonly<Record<string, unknown>>

export interface JsonRpcSuccess {
  readonly jsonrpc: '2.0'
  readonly id: JsonRpcId
  readonly result: JsonObject
}

export interface JsonRpcErrorObject {
  readonly code: number
  readonly message: string
  readonly data?: unknown
}

export interface JsonRpcFailure {
  readonly jsonrpc: '2.0'
  readonly id: JsonRpcId | null
  readonly error: JsonRpcErrorObject
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure

export interface McpRequest {
  readonly kind: 'request'
  readonly id: JsonRpcId
  readonly method: string
  readonly params: JsonObject
}

export interface McpNotification {
  readonly kind: 'notification'
  readonly method: string
}

export interface McpIgnored {
  readonly kind: 'ignored'
}

export type McpMessage = McpRequest | McpNotification | McpIgnored

export interface McpProtocolErrorOptions {
  readonly id?: JsonRpcId | null | undefined
  readonly data?: unknown
}

export class McpProtocolError extends Error {
  override readonly name: string = 'McpProtocolError'
  readonly code: number
  readonly id: JsonRpcId | null
  readonly data: unknown

  constructor(code: number, message: string, options: McpProtocolErrorOptions = {}) {
    super(message)
    this.code = code
    this.id = options.id ?? null
    this.data = options.data
  }
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isValidId(value: unknown): value is JsonRpcId {
  return typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value))
}

function readableId(value: unknown): JsonRpcId | null {
  return isValidId(value) ? value : null
}

export function failure(
  id: JsonRpcId | null,
  code: number,
  message: string,
  data?: unknown,
): JsonRpcFailure {
  const error: JsonRpcErrorObject = data === undefined ? { code, message } : { code, message, data }
  return { jsonrpc: '2.0', id, error }
}

export function success(id: JsonRpcId, result: JsonObject): JsonRpcSuccess {
  return { jsonrpc: '2.0', id, result }
}

export function parseMcpMessage(value: unknown): McpMessage {
  if (!isJsonObject(value) || value.jsonrpc !== '2.0') {
    throw new McpProtocolError(JSON_RPC_INVALID_REQUEST, 'Érvénytelen JSON-RPC 2.0 üzenet.', {
      id: isJsonObject(value) ? readableId(value.id) : null,
    })
  }
  if (typeof value.method !== 'string') {
    if ('result' in value || 'error' in value) return { kind: 'ignored' }
    throw new McpProtocolError(JSON_RPC_INVALID_REQUEST, 'Hiányzik a method mező.', {
      id: readableId(value.id),
    })
  }
  if (!('id' in value)) return { kind: 'notification', method: value.method }
  if (!isValidId(value.id)) {
    throw new McpProtocolError(
      JSON_RPC_INVALID_REQUEST,
      'A kérés azonosítója (id) csak szöveg vagy szám lehet, null nem.',
    )
  }
  if (value.params !== undefined && !isJsonObject(value.params)) {
    throw new McpProtocolError(
      JSON_RPC_INVALID_PARAMS,
      'A params mezőnek objektumnak kell lennie.',
      {
        id: value.id,
      },
    )
  }
  return { kind: 'request', id: value.id, method: value.method, params: value.params ?? {} }
}

export function protocolFailure(error: McpProtocolError): JsonRpcFailure {
  return failure(error.id, error.code, error.message, error.data)
}
