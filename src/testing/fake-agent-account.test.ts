import { describe, expect, test } from 'vitest'
import { FAKE_CREDENTIALS, FAKE_NOW, fakeKassza, rawAgentRequest } from '../../tests/fake-agent'
import { TEST_AGENT_KEY } from '../../tests/helpers'
import { createKassza } from '../client'
import { type ConnectPrincipalInput, connectPrincipal } from '../delegation/connect'
import { probeDelegation } from '../delegation/probe'
import { buildGetInvoiceXml } from '../invoices/get'
import { CONNECT_PRINCIPAL_MESSAGES, createFakeAgentFetch } from './index'

const PRINCIPAL: ConnectPrincipalInput = {
  principal: {
    name: 'Megbízó Kft.',
    taxNumber: '12345676-2-42',
    invoicePrefix: 'MEGB',
    zip: '1111',
    city: 'Budapest',
    address: 'Fő utca 1.',
    email: 'penzugy@megbizo.hu',
  },
  user: { email: 'kassza+megbizo@pelda.hu', password: 'nagyontitkos1', firstName: 'Kassza' },
}

const PROBE = {
  username: PRINCIPAL.user.email,
  password: PRINCIPAL.user.password,
  retryDelayMs: 0,
}

describe('createFakeAgentFetch: hitelesítés', () => {
  test('szigorú módban az ismeretlen Agent kulcs 3-as auth hibát ad', async () => {
    const agent = createFakeAgentFetch({ now: FAKE_NOW, agentKeys: ['jo-kulcs-0123456789'] })
    const kassza = createKassza({ agentKey: 'rossz-kulcs-0123456789', fetch: agent.fetch })

    await expect(kassza.invoices.find('KASSZA-2026-1')).rejects.toMatchObject({
      code: 3,
      category: 'auth',
    })
  })

  test('szigorú módban a megadott kulccsal és felhasználóval is beenged', async () => {
    const agent = createFakeAgentFetch({
      now: FAKE_NOW,
      agentKeys: [TEST_AGENT_KEY],
      users: { 'konyvelo@pelda.hu': 'jelszo123' },
    })
    const byKey = createKassza({ agentKey: TEST_AGENT_KEY, fetch: agent.fetch })
    const byUser = createKassza({
      username: 'konyvelo@pelda.hu',
      password: 'jelszo123',
      fetch: agent.fetch,
    })
    const wrongPassword = createKassza({
      username: 'konyvelo@pelda.hu',
      password: 'rossz',
      fetch: agent.fetch,
    })

    expect(await byKey.invoices.find('KASSZA-2026-1')).toBeNull()
    expect(await byUser.invoices.find('KASSZA-2026-1')).toBeNull()
    await expect(wrongPassword.invoices.find('KASSZA-2026-1')).rejects.toMatchObject({ code: 3 })
  })

  test('hitelesítő adat nélküli kérésre nyílt módban is 3-at ad', async () => {
    const { agent } = fakeKassza()
    const xml = buildGetInvoiceXml(FAKE_CREDENTIALS, 'KASSZA-2026-1').replace(
      /<szamlaagentkulcs>[^<]*<\/szamlaagentkulcs>/,
      '',
    )

    const response = await rawAgentRequest(agent, 'getInvoiceXml', xml)

    expect(await response.text()).toContain('<hibakod>3</hibakod>')
  })

  test('XML fájl nélküli kérésre 53-at, hibás XML-re és rossz gyökérelemre 57-et ad', async () => {
    const { agent } = fakeKassza()

    const empty = await agent.fetch('https://www.szamlazz.hu/szamla/', {
      method: 'POST',
      body: new FormData(),
    })
    const plain = await agent.fetch('https://www.szamlazz.hu/szamla/', {
      method: 'POST',
      body: 'nem multipart',
    })
    const broken = await rawAgentRequest(agent, 'getInvoiceXml', '<xmlszamlaxml><szamlaszam>')
    const wrongRoot = await rawAgentRequest(
      agent,
      'createReceipt',
      buildGetInvoiceXml(FAKE_CREDENTIALS, 'KASSZA-2026-1'),
    )

    expect(empty.headers.get('szlahu_error_code')).toBe('53')
    expect(plain.headers.get('szlahu_error_code')).toBe('53')
    expect(await broken.text()).toContain('<hibakod>57</hibakod>')
    expect(await wrongRoot.text()).toContain('&lt;xmlnyugtacreate&gt; gyökérelem kell')
    expect(agent.requests.map((request) => request.action)).toEqual([
      undefined,
      undefined,
      'getInvoiceXml',
      'createReceipt',
    ])
  })

  test('a kérésnaplóban a mellékletek neve és mérete is szerepel', async () => {
    const { agent, kassza } = fakeKassza()

    await kassza.invoices.create({
      buyer: {
        name: 'Vevő',
        zip: '1111',
        city: 'Budapest',
        address: 'Fő utca 1.',
        email: 'vevo@pelda.hu',
      },
      items: [{ name: 'Tétel', netUnitPrice: 100, vat: 27 }],
      attachments: [{ filename: 'szerzodes.pdf', content: new Uint8Array([1, 2, 3]) }],
    })

    expect(agent.requests[0]?.attachments).toEqual([{ filename: 'szerzodes.pdf', size: 3 }])
    expect(agent.requests[0]?.xml).toContain('<xmlszamla')
  })
})

