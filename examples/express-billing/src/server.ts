import express from 'express'
import Redis from 'ioredis'
import { createKassza } from 'kassza'
import { toNodeHandler } from 'kassza/node'
import { stripeWebhook } from 'kassza/payments/stripe'
import { ioredisStore } from 'kassza/stores'
import { runMonthlyBilling, type Subscription } from './billing.ts'

const store = ioredisStore(new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379'))
const kassza = createKassza({ cookieStore: store, attemptLedger: store, createOnceLock: store })
const subscriptions: Subscription[] = []

const app = express()

app.post(
  '/webhooks/stripe',
  toNodeHandler(
    stripeWebhook({
      secret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
      dedupe: store,
      onPayment: (payment) => kassza.issueForPayment(payment, { vat: 27 }),
    }),
  ),
)

app.use(express.json())

app.post('/billing/monthly', async (request, response) => {
  if (request.get('authorization') !== `Bearer ${process.env.BILLING_TOKEN}`) {
    response.status(401).end()
    return
  }
  const result = await runMonthlyBilling(kassza, subscriptions, {
    now: new Date(),
    dryRun: request.query.dryRun === '1',
  })
  response.status(result.stopped ? 503 : 200).json({
    created: result.created.length,
    existing: result.existing.length,
    previewed: result.previewed.length,
    failed: result.failed.map((item) => item.key),
    stopped: result.stopped?.reason,
  })
})

app.listen(Number(process.env.PORT ?? 3000))
