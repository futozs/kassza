import { DurableObject } from 'cloudflare:workers'
import { handleDurableObjectStoreRequest } from 'kassza/stores'

export class KasszaStore extends DurableObject {
  fetch(request: Request): Promise<Response> {
    return handleDurableObjectStoreRequest(this.ctx.storage, request)
  }
}