describe('createFakeAgentFetch: adózó és megbízó', () => {
  test('ismert adózót címmel ad vissza, az ismeretlen érvénytelen', async () => {
    const { kassza } = fakeKassza({
      taxpayers: {
        '12345676-2-42': {
          name: 'MEGBÍZÓ KORLÁTOLT FELELŐSSÉGŰ TÁRSASÁG',
          shortName: 'MEGBÍZÓ KFT.',
          vatCode: '2',
          countyCode: '42',
          incorporation: 'ORGANIZATION',
          address: {
            postalCode: '1111',
            city: 'BUDAPEST',
            streetName: 'FŐ',
            publicPlaceCategory: 'UTCA',
            number: '1',
          },
        },
        '11111111': { name: 'Megszűnt Bt.', valid: false },
      },
    })

    const known = await kassza.taxpayer.query('12345676-2-42')
    const ceased = await kassza.taxpayer.query('11111111')
    const unknown = await kassza.taxpayer.query('22222222')

    expect(known).toMatchObject({
      valid: true,
      name: 'MEGBÍZÓ KORLÁTOLT FELELŐSSÉGŰ TÁRSASÁG',
      shortName: 'MEGBÍZÓ KFT.',
      taxNumber: { taxpayerId: '12345676', formatted: '12345676-2-42' },
      incorporation: 'ORGANIZATION',
      address: {
        type: 'HQ',
        postalCode: '1111',
        city: 'Budapest',
        formatted: '1111 Budapest, Fő utca 1.',
      },
    })
    expect(known.requestId).toMatch(/^KASSZAFAKE\d+$/)
    expect(ceased).toMatchObject({ valid: false, addresses: [] })
    expect(unknown.valid).toBe(false)
  })

  test('megbízói csatlakozás: új fiók, majd fiókgazdai meghívó újraküldése', async () => {
    const { agent } = fakeKassza()

    const created = await connectPrincipal(PRINCIPAL, {
      agentKey: TEST_AGENT_KEY,
      fetch: agent.fetch,
    })
    const again = await connectPrincipal(PRINCIPAL, {
      agentKey: TEST_AGENT_KEY,
      fetch: agent.fetch,
    })

    expect(created).toMatchObject({ status: 'account-created', message: 'DONE' })
    expect(again).toMatchObject({
      status: 'owner-invite-resent',
      message: CONNECT_PRINCIPAL_MESSAGES.ownerInviteResent,
    })
  })

  test('birtokba vett fióknál csatlakozási kérelmet küld, majd újraküldi', async () => {
    const { agent } = fakeKassza({ principals: { '12345676': 'owned' } })
    const options = { agentKey: TEST_AGENT_KEY, fetch: agent.fetch }

    const first = await connectPrincipal(PRINCIPAL, options)
    const second = await connectPrincipal(PRINCIPAL, options)

    expect(first.status).toBe('join-request-sent')
    expect(second.status).toBe('join-request-resent')
  })

  test('új megbízói fióknál a megbízott a birtokba vételig 250-et kap, utána aktív', async () => {
    const agent = createFakeAgentFetch({ now: FAKE_NOW, agentKeys: [TEST_AGENT_KEY] })

    await connectPrincipal(PRINCIPAL, { agentKey: TEST_AGENT_KEY, fetch: agent.fetch })
    const before = await probeDelegation({ ...PROBE, fetch: agent.fetch })
    agent.acceptDelegation('12345676')
    const after = await probeDelegation({ ...PROBE, fetch: agent.fetch })

    expect(before).toMatchObject({ state: 'awaiting-owner-registration', error: { code: 250 } })
    expect(after).toMatchObject({ state: 'active' })
  })

  test('csatlakozási kérelemnél a jóváhagyásig 3-at kap, rossz jelszóval utána is', async () => {
    const { agent } = fakeKassza({ principals: { '12345676-2-42': 'owned' } })

    await connectPrincipal(PRINCIPAL, { agentKey: TEST_AGENT_KEY, fetch: agent.fetch })
    const pending = await probeDelegation({ ...PROBE, fetch: agent.fetch })
    agent.acceptDelegation('12345676-2-42')
    const approved = await probeDelegation({ ...PROBE, fetch: agent.fetch })
    const wrongPassword = await probeDelegation({ ...PROBE, password: 'rossz', fetch: agent.fetch })

    expect(pending.state).toBe('awaiting-approval')
    expect(approved.state).toBe('active')
    expect(wrongPassword.state).toBe('awaiting-approval')
  })

  test('ismeretlen megbízói fiók jóváhagyására TypeError-t dob', () => {
    const agent = createFakeAgentFetch()

    expect(() => agent.acceptDelegation('99999999')).toThrow(TypeError)
  })
})
