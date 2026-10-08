import type { KeyValueStore } from '../core/store'

export interface DurableObjectStorageLike {
  get(key: string): Promise<unknown>
  put(key: string, value: DurableObjectStoreEntry): Promise<void>
  delete(key: string): Promise<boolean>
}

export interface DurableObjectStubLike {
  fetch(input: string, init: RequestInit): Promise<Response>
}

export interface DurableObjectStoreEntry {
  readonly value: string
  readonly expiresAt: number
}

export type DurableObjectStoreOperation =
  | 'get'
  | 'set'
  | 'delete'
  | 'setIfAbsent'
  | 'increment'
  | 'deleteIfEquals'

interface StoreCommand {
  readonly op: DurableObjectStoreOperation
  readonly key: string
  readonly value?: string | undefined
  readonly ttlSeconds?: number | undefined
}

const OPERATIONS: ReadonlySet<string> = new Set([
  'get',
  'set',
  'delete',
  'setIfAbsent',
  'increment',
  'deleteIfEquals',
])

export const DURABLE_OBJECT_STORE_URL = 'https://kassza-store.internal/'

function isEntry(value: unknown): value is DurableObjectStoreEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return typeof entry.value === 'string' && typeof entry.expiresAt === 'number'
}

async function readLive(
  storage: DurableObjectStorageLike,
  key: string,
  now: number,
): Promise<string | undefined> {
  const stored = await storage.get(key)
  if (!isEntry(stored)) return undefined
  if (stored.expiresAt <= now) {
    await storage.delete(key)
    return undefined
  }
  return stored.value
}

function expiresAt(ttlSeconds: number | undefined, now: number): number {
  const ttl = ttlSeconds !== undefined && Number.isFinite(ttlSeconds) ? ttlSeconds : 1
  return now + Math.max(1, Math.ceil(ttl)) * 1000
}

function parseCommand(body: unknown): StoreCommand | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const command = body as Record<string, unknown>
  if (typeof command.op !== 'string' || !OPERATIONS.has(command.op)) return undefined
  if (typeof command.key !== 'string' || command.key === '') return undefined
  if (command.value !== undefined && typeof command.value !== 'string') return undefined
  if (command.ttlSeconds !== undefined && typeof command.ttlSeconds !== 'number') return undefined
  return command as unknown as StoreCommand
}

function requireValue(command: StoreCommand): string {
  if (command.value === undefined) throw new TypeError(`A(z) ${command.op} művelethez érték kell.`)
  return command.value
}

async function runCommand(
  storage: DurableObjectStorageLike,
  command: StoreCommand,
  now: number,
): Promise<string | number | boolean | null> {
  const { key } = command
  switch (command.op) {
    case 'get':
      return (await readLive(storage, key, now)) ?? null
    case 'set':
      await storage.put(key, {
        value: requireValue(command),
        expiresAt: expiresAt(command.ttlSeconds, now),
      })
      return null
    case 'delete':
      await storage.delete(key)
      return null
    case 'setIfAbsent': {
      const value = requireValue(command)
      if ((await readLive(storage, key, now)) !== undefined) return false
      await storage.put(key, { value, expiresAt: expiresAt(command.ttlSeconds, now) })
      return true
    }
    case 'increment': {
      const current = Number.parseInt((await readLive(storage, key, now)) ?? '0', 10)
      const next = (Number.isInteger(current) ? current : 0) + 1
      await storage.put(key, { value: String(next), expiresAt: expiresAt(command.ttlSeconds, now) })
      return next
    }
    case 'deleteIfEquals': {
      if ((await readLive(storage, key, now)) !== requireValue(command)) return false
      await storage.delete(key)
      return true
    }
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export async function handleDurableObjectStoreRequest(
  storage: DurableObjectStorageLike,
  request: Request,
): Promise<Response> {
  if (request.method !== 'POST')
    return jsonResponse({ error: 'Csak POST kérés engedélyezett.' }, 405)
  let command: StoreCommand | undefined
  try {
    command = parseCommand(await request.json())
  } catch {
    command = undefined
  }
  if (!command) return jsonResponse({ error: 'Érvénytelen tároló-parancs.' }, 400)
  try {
    return jsonResponse({ result: await runCommand(storage, command, Date.now()) })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : String(error) }, 400)
  }
}

async function call(
  stub: DurableObjectStubLike,
  command: StoreCommand,
): Promise<string | number | boolean | null> {
  const response = await stub.fetch(DURABLE_OBJECT_STORE_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(command),
  })
  const body = (await response.json().catch(() => ({}))) as {
    readonly result?: string | number | boolean | null
    readonly error?: string
  }
  if (!response.ok) {
    throw new Error(
      `A Durable Object tároló ${command.op} művelete sikertelen (HTTP ${response.status}): ${body.error ?? 'ismeretlen hiba'}`,
    )
  }
  return body.result ?? null
}

export function durableObjectStore(stub: DurableObjectStubLike): KeyValueStore {
  return {
    async get(key) {
      const result = await call(stub, { op: 'get', key })
      return typeof result === 'string' ? result : undefined
    },
    async set(key, value, ttlSeconds) {
      await call(stub, { op: 'set', key, value, ttlSeconds })
    },
    async delete(key) {
      await call(stub, { op: 'delete', key })
    },
    async setIfAbsent(key, value, ttlSeconds) {
      return (await call(stub, { op: 'setIfAbsent', key, value, ttlSeconds })) === true
    },
    async increment(key, ttlSeconds) {
      const result = await call(stub, { op: 'increment', key, ttlSeconds })
      if (typeof result !== 'number') {
        throw new TypeError(`A Durable Object tároló nem számot adott vissza: ${String(result)}`)
      }
      return result
    },
    async deleteIfEquals(key, value) {
      return (await call(stub, { op: 'deleteIfEquals', key, value })) === true
    },
  }
}
