import type { IncomingMessage, ServerResponse } from 'node:http'

export type WebRequestHandler = (request: Request) => Response | Promise<Response>

export interface NodeRequestLike extends AsyncIterable<Uint8Array | string> {
  readonly method?: string | undefined
  readonly url?: string | undefined
  readonly headers: IncomingMessage['headers']
  readonly readableEnded?: boolean | undefined
  readonly socket?: { readonly encrypted?: boolean | undefined } | undefined
  readonly originalUrl?: string | undefined
  readonly body?: unknown
  readonly rawBody?: unknown
}

export interface NodeResponseLike {
  statusCode: number
  setHeader(name: string, value: string | readonly string[]): unknown
  end(chunk?: Uint8Array): unknown
  readonly headersSent?: boolean | undefined
}

export type NodeNext = (error?: unknown) => void

export interface ToNodeHandlerOptions {
  readonly trustProxy?: boolean | undefined
  readonly onError?: ((error: unknown) => void) | undefined
}

export type NodeHandler = (
  request: IncomingMessage | NodeRequestLike,
  response: ServerResponse | NodeResponseLike,
  next?: NodeNext,
) => Promise<void>

const encoder = new TextEncoder()

export class NodeBodyError extends Error {
  override readonly name: string = 'NodeBodyError'
}

function firstHeader(value: string | readonly string[] | undefined): string | undefined {
  if (value === undefined) return undefined
  return typeof value === 'string' ? value : value[0]
}

function requestUrl(request: NodeRequestLike, trustProxy: boolean): string {
  const forwardedProto = trustProxy
    ? firstHeader(request.headers['x-forwarded-proto'])?.split(',')[0]?.trim()
    : undefined
  const forwardedHost = trustProxy
    ? firstHeader(request.headers['x-forwarded-host'])?.split(',')[0]?.trim()
    : undefined
  const protocol = forwardedProto || (request.socket?.encrypted ? 'https' : 'http')
  const host = forwardedHost || firstHeader(request.headers.host) || 'localhost'
  const path = request.originalUrl ?? request.url ?? '/'
  return `${protocol}://${host}${path.startsWith('/') ? path : `/${path}`}`
}

function requestHeaders(request: NodeRequestLike): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue
    if (typeof value === 'string') headers.append(name, value)
    else for (const item of value) headers.append(name, item)
  }
  return headers
}

function streamOf(source: AsyncIterable<Uint8Array | string>): ReadableStream<Uint8Array> {
  const iterator = source[Symbol.asyncIterator]()
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { value, done } = await iterator.next()
      if (done) {
        controller.close()
        return
      }
      controller.enqueue(typeof value === 'string' ? encoder.encode(value) : value)
    },
    async cancel(reason) {
      await iterator.return?.(reason)
    },
  })
}

function bytesOf(value: unknown): Uint8Array | string | undefined {
  if (typeof value === 'string') return value
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  return undefined
}

function requestBody(request: NodeRequestLike): BodyInit | ReadableStream<Uint8Array> | undefined {
  const method = (request.method ?? 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD') return undefined
  const raw = bytesOf(request.rawBody)
  if (raw !== undefined) return raw as BodyInit
  if (request.body !== undefined && request.body !== null) {
    const body = bytesOf(request.body)
    if (body !== undefined) return body as BodyInit
    throw new NodeBodyError(
      'A kérés törzsét egy middleware (például az express.json()) már feldolgozta, így az aláírás nem ellenőrizhető. A webhook útvonalat az express.json() elé tedd, vagy használd rajta az express.raw({ type: "*/*" }) middleware-t. NestJS-ben kapcsold be a rawBody: true beállítást.',
    )
  }
  if (request.readableEnded) {
    throw new NodeBodyError(
      'A kérés törzsét egy middleware már elolvasta, és nem adta tovább. A webhook útvonalra ne tegyél törzsolvasó middleware-t, vagy használd az express.raw({ type: "*/*" }) middleware-t.',
    )
  }
  return streamOf(request)
}

export function toWebRequest(
  request: IncomingMessage | NodeRequestLike,
  options: ToNodeHandlerOptions = {},
): Request {
  const node = request as NodeRequestLike
  const body = requestBody(node)
  const init: RequestInit & { duplex?: 'half' } = {
    method: node.method ?? 'GET',
    headers: requestHeaders(node),
  }
  if (body !== undefined) {
    init.body = body as BodyInit
    if (body instanceof ReadableStream) init.duplex = 'half'
  }
  return new Request(requestUrl(node, options.trustProxy === true), init)
}

export async function writeWebResponse(
  source: Response,
  target: ServerResponse | NodeResponseLike,
): Promise<void> {
  const response = target as NodeResponseLike
  response.statusCode = source.status
  const setCookies = source.headers.getSetCookie()
  source.headers.forEach((value, name) => {
    if (name.toLowerCase() === 'set-cookie') return
    response.setHeader(name, value)
  })
  if (setCookies.length > 0) response.setHeader('set-cookie', setCookies)
  const body = new Uint8Array(await source.arrayBuffer())
  response.end(body.byteLength > 0 ? body : undefined)
}

function reportError(options: ToNodeHandlerOptions, error: unknown): void {
  try {
    if (options.onError) options.onError(error)
    else console.error('[kassza] A Node kérés kezelése nem sikerült.', error)
  } catch {
    return
  }
}

export function toNodeHandler(
  handler: WebRequestHandler,
  options: ToNodeHandlerOptions = {},
): NodeHandler {
  return async (request, response, next) => {
    try {
      const result = await handler(toWebRequest(request, options))
      await writeWebResponse(result, response)
    } catch (error) {
      if (next) {
        next(error)
        return
      }
      reportError(options, error)
      const target = response as NodeResponseLike
      if (target.headersSent) return
      target.statusCode = 500
      target.setHeader('content-type', 'text/plain; charset=utf-8')
      target.end(encoder.encode('A kérés feldolgozása nem sikerült.'))
    }
  }
}
