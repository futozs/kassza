import { createKassza, type Kassza, type KasszaDefaults, type KasszaOptions } from '../client'
import { SzamlazzError } from '../core/errors'
import { DELEGATE_PREFIX_PATTERN } from './connect'

export const DEFAULT_POOL_SIZE = 100

const RECEIPT_PREFIX_PATTERN = /^[A-Z0-9]+$/

export interface DelegateCredentials {
  readonly username: string
  readonly password: string
  readonly invoicePrefix: string
  readonly receiptPrefix?: string | undefined
  readonly defaults?: KasszaDefaults | undefined
}

export interface DelegateKasszaOptions
  extends Omit<KasszaOptions, 'agentKey' | 'username' | 'password' | 'defaults'>,
    DelegateCredentials {}

export type DelegateResolver = (
  principalId: string,
) => DelegateCredentials | undefined | Promise<DelegateCredentials | undefined>

export interface KasszaPoolOptions
  extends Omit<KasszaOptions, 'agentKey' | 'username' | 'password' | 'defaults'> {
  readonly resolve: DelegateResolver
  readonly maxClients?: number | undefined
}

export interface KasszaPool {
  get(principalId: string): Promise<Kassza>
  forget(principalId: string): void
  clear(): void
  readonly size: number
}

function configuration(message: string, hint?: string): SzamlazzError {
  return new SzamlazzError(message, { category: 'configuration', hint })
}

function delegatePrefix(value: string | undefined): string {
  const prefix = value?.trim()
  if (!prefix || !DELEGATE_PREFIX_PATTERN.test(prefix)) {
    throw configuration(
      `A megbízotti számlaszám-előtag (${prefix ?? ''}) csak nagybetűt és számot tartalmazhat, és legfeljebb 5 karakter lehet.`,
      'A csatlakozáskor egyeztetett előtagot add meg; ezt a kassza minden számlában elküldi, így nem fut 357-es hibára egy második számlatömb után sem.',
    )
  }
  return prefix
}

function receiptPrefix(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const prefix = value.trim()
  if (!RECEIPT_PREFIX_PATTERN.test(prefix)) {
    throw configuration(
      `A megbízotti nyugtaelőtag (${prefix}) csak nagybetűt és számot tartalmazhat.`,
    )
  }
  return prefix
}

export function createDelegateKassza(options: DelegateKasszaOptions): Kassza {
  const { username, password, invoicePrefix, receiptPrefix: receipt, defaults, ...rest } = options
  if ((options as { readonly agentKey?: unknown }).agentKey !== undefined) {
    throw configuration(
      'Megbízotti kiállításhoz nem használható Agent kulcs: a kulcs a fiókhoz tartozik, így a bizonylat a megbízó saját neve alatt készülne.',
      'Add meg a csatlakozáskor létrehozott dedikált (usrMb) felhasználó felhasználónevét és jelszavát.',
    )
  }
  if (!username?.trim() || !password) {
    throw configuration('Add meg a dedikált (usrMb) felhasználó felhasználónevét és jelszavát.')
  }
  const prefix = delegatePrefix(invoicePrefix)
  const receiptDefaultPrefix = receiptPrefix(receipt)
  const receiptDefaults =
    receiptDefaultPrefix === undefined
      ? defaults?.receipt
      : { ...defaults?.receipt, prefix: receiptDefaultPrefix }
  return createKassza({
    ...rest,
    username: username.trim(),
    password,
    defaults: {
      invoice: { ...defaults?.invoice, prefix },
      ...(receiptDefaults === undefined ? {} : { receipt: receiptDefaults }),
    },
  })
}

function poolSize(value: number | undefined): number {
  if (value === undefined) return DEFAULT_POOL_SIZE
  if (!Number.isInteger(value) || value < 1) {
    throw configuration(`A maxClients értéke legalább 1 egész szám legyen, kapott: ${value}`)
  }
  return value
}

export function createKasszaPool(options: KasszaPoolOptions): KasszaPool {
  const { resolve, maxClients, ...shared } = options
  if (typeof resolve !== 'function') {
    throw configuration('A kassza poolhoz add meg a resolve függvényt.')
  }
  const limit = poolSize(maxClients)
  const clients = new Map<string, Promise<Kassza>>()

  async function create(principalId: string): Promise<Kassza> {
    const credentials = await resolve(principalId)
    if (!credentials) throw configuration(`Ismeretlen megbízó: ${principalId}.`)
    return createDelegateKassza({ ...shared, ...credentials })
  }

  function evict(): void {
    while (clients.size > limit) {
      const oldest = clients.keys().next()
      if (oldest.done) return
      clients.delete(oldest.value)
    }
  }

  return {
    get(principalId) {
      const id = typeof principalId === 'string' ? principalId.trim() : ''
      if (!id) return Promise.reject(configuration('Add meg a megbízó azonosítóját.'))
      const existing = clients.get(id)
      if (existing) {
        clients.delete(id)
        clients.set(id, existing)
        return existing
      }
      const created = create(id)
      clients.set(id, created)
      created.catch(() => {
        if (clients.get(id) === created) clients.delete(id)
      })
      evict()
      return created
    },
    forget(principalId) {
      clients.delete(principalId.trim())
    },
    clear() {
      clients.clear()
    },
    get size() {
      return clients.size
    },
  }
}
