import { type AgentContext, createAgentContext, type SzamlazzOptions } from '../src/core/context'

export const TEST_AGENT_KEY = 'tesztkulcs0123456789abcdef'

export const FAKE_PDF_BYTES: Uint8Array = new TextEncoder().encode('%PDF-1.4\n%fake pdf\n%%EOF')

export interface MockResponse {
  readonly status?: number
  readonly headers?: Record<string, string>
  readonly body?: string | Uint8Array
}

export interface CapturedAttachment {
  readonly field: string
  readonly filename: string
  readonly size: number
}

export interface CapturedRequest {
  readonly url: string
  readonly field: string
  readonly xml: string
  readonly attachments: readonly CapturedAttachment[]
  readonly cookie: string | null
}

export type MockHandler =
  | MockResponse
  | Error
  | ((request: CapturedRequest, index: number) => MockResponse | Error)

export interface MockAgent {
  readonly fetch: typeof globalThis.fetch
  readonly calls: CapturedRequest[]
  readonly lastCall: () => CapturedRequest
}

async function captureRequest(
  url: string,
  init: RequestInit | undefined,
): Promise<CapturedRequest> {
  const body = init?.body
  if (!(body instanceof FormData)) throw new Error('A kérés törzse nem FormData')
  let field = ''
  let xml = ''
  const attachments: CapturedAttachment[] = []
  for (const [name, value] of body.entries()) {
    if (typeof value === 'string') continue
    if (name.startsWith('action-')) {
      field = name
      xml = await value.text()
    } else {
      attachments.push({ field: name, filename: value.name, size: value.size })
    }
  }
  const headers = new Headers(init?.headers)
  return { url, field, xml, attachments, cookie: headers.get('cookie') }
}

export function mockAgent(...handlers: MockHandler[]): MockAgent {
  const calls: CapturedRequest[] = []
  const fetchMock = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = await captureRequest(String(input), init)
    const index = calls.length
    calls.push(request)
    const handler = handlers[Math.min(index, handlers.length - 1)]
    if (handler === undefined) throw new Error('Nincs beállított mock válasz')
    const result = typeof handler === 'function' ? handler(request, index) : handler
    if (result instanceof Error) throw result
    const responseBody = result.body ?? ''
    return new Response(
      typeof responseBody === 'string' ? responseBody : new Uint8Array(responseBody),
      { status: result.status ?? 200, headers: result.headers ?? {} },
    )
  }
  return {
    fetch: fetchMock as typeof globalThis.fetch,
    calls,
    lastCall: () => {
      const call = calls.at(-1)
      if (!call) throw new Error('Még nem volt kérés')
      return call
    },
  }
}

export interface TestContext {
  readonly ctx: AgentContext
  readonly agent: MockAgent
}

export function createTestContext(
  handlers: MockHandler | MockHandler[],
  options: Partial<SzamlazzOptions> = {},
): TestContext {
  const agent = mockAgent(...(Array.isArray(handlers) ? handlers : [handlers]))
  const ctx = createAgentContext({
    agentKey: TEST_AGENT_KEY,
    retryDelayMs: 0,
    ...options,
    fetch: agent.fetch,
  })
  return { ctx, agent }
}

export function xmlSuccessResponse(root: string, namespace: string, inner: string): MockResponse {
  return {
    headers: { 'content-type': 'application/xml; charset=UTF-8' },
    body: `<?xml version="1.0" encoding="UTF-8"?>\n<${root} xmlns="${namespace}">\n${inner}\n</${root}>`,
  }
}

export function invoiceXmlResponse(inner: string): MockResponse {
  return xmlSuccessResponse('xmlszamlavalasz', 'http://www.szamlazz.hu/xmlszamlavalasz', inner)
}

export function textErrorResponse(message: string, code?: number): MockResponse {
  return {
    headers:
      code === undefined
        ? {}
        : { szlahu_error_code: String(code), szlahu_error: encodeURIComponent(message) },
    body: `[ERR] ${message} ---------- t.getMessage(): ${message}\n---------- [CEG:1] [MODUL:X]\njava.lang.Thread.run(Thread.java:662)`,
  }
}
