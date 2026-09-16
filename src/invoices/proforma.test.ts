import { describe, expect, test } from 'vitest'
import {
  createTestContext,
  type MockResponse,
  TEST_AGENT_KEY,
  textErrorResponse,
  xmlSuccessResponse,
} from '../../tests/helpers'
import { el } from '../core/xml/serialize'
import {
  buildDeleteProformaXml,
  deleteProforma,
  type ProformaReference,
  parseDeleteProformaResponse,
} from './proforma'

const CREDENTIALS = [el('szamlaagentkulcs', TEST_AGENT_KEY)]

function deleteResponse(inner: string): MockResponse {
  return xmlSuccessResponse(
    'xmlszamladbkdelvalasz',
    'http://www.szamlazz.hu/xmlszamladbkdelvalasz',
    inner,
  )
}

describe('buildDeleteProformaXml', () => {
  test('díjbekérőszám alapján a beallitasok és fejlec blokkba írja az adatokat', () => {
    const xml = buildDeleteProformaXml(CREDENTIALS, 'D-43')

    expect(xml).toContain('<xmlszamladbkdel xmlns="http://www.szamlazz.hu/xmlszamladbkdel"')
    expect(xml).toMatch(/<beallitasok>\s*<szamlaagentkulcs>/)
    expect(xml).toMatch(/<fejlec>\s*<szamlaszam>D-43<\/szamlaszam>\s*<\/fejlec>/)
    expect(xml).not.toContain('rendelesszam')
  })

  test('rendelésszám alapján a kisbetűs rendelesszam mezőt használja', () => {
    const xml = buildDeleteProformaXml(CREDENTIALS, { orderNumber: 'NEV-12' })

    expect(xml).toContain('<rendelesszam>NEV-12</rendelesszam>')
    expect(xml).not.toContain('rendelesSzam')
    expect(xml).not.toContain('<szamlaszam>')
  })

  test('a { proformaNumber } formát is elfogadja', () => {
    expect(buildDeleteProformaXml(CREDENTIALS, { proformaNumber: ' D-44 ' })).toContain(
      '<szamlaszam>D-44</szamlaszam>',
    )
  })

  test('hibás hivatkozásra validációs hibát dob', () => {
    const invalid = [
      '',
      { proformaNumber: '' },
      { orderNumber: '  ' },
      {},
      { proformaNumber: 'D-1', orderNumber: 'R-1' },
      null,
    ] as unknown as ProformaReference[]
    for (const reference of invalid) {
      expect(() => buildDeleteProformaXml(CREDENTIALS, reference)).toThrow(
        expect.objectContaining({ category: 'validation' }),
      )
    }
  })
})

describe('deleteProforma', () => {
  test('sikeres törlésnél undefined-dal tér vissza', async () => {
    const { ctx, agent } = createTestContext(deleteResponse('<sikeres>true</sikeres>'))

    await expect(deleteProforma(ctx, 'D-43')).resolves.toBeUndefined()
    expect(agent.lastCall().field).toBe('action-szamla_agent_dijbekero_torlese')
  })

  test('a 335-ös kódot not_found hibaként adja vissza', async () => {
    const { ctx } = createTestContext(
      deleteResponse(
        '<sikeres>false</sikeres><hibakod>335</hibakod><hibauzenet><![CDATA[nincs ilyen díjbekérő a rendszerben, már törlésre került vagy nem is létezett]]></hibauzenet>',
      ),
    )

    const error = await deleteProforma(ctx, { orderNumber: 'R-1' }).catch(
      (caught: unknown) => caught,
    )

    expect(error).toMatchObject({
      code: 335,
      category: 'not_found',
      isNotFound: true,
      action: 'deleteProforma',
      message: expect.stringContaining('nincs ilyen díjbekérő'),
    })
  })

  test('más XML hibakódot változatlanul továbbad', async () => {
    const { ctx } = createTestContext(
      deleteResponse('<sikeres>false</sikeres><hibakod>3</hibakod><hibauzenet>Hiba</hibauzenet>'),
    )

    await expect(deleteProforma(ctx, 'D-1')).rejects.toMatchObject({ code: 3, category: 'auth' })
  })

  test('a fejléc hibát és a szöveges hibát is kezeli', async () => {
    const header = createTestContext(textErrorResponse('Sikertelen bejelentkezés', 3))
    const text = createTestContext({ body: '[ERR] Kritikus hiba ---------- x' })

    await expect(deleteProforma(header.ctx, 'D-1')).rejects.toMatchObject({ code: 3 })
    await expect(deleteProforma(text.ctx, 'D-1')).rejects.toThrow('Kritikus hiba')
  })

  test('az xmlszamlavalasz gyökérelemű sikeres választ is elfogadja', async () => {
    const { ctx } = createTestContext(
      xmlSuccessResponse(
        'xmlszamlavalasz',
        'http://www.szamlazz.hu/xmlszamlavalasz',
        '<sikeres>true</sikeres>',
      ),
    )

    await expect(deleteProforma(ctx, 'D-1')).resolves.toBeUndefined()
  })

  test('sikeres jelzés nélküli vagy idegen XML-re unexpected_response hibát dob', async () => {
    const empty = createTestContext(deleteResponse(''))
    const foreign = createTestContext({
      body: '<?xml version="1.0"?><html><sikeres>true</sikeres></html>',
    })
    const html = createTestContext({ status: 200, body: 'Belső hiba történt' })

    for (const { ctx } of [empty, foreign, html]) {
      await expect(deleteProforma(ctx, 'D-1')).rejects.toMatchObject({
        category: 'unexpected_response',
      })
    }
  })

  test('hálózati hiba után nem küldi újra', async () => {
    const { ctx, agent } = createTestContext(new TypeError('fetch failed'), { maxAttempts: 3 })

    await expect(deleteProforma(ctx, 'D-1')).rejects.toMatchObject({ category: 'network' })
    expect(agent.calls).toHaveLength(1)
  })

  test('validációs hibánál nem küld kérést', async () => {
    const { ctx, agent } = createTestContext(deleteResponse('<sikeres>true</sikeres>'))

    await expect(deleteProforma(ctx, '')).rejects.toMatchObject({ category: 'validation' })
    expect(agent.calls).toHaveLength(0)
  })

  test('a parseDeleteProformaResponse a nem SzamlazzError hibát is továbbadja', () => {
    const response = {
      action: 'deleteProforma',
      status: 200,
      headers: new Headers(),
      body: new Uint8Array(),
      isPdf: false,
      text: () => {
        throw new TypeError('olvasási hiba')
      },
    } as const

    expect(() => parseDeleteProformaResponse(response)).toThrow(TypeError)
  })
})
