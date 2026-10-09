import { createAppKassza } from '../../../../lib/kassza'
import { createStore } from '../../../../lib/store'
import { createStripeHandler } from '../../../../lib/webhook'

const store = createStore()
const kassza = createAppKassza({ store })

export const POST = createStripeHandler(kassza, {
  secret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  apiKey: process.env.STRIPE_SECRET_KEY,
  dedupe: store,
  onManualReview: (paymentId, reason) => {
    console.error(`Kézi teendő a(z) ${paymentId} fizetésnél: ${reason}`)
  },
})
