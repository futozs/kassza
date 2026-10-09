import { describe, expect, test, vi } from 'vitest'
import { fakeKassza } from '../../tests/fake-agent'
import { TEST_AGENT_KEY } from '../../tests/helpers'
import { createKassza } from '../client'
import { memoryStore } from '../core/store'
import { createFakeAgentFetch } from '../testing'
import {
  combineHooks,
  createMetricsRegistry,
  type ObserveSpan,
  type ObserveTracer,
  observe,
  SPAN_STATUS_ERROR,
  SPAN_STATUS_OK,
} from './index'

const INVOICE = {
  orderNumber: 'OBS-1',
  buyer: {
    name: 'Titkos Vevő Kft.',
    zip: '1111',
    city: 'Budapest',
    address: 'Fő utca 1.',
    email: 'titok@pelda.hu',
    taxNumber: '12345678-2-42',
  },
  items: [{ name: 'Termék', grossUnitPrice: 12_700, vat: 27 as const }],
}

interface RecordedSpan {
  name: string
  attributes: Record<string, unknown>
  status?: { code: number; message?: string }
  exceptions: unknown[]
  ended: number
}

function recordingTracer(): ObserveTracer & { spans: RecordedSpan[] } {
  const spans: RecordedSpan[] = []
  return {
    spans,
    startSpan(name, options) {
      const recorded: RecordedSpan = {
        name,
        attributes: { ...options?.attributes },
        exceptions: [],
        ended: 0,
      }
      spans.push(recorded)
      const span: ObserveSpan = {
        setAttribute: (key, value) => {
          recorded.attributes[key] = value
        },
        setStatus: (status) => {
          recorded.status = status
        },
        recordException: (exception) => recorded.exceptions.push(exception),
        end: () => {
          recorded.ended += 1
        },
      }
      return span
    },
  }
}

function recordingLogger() {
  const lines: { level: string; data: Record<string, unknown>; message: string }[] = []
  const at = (level: string) => (data: Record<string, unknown>, message: string) =>
    lines.push({ level, data, message })
  return { lines, logger: { debug: at('debug'), info: at('info'), warn: at('warn') } }
}

