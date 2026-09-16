import { describe, expect, test, vi } from 'vitest'
import {
  createTestContext,
  FAKE_PDF_BYTES,
  invoiceXmlResponse,
  TEST_AGENT_KEY,
  textErrorResponse,
} from '../../tests/helpers'
import { createAgentContext, resolveCredentials } from './context'
import { SzamlazzError } from './errors'
import { parseResponseXml, throwIfAnyError, throwIfXmlFailure } from './response'

const XML = '<?xml version="1.0" encoding="UTF-8"?><root/>'

describe('createAgentContext', () => {
  test('a megfelelő form mezőben, fájlként küldi az XML-t', async () => {
    const { ctx, agent } = createTestContext({ body: 'ok' })

    await ctx.execute({ action: 'getInvoicePdf', xml: XML }, (response) => response.text())

    expect(agent.lastCall()).toMatchObject({
      url: 'https://www.szamlazz.hu/szamla/',
      field: 'action-szamla_agent_pdf',
      xml: XML,
      cookie: null,
    })
  })

  test('a mellékleteket attachfile1..N mezőkben küldi', async () => {
    const { ctx, agent } = createTestContext({ body: 'ok' })

    await ctx.execute(
      {
        action: 'createInvoice',
        xml: XML,
        attachments: [
          { filename: 'a.txt', content: 'hello' },
          { filename: 'b.pdf', content: FAKE_PDF_BYTES, contentType: 'application/pdf' },
        ],
      },
      () => undefined,
    )

    expect(agent.lastCall().attachments).toEqual([
      { field: 'attachfile1', filename: 'a.txt', size: 5 },
      { field: 'attachfile2', filename: 'b.pdf', size: FAKE_PDF_BYTES.length },
    ])
  })

  test('elmenti és a következő kérésben visszaküldi a session cookie-t', async () => {
    const { ctx, agent } = createTestContext([
      { headers: { 'set-cookie': 'JSESSIONID=abc123; Path=/; HttpOnly' } },
      { body: '' },
    ])

    await ctx.execute({ action: 'getInvoicePdf', xml: XML }, () => undefined)
    await ctx.execute({ action: 'getInvoicePdf', xml: XML }, () => undefined)

    expect(agent.calls[1]?.cookie).toBe('JSESSIONID=abc123')
  })

  test('resetSession után új sessionnel indul', async () => {
    const { ctx, agent } = createTestContext([
      { headers: { 'set-cookie': 'JSESSIONID=abc123; Path=/' } },
      { body: '' },
    ])

    await ctx.execute({ action: 'getInvoicePdf', xml: XML }, () => undefined)
    await ctx.resetSession()
    await ctx.execute({ action: 'getInvoicePdf', xml: XML }, () => undefined)

    expect(agent.calls[1]?.cookie).toBeNull()
  })

  test('cookieStore: false esetén nem tárol sessiont', async () => {
    const { ctx, agent } = createTestContext(
      [{ headers: { 'set-cookie': 'JSESSIONID=abc123' } }, { body: '' }],
      { cookieStore: false },
    )

    await ctx.execute({ action: 'getInvoicePdf', xml: XML }, () => undefined)
    await ctx.execute({ action: 'getInvoicePdf', xml: XML }, () => undefined)

    expect(agent.calls[1]?.cookie).toBeNull()
  })

  test('hálózati hibát network kategóriájú, újrapróbálható hibává alakít', async () => {
    const { ctx } = createTestContext(new TypeError('fetch failed'))

    const error = await ctx
      .execute({ action: 'createInvoice', xml: XML }, () => undefined)
      .catch((caught: unknown) => caught)

    expect(error).toBeInstanceOf(SzamlazzError)
    expect(error).toMatchObject({ category: 'network', retryable: true, action: 'createInvoice' })
  })

  test('nem biztonságos műveletet hálózati hiba után sem küld újra', async () => {
    const { ctx, agent } = createTestContext(new TypeError('fetch failed'))

    await expect(
      ctx.execute({ action: 'createInvoice', xml: XML }, () => undefined),
    ).rejects.toThrow()

    expect(agent.calls).toHaveLength(1)
  })

  test('biztonságos műveletet legfeljebb maxAttempts-szer próbál újra', async () => {
    const { ctx, agent } = createTestContext(new TypeError('fetch failed'), { maxAttempts: 3 })

    await expect(
      ctx.execute({ action: 'getInvoicePdf', xml: XML, safeToRetry: true }, () => undefined),
    ).rejects.toThrow()

    expect(agent.calls).toHaveLength(3)
  })

  test('a maxAttempts-et 5-re korlátozza', async () => {
    const { ctx, agent } = createTestContext(new TypeError('fetch failed'), { maxAttempts: 50 })

    await expect(
      ctx.execute({ action: 'getInvoicePdf', xml: XML, safeToRetry: true }, () => undefined),
    ).rejects.toThrow()

    expect(agent.calls).toHaveLength(5)
  })

  test('karbantartás (1-es kód) után újrapróbál, üzleti hibánál nem', async () => {
    const maintenance = createTestContext([
      textErrorResponse('Rendszerkarbantartás', 1),
      { body: 'ok' },
    ])
    const business = createTestContext(textErrorResponse('Sikertelen bejelentkezés', 3))
    const parse = (response: Parameters<typeof throwIfAnyError>[0]): string => {
      throwIfAnyError(response)
      return response.text()
    }

    await expect(
      maintenance.ctx.execute({ action: 'getInvoicePdf', xml: XML, safeToRetry: true }, parse),
    ).resolves.toBe('ok')
    await expect(
      business.ctx.execute({ action: 'getInvoicePdf', xml: XML, safeToRetry: true }, parse),
    ).rejects.toMatchObject({ code: 3, category: 'auth' })
    expect(business.agent.calls).toHaveLength(1)
  })

  test('hitelesítési hiba után törli a sessiont', async () => {
    const { ctx, agent } = createTestContext([
      { headers: { 'set-cookie': 'JSESSIONID=old' } },
      textErrorResponse('Sikertelen bejelentkezés', 3),
      { body: '' },
    ])

    await ctx.execute({ action: 'getInvoicePdf', xml: XML }, () => undefined)
    await expect(
      ctx.execute({ action: 'getInvoicePdf', xml: XML }, throwIfAnyError),
    ).rejects.toThrow()
    await ctx.execute({ action: 'getInvoicePdf', xml: XML }, () => undefined)

    expect(agent.calls[1]?.cookie).toBe('JSESSIONID=old')
    expect(agent.calls[2]?.cookie).toBeNull()
  })

  test('időtúllépésnél timeout kategóriájú hibát ad', async () => {
    const fetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        }),
    )
    const ctx = createAgentContext({ agentKey: TEST_AGENT_KEY, fetch, timeoutMs: 10 })

    await expect(
      ctx.execute({ action: 'getInvoicePdf', xml: XML }, () => undefined),
    ).rejects.toMatchObject({
      category: 'timeout',
    })
  })

  test('a felhasználói AbortSignal megszakítja a kérést', async () => {
    const fetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        }),
    )
    const ctx = createAgentContext({ agentKey: TEST_AGENT_KEY, fetch })
    const controller = new AbortController()

    const pending = ctx.execute(
      { action: 'getInvoicePdf', xml: XML, signal: controller.signal },
      () => undefined,
    )
    controller.abort(new Error('megszakítva'))

    await expect(pending).rejects.toThrow('megszakítva')
  })

  test('a hookokat meghívja kérésnél, válasznál és hibánál', async () => {
    const onRequest = vi.fn()
    const onResponse = vi.fn()
    const onError = vi.fn()
    const { ctx } = createTestContext(textErrorResponse('Hiba', 57), {
      hooks: { onRequest, onResponse, onError },
    })

    await expect(
      ctx.execute({ action: 'createInvoice', xml: XML }, throwIfAnyError),
    ).rejects.toThrow()

    expect(onRequest).toHaveBeenCalledWith({ action: 'createInvoice', attempt: 1 })
    expect(onResponse).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'createInvoice', status: 200 }),
    )
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ willRetry: false }))
  })

  test('XML válasz sikertelen jelzését típusos hibává alakítja', async () => {
    const { ctx } = createTestContext(
      invoiceXmlResponse(
        '<sikeres>false</sikeres><hibakod>202</hibakod><hibauzenet><![CDATA[Rossz előtag]]></hibauzenet>',
      ),
    )

    const error = await ctx
      .execute({ action: 'createInvoice', xml: XML }, (response) => {
        throwIfXmlFailure(parseResponseXml(response), response)
      })
      .catch((caught: unknown) => caught)

    expect(error).toMatchObject({
      code: 202,
      category: 'validation',
      message: '[202] Rossz előtag',
    })
    expect((error as SzamlazzError).hint).toContain('Előtagok')
  })
})

