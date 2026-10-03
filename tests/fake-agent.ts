import { createKassza, type Kassza, type KasszaOptions } from '../src/client'
import { AGENT_ACTIONS, type AgentAction } from '../src/core/actions'
import { el, type XmlNode } from '../src/core/xml/serialize'
import { createFakeAgentFetch, type FakeAgent, type FakeAgentOptions } from '../src/testing'
import { TEST_AGENT_KEY } from './helpers'

export const FAKE_NOW = (): Date => new Date('2026-10-02T10:00:00Z')

export const FAKE_CREDENTIALS: readonly XmlNode[] = [el('szamlaagentkulcs', TEST_AGENT_KEY)]

export interface FakeKassza {
  readonly agent: FakeAgent
  readonly kassza: Kassza
}

export function fakeKassza(
  options: FakeAgentOptions = {},
  kasszaOptions: KasszaOptions = {},
): FakeKassza {
  const agent = createFakeAgentFetch({ now: FAKE_NOW, ...options })
  const kassza = createKassza({
    agentKey: TEST_AGENT_KEY,
    retryDelayMs: 0,
    fetch: agent.fetch,
    defaults: { receipt: { prefix: 'NYGT', paymentMethod: 'bankkártya' } },
    ...kasszaOptions,
  })
  return { agent, kassza }
}

export function rawAgentRequest(
  agent: FakeAgent,
  action: AgentAction,
  xml: string,
): Promise<Response> {
  const form = new FormData()
  form.append(AGENT_ACTIONS[action], new Blob([xml], { type: 'text/xml' }), 'request.xml')
  return agent.fetch('https://www.szamlazz.hu/szamla/', { method: 'POST', body: form })
}
