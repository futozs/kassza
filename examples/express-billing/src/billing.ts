import type { Kassza } from 'kassza'
import type { BatchResult, BillingPeriod } from 'kassza/batch'
import { billingPeriodAt, runBatch } from 'kassza/batch'
import type { Journal } from 'kassza/journal'

export interface Subscription {
  readonly id: string
  readonly startedOn: string
  readonly monthlyGross: number
  readonly planName: string
  readonly buyer: {
    readonly name: string
    readonly zip: string
    readonly city: string
    readonly address: string
    readonly email?: string | undefined
    readonly taxNumber?: string | undefined
  }
}

export interface MonthlyBillingOptions {
  readonly now: Date
  readonly dryRun?: boolean | undefined
  readonly journal?: Journal | undefined
  readonly ratePerMinute?: number | undefined
}

export function periodFor(subscription: Subscription, now: Date): BillingPeriod {
  return billingPeriodAt(
    { interval: 'month', anchor: subscription.startedOn, paymentDueInDays: 8 },
    now,
  )
}

export function runMonthlyBilling(
  kassza: Kassza,
  subscriptions: readonly Subscription[],
  options: MonthlyBillingOptions,
): Promise<BatchResult> {
  return runBatch(kassza, {
    dryRun: options.dryRun,
    journal: options.journal,
    ratePerMinute: options.ratePerMinute,
    items: subscriptions.map((subscription) => {
      const period = periodFor(subscription, options.now)
      return {
        key: `SUB-${subscription.id}-${period.start}`,
        document: () => ({
          kind: 'invoice' as const,
          input: {
            buyer: subscription.buyer,
            dueDate: period.dueDate,
            fulfillmentDate: period.end,
            items: [
              {
                name: `${subscription.planName} (${period.start} – ${period.end})`,
                grossUnitPrice: subscription.monthlyGross,
                vat: 27 as const,
              },
            ],
          },
        }),
      }
    }),
  })
}