describe('observe', () => {
  test('kérésenként spant, metrikát és strukturált naplót ad, titok nélkül', async () => {
    const tracer = recordingTracer()
    const metrics = createMetricsRegistry()
    const { lines, logger } = recordingLogger()
    const { kassza } = fakeKassza({}, { hooks: observe({ tracer, metrics, logger }) })

    await kassza.invoices.createOnce(INVOICE)

    expect(tracer.spans.map((span) => span.name)).toEqual([
      'kassza getInvoiceXml',
      'kassza getInvoiceXml',
      'kassza createInvoice',
    ])
    expect(tracer.spans.every((span) => span.ended === 1)).toBe(true)
    const create = tracer.spans[2]
    expect(create?.attributes).toMatchObject({
      'kassza.action': 'createInvoice',
      'kassza.attempt': 1,
      'http.status_code': 200,
      'kassza.session_reused': expect.any(Boolean),
      'kassza.response_bytes': expect.any(Number),
    })
    expect(create?.status).toEqual({ code: SPAN_STATUS_OK })
    expect(tracer.spans[0]?.attributes['kassza.error.category']).toBe('not_found')
    expect(tracer.spans[0]?.status?.code).toBe(SPAN_STATUS_ERROR)

    const prometheus = metrics.renderPrometheus()
    expect(prometheus).toContain(
      'kassza_requests_total{action="createInvoice",outcome="success"} 1',
    )
    expect(prometheus).toContain(
      'kassza_requests_total{action="getInvoiceXml",outcome="not_found"} 2',
    )
    expect(prometheus).toContain('kassza_documents_total{action="created",kind="invoice"} 1')
    expect(prometheus).toContain('# TYPE kassza_request_duration_ms histogram')

    const serialized = JSON.stringify(lines)
    expect(serialized).not.toContain('Titkos')
    expect(serialized).not.toContain('titok@pelda.hu')
    expect(serialized).not.toContain('12345678')
    expect(serialized).not.toContain(TEST_AGENT_KEY)
    expect(serialized).not.toContain('OBS-1')
    const document = lines.find((line) => line.data.event === 'kassza.document')
    expect(document?.data.orderRef).toMatch(/^hmac:[0-9a-f]{16}$/)
  })

  test('azonos sóval a rendelés-hivatkozás folyamatok között egyezik, redact: false esetén nyílt', async () => {
    const refs: unknown[] = []
    for (const options of [{ orderRefSalt: 's' }, { orderRefSalt: 's' }, { redact: false }]) {
      const { lines, logger } = recordingLogger()
      const { kassza } = fakeKassza({}, { hooks: observe({ ...options, logger }) })
      await kassza.invoices.create(INVOICE)
      refs.push(lines.find((line) => line.data.event === 'kassza.document')?.data.orderRef)
    }
    expect(refs[0]).toBe(refs[1])
    expect(refs[2]).toBe('OBS-1')
  })

  test('újrapróbálást és karbantartást számol, a figyelmeztetést tároló-hibaként is', async () => {
    const metrics = createMetricsRegistry()
    const agent = createFakeAgentFetch()
    agent.fail('maintenance', { action: 'getInvoicePdf' })
    const broken = {
      get: () => Promise.reject(new Error('le')),
      set: () => undefined,
      delete: () => {},
    }
    const kassza = createKassza({
      agentKey: TEST_AGENT_KEY,
      fetch: agent.fetch,
      retryDelayMs: 0,
      cookieStore: broken,
      hooks: observe({ metrics }),
    })

    await kassza.invoices.getPdf('NINCS').catch(() => undefined)

    const prometheus = metrics.renderPrometheus()
    expect(prometheus).toContain('kassza_maintenance_total 1')
    expect(prometheus).toContain('kassza_retries_total{action="getInvoicePdf"} 1')
    expect(prometheus).toContain('kassza_store_errors_total{store="session"}')
    expect(prometheus).toContain('kassza_warnings_total{kind="session"}')
  })

  test('megszakított kérésnél is lezárja a spant', async () => {
    const tracer = recordingTracer()
    const controller = new AbortController()
    const kassza = createKassza({
      agentKey: TEST_AGENT_KEY,
      fetch: async () => {
        controller.abort(new Error('mégse'))
        throw controller.signal.reason
      },
      hooks: observe({ tracer }),
    })

    await expect(kassza.invoices.getPdf('X', { signal: controller.signal })).rejects.toThrow(
      'mégse',
    )
    expect(tracer.spans[0]?.ended).toBe(1)
    expect(tracer.spans[0]?.status?.code).toBe(SPAN_STATUS_ERROR)
  })

  test('a hibás tracer, logger vagy metrika sem töri meg a kérést', async () => {
    const boom = () => {
      throw new Error('rossz eszköz')
    }
    const { kassza } = fakeKassza(
      {},
      {
        hooks: observe({
          tracer: { startSpan: boom },
          logger: { info: boom, warn: boom, debug: boom },
          metrics: { counter: boom, histogram: boom },
          logRequests: true,
        }),
      },
    )
    await expect(kassza.invoices.create(INVOICE)).resolves.toMatchObject({
      number: expect.any(String),
    })
  })

  test('a logRequests a kérés indulását is naplózza', async () => {
    const { lines, logger } = recordingLogger()
    const { kassza } = fakeKassza({}, { hooks: observe({ logger, logRequests: true }) })
    await kassza.invoices.create(INVOICE)
    expect(lines.filter((line) => line.level === 'debug')).toHaveLength(1)
    expect(
      lines.some((line) => line.data.event === 'kassza.request' && line.data.outcome === 'success'),
    ).toBe(true)
  })

  test('sok nyitva maradt span sem nő korlát nélkül', () => {
    const tracer = recordingTracer()
    const hooks = observe({ tracer })
    for (let index = 0; index < 1_005; index++) {
      hooks.onRequest?.({ action: 'getInvoicePdf', attempt: 1, requestId: `r${index}` })
    }
    expect(tracer.spans.filter((span) => span.ended === 1)).toHaveLength(5)
  })
})

