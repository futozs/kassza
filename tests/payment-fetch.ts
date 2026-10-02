export interface RecordedRequest {
  readonly url: string
  readonly method: string
  readonly headers: Headers
  readonly body: string
}

export type PaymentRoute = (request: RecordedRequest) => Response | Promise<Response>

export interface RoutedFetch {
  readonly fetch: typeof globalThis.fetch
  readonly requests: RecordedRequest[]
}

export function routedFetch(
  routes: ReadonlyArray<readonly [string | RegExp, PaymentRoute]>,
): RoutedFetch {
  const requests: RecordedRequest[] = []
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init)
    const recorded: RecordedRequest = {
      url: request.url,
      method: request.method,
      headers: request.headers,
      body: await request.text(),
    }
    requests.push(recorded)
    const route = routes.find(([pattern]) =>
      typeof pattern === 'string' ? recorded.url.startsWith(pattern) : pattern.test(recorded.url),
    )
    if (!route) return new Response('ismeretlen útvonal', { status: 404 })
    return route[1](recorded)
  }
  return { fetch: fetchImpl as typeof globalThis.fetch, requests }
}

export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

export function webhookRequest(
  body: string,
  headers: Readonly<Record<string, string>> = {},
  url = 'https://bolt.example.hu/api/webhook',
): Request {
  return new Request(url, { method: 'POST', body, headers })
}