describe('createAgentContext konfiguráció', () => {
  test('érvénytelen maxAttempts értékre konfigurációs hibát dob', () => {
    expect(() => createAgentContext({ agentKey: TEST_AGENT_KEY, maxAttempts: 0 })).toThrow(
      expect.objectContaining({ category: 'configuration' }),
    )
    expect(() => createAgentContext({ agentKey: TEST_AGENT_KEY, maxAttempts: 1.5 })).toThrow(
      /maxAttempts/,
    )
  })

  test('fetch implementáció nélkül konfigurációs hibát dob', () => {
    vi.stubGlobal('fetch', undefined)
    try {
      expect(() => createAgentContext({ agentKey: TEST_AGENT_KEY })).toThrow(/fetch/)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  test('egyedi végpontra küld, és a nem SzamlazzError hibát változatlanul továbbadja', async () => {
    const { ctx, agent } = createTestContext(
      { body: 'ok' },
      { endpoint: 'https://proxy.example/szamla/' },
    )
    const parseError = new TypeError('parse bug')

    await expect(
      ctx.execute({ action: 'getReceipt', xml: XML, safeToRetry: true }, () => {
        throw parseError
      }),
    ).rejects.toBe(parseError)
    expect(agent.calls).toHaveLength(1)
    expect(agent.lastCall().url).toBe('https://proxy.example/szamla/')
  })

  test('újrapróbálás közben a megszakítás leállítja a várakozást', async () => {
    const controller = new AbortController()
    const { ctx, agent } = createTestContext(
      () => {
        controller.abort(new Error('leállítva'))
        return new TypeError('fetch failed')
      },
      { retryDelayMs: 10_000 },
    )

    await expect(
      ctx.execute(
        { action: 'getInvoicePdf', xml: XML, safeToRetry: true, signal: controller.signal },
        () => undefined,
      ),
    ).rejects.toThrow('leállítva')
    expect(agent.calls).toHaveLength(1)
  })

  test('Blob és ArrayBuffer mellékletet is elfogad', async () => {
    const { ctx, agent } = createTestContext({ body: 'ok' })

    await ctx.execute(
      {
        action: 'createInvoice',
        xml: XML,
        attachments: [
          { filename: 'a.bin', content: new Blob(['abc']) },
          { filename: 'b.bin', content: new ArrayBuffer(4) },
        ],
      },
      () => undefined,
    )

    expect(agent.lastCall().attachments.map((attachment) => attachment.size)).toEqual([3, 4])
  })
})

describe('hibás cookie store', () => {
  test('ha a store dob, a kérés session nélkül is lefut', async () => {
    const broken = {
      get: () => Promise.reject(new Error('redis down')),
      set: () => Promise.reject(new Error('redis down')),
      delete: () => {
        throw new Error('redis down')
      },
    }
    const { ctx, agent } = createTestContext(
      { headers: { 'set-cookie': 'JSESSIONID=abc' }, body: 'ok' },
      { cookieStore: broken },
    )

    await expect(
      ctx.execute({ action: 'getInvoicePdf', xml: XML }, (response) => response.text()),
    ).resolves.toBe('ok')
    await expect(ctx.resetSession()).resolves.toBeUndefined()
    expect(agent.lastCall().cookie).toBeNull()
  })
})

describe('resolveCredentials', () => {
  test('az Agent kulcsot szamlaagentkulcs elemként adja vissza', () => {
    expect(resolveCredentials({ agentKey: 'abc' })).toEqual([
      { name: 'szamlaagentkulcs', content: 'abc' },
    ])
  })

  test('nagybetűs kulcsra konfigurációs hibát dob', () => {
    expect(() => resolveCredentials({ agentKey: 'ABC' })).toThrow(/kisbetűs/)
  })

  test('felhasználónév és jelszó párost is elfogad', () => {
    expect(resolveCredentials({ username: 'u', password: 'p' })).toEqual([
      { name: 'felhasznalo', content: 'u' },
      { name: 'jelszo', content: 'p' },
    ])
  })

  test('a SZAMLAZZ_AGENT_KEY környezeti változóból is olvas', () => {
    vi.stubEnv('SZAMLAZZ_AGENT_KEY', 'envkulcs')
    try {
      expect(resolveCredentials({})).toEqual([{ name: 'szamlaagentkulcs', content: 'envkulcs' }])
    } finally {
      vi.unstubAllEnvs()
    }
  })

  test('hitelesítési adat nélkül konfigurációs hibát dob', () => {
    vi.stubEnv('SZAMLAZZ_AGENT_KEY', '')
    try {
      expect(() => resolveCredentials({})).toThrow(
        expect.objectContaining({ category: 'configuration' }),
      )
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