describe('combineHooks', () => {
  test('minden hookot meghív, az onDocument-et sorban, és a hibát a végén dobja', async () => {
    const calls: string[] = []
    const combined = combineHooks(
      {
        onDocument: async () => {
          calls.push('napló')
          throw new Error('napló hiba')
        },
        onRequest: () => calls.push('a'),
      },
      undefined,
      {
        onDocument: () => {
          calls.push('logger')
        },
        onRequest: () => {
          calls.push('b')
          throw new Error('b hiba')
        },
        onDocumentError: 'throw',
      },
    )

    expect(() =>
      combined.onRequest?.({ action: 'getInvoicePdf', attempt: 1, requestId: 'x' }),
    ).toThrow('b hiba')
    await expect(combined.onDocument?.({} as never)).rejects.toThrow('napló hiba')
    expect(calls).toEqual(['a', 'b', 'napló', 'logger'])
    expect(combined.onDocumentError).toBe('throw')
    expect(combineHooks()).toEqual({})
  })

  test('a naplóval és observe-vel együtt a kliensben is működik', async () => {
    const metrics = createMetricsRegistry()
    const recorded: string[] = []
    const { kassza } = fakeKassza(
      {},
      {
        hooks: combineHooks(observe({ metrics }), {
          onDocument: (event) => {
            recorded.push(event.number)
          },
        }),
        createOnceLock: memoryStore(),
      },
    )
    const invoice = await kassza.invoices.create(INVOICE)
    expect(recorded).toEqual([invoice.number])
    expect(metrics.renderPrometheus()).toContain('kassza_documents_total')
  })
})

describe('createMetricsRegistry', () => {
  test('Prometheus szövegformátumot ad, címke-escape-pel és hisztogrammal', () => {
    const registry = createMetricsRegistry([10, 100])
    registry.counter('kassza_warnings_total', { kind: 'a"b\\c\nd' })
    registry.counter('sajat_total')
    registry.counter('sajat_total', undefined, 2)
    registry.histogram('kassza_request_duration_ms', 5, { action: 'x' })
    registry.histogram('kassza_request_duration_ms', 50, { action: 'x' })
    registry.histogram('kassza_request_duration_ms', 500, { action: 'x' })

    expect(registry.renderPrometheus()).toBe(
      [
        '# HELP kassza_warnings_total Figyelmeztetések fajta szerint',
        '# TYPE kassza_warnings_total counter',
        'kassza_warnings_total{kind="a\\"b\\\\c\\nd"} 1',
        '# TYPE sajat_total counter',
        'sajat_total 3',
        '# HELP kassza_request_duration_ms Számla Agent próbálkozások időtartama ezredmásodpercben',
        '# TYPE kassza_request_duration_ms histogram',
        'kassza_request_duration_ms_bucket{action="x",le="10"} 1',
        'kassza_request_duration_ms_bucket{action="x",le="100"} 2',
        'kassza_request_duration_ms_bucket{action="x",le="+Inf"} 3',
        'kassza_request_duration_ms_sum{action="x"} 555',
        'kassza_request_duration_ms_count{action="x"} 3',
        '',
      ].join('\n'),
    )
    registry.reset()
    expect(registry.renderPrometheus()).toBe('')
  })

  test('érvénytelen névre, címkére és értékre hibát dob', () => {
    const registry = createMetricsRegistry()
    expect(() => registry.counter('rossz név')).toThrow(TypeError)
    expect(() => registry.counter('ok_total', { 'rossz-címke': 'x' })).toThrow(TypeError)
    expect(() => registry.counter('ok_total', undefined, -1)).toThrow(TypeError)
    expect(() => registry.histogram('ok', Number.NaN)).toThrow(TypeError)
    expect(() => createMetricsRegistry([1, Number.POSITIVE_INFINITY])).toThrow(TypeError)
  })

  test('üres regiszter vagy console logger mellett sem dob', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const { kassza } = fakeKassza({}, { hooks: observe({ logger: console }) })
    await kassza.invoices.create(INVOICE)
    expect(info).toHaveBeenCalled()
    info.mockRestore()
  })
})
