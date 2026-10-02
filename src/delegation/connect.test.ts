import { describe, expect, test } from 'vitest'
import {
  type MockResponse,
  mockAgent,
  TEST_AGENT_KEY,
  textErrorResponse,
} from '../../tests/helpers'
import { canValidateXsd, validateAgainstXsd } from '../../tests/xsd'
import { createAgentResponse } from '../core/response'
import { el } from '../core/xml/serialize'
import {
  buildConnectPrincipalXml,
  type ConnectPrincipalInput,
  connectPrincipal,
  connectPrincipalStatus,
  normalizeDelegateTaxNumber,
  parseConnectPrincipalResponse,
} from './connect'

const SCHEMA = 'agentmb/xmlcegmb.xsd'
const AGENT_KEY_CREDENTIALS = [el('szamlaagentkulcs', TEST_AGENT_KEY)]
const USER_CREDENTIALS = [el('felhasznalo', 'megbizott@pelda.hu'), el('jelszo', 'Titkos-Jelszo-1')]

const INPUT: ConnectPrincipalInput = {
  principal: {
    name: 'Megbízó Kft.',
    taxNumber: '12345676242',
    invoicePrefix: 'MBSZ',
    zip: '1117',
    city: 'Budapest',
    address: 'Budafoki út 17.',
    email: 'penzugy@megbizo.hu',
  },
  user: {
    email: 'megbizott.mbsz@pelda.hu',
    password: 'As6dezh7*K#',
    firstName: 'Éva',
  },
}

const MESSAGES = {
  ownerInvite:
    'Már létező fiók, nincs fiókgazdája. Fiókgazdai meghívó (megbízott számlakibocsátás) email újraküldve.',
  joinResent:
    'Már létező fiók fiókgazdával. A csatlakozási kérelem emailt újraküldtük a fiókgazdának.',
  joinSent: 'Már létező fiók fiókgazdával. Csatlakozási kérelmet küldtünk a fiókgazdának.',
} as const

function withPrincipal(
  overrides: Partial<ConnectPrincipalInput['principal']>,
): ConnectPrincipalInput {
  return { ...INPUT, principal: { ...INPUT.principal, ...overrides } }
}

function withUser(overrides: Partial<ConnectPrincipalInput['user']>): ConnectPrincipalInput {
  return { ...INPUT, user: { ...INPUT.user, ...overrides } }
}

function agentResponse(response: MockResponse) {
  const body =
    typeof response.body === 'string'
      ? new TextEncoder().encode(response.body)
      : (response.body ?? new Uint8Array())
  return createAgentResponse(
    'connectPrincipal',
    response.status ?? 200,
    new Headers(response.headers),
    body,
  )
}

function latin1(text: string): string {
  return String.fromCharCode(...new TextEncoder().encode(text))
}

