import { isPdf } from '../core/binary'
import { StorageError } from './errors'
import { PDF_CONTENT_TYPE } from './shared'
import type { StorageAdapter, StoredFile } from './types'

export async function storePdf(
  storage: StorageAdapter,
  key: string,
  pdf: Uint8Array,
): Promise<StoredFile> {
  if (!isPdf(pdf)) {
    throw new StorageError('A tárolandó tartalom nem PDF (hiányzik a %PDF fejléc).', {
      operation: 'put',
      key,
    })
  }
  return storage.put(key, pdf, { contentType: PDF_CONTENT_TYPE })
}
