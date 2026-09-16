export type StorageOperation = 'put' | 'get' | 'delete' | 'getUrl' | 'key'

export interface StorageErrorOptions {
  readonly operation: StorageOperation
  readonly key?: string | undefined
  readonly status?: number | undefined
  readonly cause?: unknown
}

export class StorageError extends Error {
  override readonly name: string = 'StorageError'
  readonly operation: StorageOperation
  readonly key: string | undefined
  readonly status: number | undefined

  constructor(message: string, options: StorageErrorOptions) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.operation = options.operation
    this.key = options.key
    this.status = options.status
  }
}

export function isStorageError(error: unknown): error is StorageError {
  return error instanceof StorageError
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}

export async function guardStorageCall<T>(
  service: string,
  operation: StorageOperation,
  key: string,
  call: () => PromiseLike<T>,
): Promise<T> {
  try {
    return await call()
  } catch (error) {
    throw new StorageError(`${service} hiba (${operation}): ${describeError(error)}`, {
      operation,
      key,
      cause: error,
    })
  }
}