describe('buildConnectPrincipalXml', () => {
  test('Agent kulccsal XSD-valid kérést épít, a kötelező üres mezőkkel együtt', () => {
    const xml = buildConnectPrincipalXml(AGENT_KEY_CREDENTIALS, INPUT)
    expect(xml).toContain('<XmlCegMb xmlns="http://www.szamlazz.hu/xmlcegmb"')
    expect(xml).toContain(
      `<login>\n    <szamlaagentkulcs>${TEST_AGENT_KEY}</szamlaagentkulcs>\n  </login>`,
    )
    expect(xml).not.toContain('<loginname>')
    expect(xml).toContain('<cegtaxnumber>12345676-2-42</cegtaxnumber>')
    expect(xml).toContain('<cegszamlaszamelotag>MBSZ</cegszamlaszamelotag>')
    expect(xml).toMatch(/<cegbank\s*\/>|<cegbank><\/cegbank>/)
    expect(xml).toMatch(/<cegbankaccount\s*\/>|<cegbankaccount><\/cegbankaccount>/)
    expect(xml).toMatch(/<cegemailreplyto\s*\/>|<cegemailreplyto><\/cegemailreplyto>/)
    expect(xml).not.toContain('usrvezeteknev')
    if (canValidateXsd(SCHEMA)) expect(validateAgainstXsd(xml, SCHEMA)).toEqual([])
  })

  test('felhasználónévvel és jelszóval a loginname és password mezőket tölti ki', () => {
    const xml = buildConnectPrincipalXml(USER_CREDENTIALS, INPUT)
    expect(xml).toContain('<loginname>megbizott@pelda.hu</loginname>')
    expect(xml).toContain('<password>Titkos-Jelszo-1</password>')
    expect(xml).not.toContain('szamlaagentkulcs')
    if (canValidateXsd(SCHEMA)) expect(validateAgainstXsd(xml, SCHEMA)).toEqual([])
  })

  test('minden opcionális mezőt XSD-sorrendben ír ki', () => {
    const xml = buildConnectPrincipalXml(AGENT_KEY_CREDENTIALS, {
      principal: {
        ...INPUT.principal,
        taxNumber: '12345676-2-42',
        postalAddress: { zip: '1121', city: 'Budapest', address: 'Pf. 17.' },
        bankName: 'Példa Bank',
        bankAccount: '11773016-11111018',
        replyToEmail: 'valasz@megbizo.hu',
        cashAccountingFrom: '2026-01-01',
        cashAccountingTo: new Date('2026-12-31T12:00:00Z'),
        kataFrom: '2020-01-01',
        kataTo: '2022-08-31',
      },
      user: { ...INPUT.user, lastName: 'Kovács' },
    })
    const order = [
      'cegcompanyname',
      'cegtaxnumber',
      'cegszamlaszamelotag',
      'cegirsz',
      'cegcity',
      'cegaddr',
      'cegpostirsz',
      'cegpostcity',
      'cegpostaddr',
      'cegbank',
      'cegbankaccount',
      'cegemail',
      'cegemailreplyto',
      'cegpenzforgdattol',
      'cegpenzforgdatig',
      'cegkatadattol',
      'cegkatadatig',
      'usremail',
      'usrpassword',
      'usrvezeteknev',
      'usrkeresztnev',
    ]
    const positions = order.map((name) => xml.indexOf(`<${name}>`))
    expect(positions.every((position) => position > 0)).toBe(true)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
    expect(xml).toContain('<cegpenzforgdatig>2026-12-31</cegpenzforgdatig>')
    if (canValidateXsd(SCHEMA)) expect(validateAgainstXsd(xml, SCHEMA)).toEqual([])
  })

  test('a speciális karaktereket escapeli', () => {
    const xml = buildConnectPrincipalXml(
      AGENT_KEY_CREDENTIALS,
      withPrincipal({ name: 'Kovács & Társa <Bt.>' }),
    )
    expect(xml).toContain('<cegcompanyname>Kovács &amp; Társa &lt;Bt.&gt;</cegcompanyname>')
  })

  test('hitelesítési adat nélkül konfigurációs hibát dob', () => {
    expect(() => buildConnectPrincipalXml([], INPUT)).toThrow(
      expect.objectContaining({ category: 'configuration' }),
    )
  })

  test.each([
    ['érvénytelen adószám', withPrincipal({ taxNumber: '12345678-2-42' }), 'adószáma'],
    ['kisbetűs előtag', withPrincipal({ invoicePrefix: 'mbsz' }), '337'],
    ['túl hosszú előtag', withPrincipal({ invoicePrefix: 'ABCDEF' }), '337'],
    ['ékezetes előtag', withPrincipal({ invoicePrefix: 'ÁB' }), '337'],
    ['hiányzó cégnév', withPrincipal({ name: ' ' }), 'cégneve'],
    ['hiányzó település', withPrincipal({ city: '' }), 'települése'],
    ['hibás e-mail', withPrincipal({ email: 'nem-email' }), 'e-mail'],
    ['hibás válaszcím', withPrincipal({ replyToEmail: 'rossz@' }), 'replyToEmail'],
    [
      'hiányos postázási cím',
      withPrincipal({ postalAddress: { zip: '1121', city: '', address: 'x' } }),
      'postázási',
    ],
    ['rövid jelszó', withUser({ password: '1234567' }), '506'],
    ['hosszú jelszó', withUser({ password: 'x'.repeat(129) }), '507'],
    ['hiányzó keresztnév', withUser({ firstName: '' }), 'keresztneve'],
    ['hibás felhasználói e-mail', withUser({ email: 'a@b' }), 'e-mail'],
    ['érvénytelen dátum', withPrincipal({ kataFrom: '2026-02-30' }), 'KATA'],
    ['záródátum kezdés nélkül', withPrincipal({ cashAccountingTo: '2026-12-31' }), 'kezdődátum'],
    [
      'fordított időszak',
      withPrincipal({ cashAccountingFrom: '2026-12-31', cashAccountingTo: '2026-01-01' }),
      'korábbi',
    ],
  ])('%s esetén validációs hibát dob', (_label, input, fragment) => {
    expect(() => buildConnectPrincipalXml(AGENT_KEY_CREDENTIALS, input)).toThrow(
      expect.objectContaining({
        category: 'validation',
        message: expect.stringContaining(fragment),
      }),
    )
  })

  test('a jelszó határértékeit (8 és 128 karakter) elfogadja', () => {
    expect(() =>
      buildConnectPrincipalXml(AGENT_KEY_CREDENTIALS, withUser({ password: '12345678' })),
    ).not.toThrow()
    expect(() =>
      buildConnectPrincipalXml(AGENT_KEY_CREDENTIALS, withUser({ password: 'x'.repeat(128) })),
    ).not.toThrow()
  })
})

