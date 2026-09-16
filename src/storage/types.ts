export interface StoredFile {
  readonly key: string
  readonly url?: string | undefined
  readonly size: number
  readonly contentType: string
}

export interface StoragePutOptions {
  readonly contentType: string
}

export interface StorageUrlOptions {
  readonly expiresInSeconds?: number | undefined
}

export interface StorageAdapter {
  put(key: string, body: Uint8Array, options: StoragePutOptions): Promise<StoredFile>
  get?(key: string): Promise<Uint8Array | undefined>
  delete?(key: string): Promise<void>
  getUrl?(key: string, options?: StorageUrlOptions): Promise<string>
}

export interface CompleteStorageAdapter extends StorageAdapter {
  get(key: string): Promise<Uint8Array | undefined>
  delete(key: string): Promise<void>
  getUrl(key: string, options?: StorageUrlOptions): Promise<string>
}
