import * as kassza from 'kassza'
import * as cookieStores from 'kassza/cookie-stores'
import * as ipn from 'kassza/ipn'
import * as money from 'kassza/money'
import * as storage from 'kassza/storage'
import * as testing from 'kassza/testing'
import * as validators from 'kassza/validators'
import { type AgentSimulator, TAXPAYER_FIXTURES } from '../simulator'

export const SANDBOX_AGENT_KEY = 'sandbox-agent-kulcs-0000'

export const SANDBOX_MODULE_IDS = [
  'kassza',
  'kassza/testing',
  'kassza/money',
  'kassza/validators',
  'kassza/ipn',
  'kassza/storage',
  'kassza/cookie-stores',
  'kassza-sandbox',
] as const

export function createSandboxModules(simulator: AgentSimulator): Record<string, unknown> {
  return {
    kassza,
    'kassza/testing': testing,
    'kassza/money': money,
    'kassza/validators': validators,
    'kassza/ipn': ipn,
    'kassza/storage': storage,
    'kassza/cookie-stores': cookieStores,
    'kassza-sandbox': {
      simulator: {
        failNext: simulator.failNext,
        account: () => simulator.snapshot(),
        get calls() {
          return simulator.calls
        },
      },
      sampleTaxNumbers: Object.keys(TAXPAYER_FIXTURES),
    },
  }
}

export interface SandboxGlobals {
  restore(): void
}

export function installSandboxGlobals(simulator: AgentSimulator): SandboxGlobals {
  const scope = globalThis as unknown as {
    fetch: typeof globalThis.fetch
    process?: { env?: Record<string, string | undefined> } | undefined
  }
  const previousFetch = scope.fetch
  const previousProcess = scope.process
  const previousKey = previousProcess?.env?.SZAMLAZZ_AGENT_KEY
  scope.fetch = simulator.fetch
  if (previousProcess?.env) {
    previousProcess.env.SZAMLAZZ_AGENT_KEY = SANDBOX_AGENT_KEY
  } else {
    scope.process = { env: { SZAMLAZZ_AGENT_KEY: SANDBOX_AGENT_KEY } }
  }
  return {
    restore() {
      scope.fetch = previousFetch
      if (previousProcess?.env) {
        if (previousKey === undefined) delete previousProcess.env.SZAMLAZZ_AGENT_KEY
        else previousProcess.env.SZAMLAZZ_AGENT_KEY = previousKey
      } else {
        scope.process = previousProcess
      }
    },
  }
}