describe('normalizeDelegateTaxNumber', () => {
  test('a 11 jegyű adószámot kötőjeles alakra hozza', () => {
    expect(normalizeDelegateTaxNumber('12345676242')).toBe('12345676-2-42')
    expect(normalizeDelegateTaxNumber(' 12345676-2-42 ')).toBe('12345676-2-42')
  })
})

describe('connectPrincipalStatus', () => {
  test('a dokumentált válaszokat felismeri', () => {
    expect(connectPrincipalStatus('DONE')).toBe('account-created')
    expect(connectPrincipalStatus('done;')).toBe('account-created')
    expect(connectPrincipalStatus(MESSAGES.ownerInvite)).toBe('owner-invite-resent')
    expect(connectPrincipalStatus(MESSAGES.joinResent)).toBe('join-request-resent')
    expect(connectPrincipalStatus(MESSAGES.joinSent)).toBe('join-request-sent')
  })

  test('ékezet és kis-nagybetű nélkül is felismeri, az ismeretlent unknown-ként adja', () => {
    expect(
      connectPrincipalStatus('MAR LETEZO FIOK FIOKGAZDAVAL. CSATLAKOZASI KERELMET KULDTUNK'),
    ).toBe('join-request-sent')
    expect(connectPrincipalStatus('Valami új válasz')).toBe('unknown')
  })
})

describe('parseConnectPrincipalResponse', () => {
  test('az XML_AGENT_RESPONSE fejlécből olvas, URL-kódolt magyar szöveggel is', () => {
    expect(
      parseConnectPrincipalResponse(agentResponse({ headers: { XML_AGENT_RESPONSE: 'DONE' } })),
    ).toEqual({
      status: 'account-created',
      message: 'DONE',
    })
    expect(
      parseConnectPrincipalResponse(
        agentResponse({ headers: { XML_AGENT_RESPONSE: encodeURIComponent(MESSAGES.joinSent) } }),
      ),
    ).toEqual({ status: 'join-request-sent', message: MESSAGES.joinSent })
  })

  test('a nyers UTF-8 bájtokként érkező fejlécet is helyreállítja', () => {
    const response = agentResponse({
      headers: { XML_AGENT_RESPONSE: latin1(MESSAGES.ownerInvite) },
    })
    expect(parseConnectPrincipalResponse(response)).toEqual({
      status: 'owner-invite-resent',
      message: MESSAGES.ownerInvite,
    })
  })

  test('a latin-1 tartományú, de nem UTF-8 fejlécet változatlanul hagyja', () => {
    const response = agentResponse({ headers: { XML_AGENT_RESPONSE: 'Kész' } })
    expect(parseConnectPrincipalResponse(response).message).toBe('Kész')
  })

  test('fejléc híján a törzs xmlagentresponse sorát olvassa', () => {
    const response = agentResponse({ body: 'xmlagentresponse=DONE\n' })
    expect(parseConnectPrincipalResponse(response).status).toBe('account-created')
  })

  test('válasz nélkül unexpected_response hibát dob', () => {
    expect(() => parseConnectPrincipalResponse(agentResponse({ body: 'OK' }))).toThrow(
      expect.objectContaining({ category: 'unexpected_response' }),
    )
  })

  test('a szlahu_error fejlécekben érkező hibát SzamlazzError-ként dobja', () => {
    const response = agentResponse({
      headers: {
        szlahu_error_code: '137',
        szlahu_error: encodeURIComponent(
          'Jelenleg nincs jogosultsága ahhoz, hogy ilyen módon hozzon létre számlázási fiókot.',
        ),
      },
    })
    expect(() => parseConnectPrincipalResponse(response)).toThrow(
      expect.objectContaining({ code: 137 }),
    )
  })
})

