import type { AgentContext, RequestOptions } from '../core/context'
import { type DateInput, todayInBudapest } from '../core/dates'
import type { AgentResponse } from '../core/response'
import { buildXmlDocument, el, optionalEl, type XmlNode } from '../core/xml/serialize'
import {
  AGENT_XSD_BASE_URL,
  agentDate,
  optionalText,
  parseInvoiceResult,
  RESPONSE_VERSION_XML,
  requireText,
  validationError,
} from './reference'

export const MAX_PAYMENTS_PER_REQUEST = 5

export const DEFAULT_PAYMENT_METHOD = 'átutalás'

export interface PaymentEntry {
  readonly date?: DateInput | undefined
  readonly method: string
  readonly amount: number
  readonly description?: string | undefined
}

interface PaymentTarget {
  readonly invoiceNumber: string
  readonly taxNumber?: string | undefined
}

export interface RegisterPaymentsInput extends PaymentTarget {
  readonly additive?: boolean | undefined
  readonly payments: readonly PaymentEntry[]
}

export interface RegisterSinglePaymentInput extends PaymentTarget {
  readonly additive?: boolean | undefined
  readonly amount: number
  readonly method?: string | undefined
  readonly date?: DateInput | undefined
  readonly description?: string | undefined
}

export type RegisterPaymentInput = RegisterPaymentsInput | RegisterSinglePaymentInput

export type ClearPaymentsInput = string | PaymentTarget

export interface RegisteredPayment {
  readonly invoiceNumber: string
  readonly netTotal?: number | undefined
  readonly grossTotal?: number | undefined
  readonly outstanding?: number | undefined
  readonly buyerAccountUrl?: string | undefined
}

interface NormalizedPaymentRequest {
  readonly invoiceNumber: string
  readonly taxNumber: string | undefined
  readonly additive: boolean
  readonly payments: readonly PaymentEntry[]
}

function normalizeRegisterInput(input: RegisterPaymentInput): NormalizedPaymentRequest {
  const payments =
    'payments' in input
      ? input.payments
      : [
          {
            amount: input.amount,
            method: input.method ?? DEFAULT_PAYMENT_METHOD,
            date: input.date,
            description: input.description,
          },
        ]
  if (!Array.isArray(payments) || payments.length === 0) {
    throw validationError(
      'Adj meg legalább egy befizetést (payments). A korábbi befizetések törléséhez a clearPayments függvényt használd.',
    )
  }
  if (payments.length > MAX_PAYMENTS_PER_REQUEST) {
    throw validationError(
      `Egy kérésben legfeljebb ${MAX_PAYMENTS_PER_REQUEST} befizetés rögzíthető, kapott: ${payments.length}.`,
    )
  }
  return {
    invoiceNumber: input.invoiceNumber,
    taxNumber: input.taxNumber,
    additive: input.additive ?? true,
    payments,
  }
}

function normalizeClearInput(input: ClearPaymentsInput): NormalizedPaymentRequest {
  const target = typeof input === 'string' ? { invoiceNumber: input } : input
  return {
    invoiceNumber: target.invoiceNumber,
    taxNumber: target.taxNumber,
    additive: false,
    payments: [],
  }
}

function paymentNode(payment: PaymentEntry, index: number): XmlNode {
  const position = index + 1
  if (typeof payment.amount !== 'number' || !Number.isFinite(payment.amount)) {
    throw validationError(`A(z) ${position}. befizetés összege (amount) nem véges szám.`)
  }
  return el('kifizetes', [
    el('datum', payment.date === undefined ? todayInBudapest() : agentDate(payment.date, 'date')),
    el(
      'jogcim',
      requireText(payment.method, `Add meg a(z) ${position}. befizetés módját (method).`),
    ),
    el('osszeg', payment.amount),
    optionalEl('leiras', optionalText(payment.description)),
  ])
}

function buildPaymentXml(
  credentials: readonly XmlNode[],
  request: NormalizedPaymentRequest,
): string {
  const invoiceNumber = requireText(
    request.invoiceNumber,
    'Add meg a számla számát (invoiceNumber), amelyhez a befizetés tartozik.',
  )
  return buildXmlDocument({
    root: 'xmlszamlakifiz',
    namespace: 'http://www.szamlazz.hu/xmlszamlakifiz',
    schemaLocation: `${AGENT_XSD_BASE_URL}agentkifiz/xmlszamlakifiz.xsd`,
    children: [
      el('beallitasok', [
        ...credentials,
        el('szamlaszam', invoiceNumber),
        optionalEl('adoszam', optionalText(request.taxNumber)),
        el('additiv', request.additive),
        el('valaszVerzio', RESPONSE_VERSION_XML),
      ]),
      ...request.payments.map(paymentNode),
    ],
  })
}

export function buildRegisterPaymentXml(
  credentials: readonly XmlNode[],
  input: RegisterPaymentInput,
): string {
  return buildPaymentXml(credentials, normalizeRegisterInput(input))
}

export function buildClearPaymentsXml(
  credentials: readonly XmlNode[],
  input: ClearPaymentsInput,
): string {
  return buildPaymentXml(credentials, normalizeClearInput(input))
}

export function parseRegisterPaymentResponse(
  response: AgentResponse,
  invoiceNumber: string,
): RegisteredPayment {
  const result = parseInvoiceResult(response)
  return {
    invoiceNumber: result.number ?? invoiceNumber.trim(),
    netTotal: result.netTotal,
    grossTotal: result.grossTotal,
    outstanding: result.outstanding,
    buyerAccountUrl: result.buyerAccountUrl,
  }
}

function sendPaymentRequest(
  ctx: AgentContext,
  request: NormalizedPaymentRequest,
  options: RequestOptions,
): Promise<RegisteredPayment> {
  const xml = buildPaymentXml(ctx.credentials, request)
  return ctx.execute(
    {
      action: 'registerPayment',
      xml,
      signal: options.signal,
      safeToRetry: !request.additive,
    },
    (response) => parseRegisterPaymentResponse(response, request.invoiceNumber),
  )
}

export async function registerPayment(
  ctx: AgentContext,
  input: RegisterPaymentInput,
  options: RequestOptions = {},
): Promise<RegisteredPayment> {
  return sendPaymentRequest(ctx, normalizeRegisterInput(input), options)
}

export async function clearPayments(
  ctx: AgentContext,
  input: ClearPaymentsInput,
  options: RequestOptions = {},
): Promise<RegisteredPayment> {
  return sendPaymentRequest(ctx, normalizeClearInput(input), options)
}
