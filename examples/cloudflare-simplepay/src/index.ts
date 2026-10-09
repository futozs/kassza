import { durableObjectStore } from 'kassza/stores'
import { createWorkerHandler } from './handler'

export { KasszaStore } from './kassza-store'

interface Env {
  readonly SZAMLAZZ_AGENT_KEY: string
  readonly SIMPLEPAY_SECRET_KEY: string
  readonly SIMPLEPAY_SANDBOX?: string
  readonly KASSZA_STORE: DurableObjectNamespace
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    const stub = env.KASSZA_STORE.get(env.KASSZA_STORE.idFromName('kassza'))
    return createWorkerHandler({
      agentKey: env.SZAMLAZZ_AGENT_KEY,
      simplePaySecretKey: env.SIMPLEPAY_SECRET_KEY,
      sandbox: env.SIMPLEPAY_SANDBOX === '1',
      store: durableObjectStore(stub),
    })(request)
  },
}