describe('connectPrincipal', () => {
  const TAXPAYER = (valid: boolean): MockResponse => ({
    headers: { 'content-type': 'application/xml; charset=UTF-8' },
    body: `<?xml version="1.0" encoding="UTF-8"?>\n<QueryTaxpayerResponse xmlns="http://schemas.nav.gov.hu/OSA/3.0/api" xmlns:ns2="http://schemas.nav.gov.hu/OSA/3.0/base"><header><requestId>r1</requestId><timestamp>2026-10-02T08:00:00.000Z</timestamp><requestVersion>2.0</requestVersion></header><result><funcCode>OK</funcCode></result><taxpayerValidity>${valid}</taxpayerValidity></QueryTaxpayerResponse>`,
  })

  test('az action-agent_ceg_mb mezőben küldi a kérést, és összefoglalja az eredményt', async () => {
    const agent = mockAgent({ headers: { XML_AGENT_RESPONSE: 'DONE' } })
    const result = await connectPrincipal(INPUT, { agentKey: TEST_AGENT_KEY, fetch: agent.fetch })
    expect(result).toEqual({
      status: 'account-created',
      message: 'DONE',
      taxNumber: '12345676-2-42',
      invoicePrefix: 'MBSZ',
      userEmail: 'megbizott.mbsz@pelda.hu',
    })
    expect(agent.calls).toHaveLength(1)
    expect(agent.calls[0]?.field).toBe('action-agent_ceg_mb')
  })

  test('verifyTaxNumber mellett előbb a NAV-nál ellenőrzi az adószámot', async () => {
    const agent = mockAgent(TAXPAYER(true), {
      headers: { XML_AGENT_RESPONSE: encodeURIComponent(MESSAGES.joinSent) },
    })
    const result = await connectPrincipal(INPUT, {
      agentKey: TEST_AGENT_KEY,
      fetch: agent.fetch,
      verifyTaxNumber: true,
    })
    expect(result.status).toBe('join-request-sent')
    expect(agent.calls.map((call) => call.field)).toEqual([
      'action-szamla_agent_taxpayer',
      'action-agent_ceg_mb',
    ])
  })

  test('érvénytelen NAV adószámnál nem küldi el a csatlakozási kérelmet', async () => {
    const agent = mockAgent(TAXPAYER(false))
    await expect(
      connectPrincipal(INPUT, {
        agentKey: TEST_AGENT_KEY,
        fetch: agent.fetch,
        verifyTaxNumber: true,
      }),
    ).rejects.toMatchObject({ category: 'validation', message: expect.stringContaining('NAV') })
    expect(agent.calls).toHaveLength(1)
  })

  test('hálózati hibánál nem próbálkozik újra', async () => {
    const agent = mockAgent(new TypeError('fetch failed'))
    await expect(
      connectPrincipal(INPUT, { agentKey: TEST_AGENT_KEY, fetch: agent.fetch, retryDelayMs: 0 }),
    ).rejects.toMatchObject({ category: 'network' })
    expect(agent.calls).toHaveLength(1)
  })

  test('a Számlázz.hu hibakódját továbbadja', async () => {
    const agent = mockAgent(
      textErrorResponse('Már létezik cég ezzel az adószámmal és számlaszám előtaggal.', 68),
    )
    await expect(
      connectPrincipal(INPUT, { agentKey: TEST_AGENT_KEY, fetch: agent.fetch }),
    ).rejects.toMatchObject({ code: 68 })
  })

  test('helyi validációs hibánál el sem küldi a kérést', async () => {
    const agent = mockAgent({ headers: { XML_AGENT_RESPONSE: 'DONE' } })
    await expect(
      connectPrincipal(withPrincipal({ invoicePrefix: 'hibás' }), {
        agentKey: TEST_AGENT_KEY,
        fetch: agent.fetch,
      }),
    ).rejects.toMatchObject({ category: 'validation' })
    expect(agent.calls).toHaveLength(0)
  })
})
