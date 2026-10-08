import { AGENT_ERROR_CODES } from 'kassza'
import type { Metadata } from 'next'
import { ClosingSection } from '@/components/landing/closing-section'
import { CompareSection } from '@/components/landing/compare-section'
import type { FeatureData } from '@/components/landing/feature-visuals'
import { FeaturesSection } from '@/components/landing/features-section'
import { Hero } from '@/components/landing/hero'
import type { HeroInvoice } from '@/components/landing/hero-stage'
import { OPERATION_COUNT } from '@/components/landing/operations'
import { OperationsStatement } from '@/components/landing/operations-statement'
import { PaymentsSection } from '@/components/landing/payments-section'
import { ProofSection } from '@/components/landing/proof-section'
import { proofSnippet } from '@/components/landing/proof-snippet'
import { RuntimeOrbit } from '@/components/landing/runtime-orbit'
import {
  type InvoiceTotals,
  readInvoiceTotals,
  renderSampleInvoiceXml,
  sampleInvoice,
  sampleItem,
} from '@/components/landing/sample-invoice'
import { SmoothScroll } from '@/components/landing/smooth-scroll'
import { type Stat, StatsBand } from '@/components/landing/stats-band'
import examples from '@/generated/examples.json'
import { highlightCode } from '@/lib/highlight'
import { site } from '@/lib/site'
import { source } from '@/lib/source'

export const metadata: Metadata = {
  title: { absolute: 'kassza: Számlázz.hu Számla Agent kliens TypeScripthez' },
  description:
    'Nem hivatalos, nulla függőségű TypeScript kliens a Számlázz.hu Számla Agenthez. Mind a 11 művelet, hivatalos kerekítés, magyar idő, magyar hibaüzenetek és védelem a dupla számla ellen.',
  alternates: { canonical: '/' },
}

const SAMPLE_INVOICE_SEQUENCE = 148
const DATE_ERROR_CODE = 352
const RECIPES_PREFIX = '/docs/receptek/'
const XML_PREVIEW_LINES = 30

const huf = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0, useGrouping: 'always' })

const unitPrice = new Intl.NumberFormat('hu-HU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: 'always',
})

function invoiceNumber(): string {
  return `KSZ-${new Date().getFullYear()}-${SAMPLE_INVOICE_SEQUENCE}`
}

function heroInvoice(totals: InvoiceTotals): HeroInvoice {
  return {
    number: invoiceNumber(),
    buyerName: sampleInvoice.buyer.name,
    itemName: sampleItem.name,
    itemLine: `${sampleItem.quantity} db × ${huf.format(sampleItem.grossUnitPrice)} Ft`,
    vatLabel: `ÁFA ${sampleItem.vat}%`,
    vat: `${huf.format(totals.vat)} Ft`,
    gross: `${huf.format(totals.gross)} Ft`,
    grossValue: totals.gross,
  }
}

function featureData(totals: InvoiceTotals): FeatureData {
  const error = AGENT_ERROR_CODES[DATE_ERROR_CODE]
  if (!error?.hint) throw new Error(`Hiányzik a(z) ${DATE_ERROR_CODE}-es hibakód leírása.`)
  return {
    orderNumber: sampleInvoice.orderNumber,
    invoiceNumber: invoiceNumber(),
    netUnitPrice: `${unitPrice.format(totals.netUnitPrice)} Ft`,
    quantity: sampleItem.quantity,
    net: `${huf.format(totals.net)} Ft`,
    vatLabel: `ÁFA ${sampleItem.vat}%`,
    vat: `${huf.format(totals.vat)} Ft`,
    gross: `${huf.format(totals.gross)} Ft`,
    errorCode: DATE_ERROR_CODE,
    errorCount: Object.keys(AGENT_ERROR_CODES).length,
    errorMessage: error.message,
    errorHint: error.hint,
  }
}

function stats(): readonly Stat[] {
  const recipes = source.getPages().filter((page) => page.url.startsWith(RECIPES_PREFIX)).length
  return [
    { value: OPERATION_COUNT, suffix: `/${OPERATION_COUNT}`, label: 'Számla Agent művelet' },
    { value: Object.keys(AGENT_ERROR_CODES).length, label: 'hibakód magyarul' },
    { value: examples.length, label: 'futtatható példa' },
    { value: recipes, label: 'kész recept' },
    { value: 0, label: 'futásidejű függőség' },
  ]
}

function previewXml(xml: string): { preview: string; total: number } {
  const lines = xml.trimEnd().split('\n')
  return { preview: lines.slice(0, XML_PREVIEW_LINES).join('\n'), total: lines.length }
}

export default async function HomePage() {
  const xml = await renderSampleInvoiceXml()
  const totals = readInvoiceTotals(xml)
  const { preview, total } = previewXml(xml)
  const [tsCode, xmlCode] = await Promise.all([
    highlightCode(proofSnippet, { lang: 'ts', title: 'szamla.ts' }),
    highlightCode(preview, { lang: 'xml', title: 'xmlagentxmlfile' }),
  ])

  return (
    <>
      <SmoothScroll />
      <Hero invoice={heroInvoice(totals)} version={site.version} operations={OPERATION_COUNT} />
      <StatsBand stats={stats()} />
      <OperationsStatement count={OPERATION_COUNT} />
      <FeaturesSection data={featureData(totals)} />
      <ProofSection
        ts={tsCode}
        xml={xmlCode}
        tsLines={proofSnippet.split('\n').length}
        xmlLines={total}
      />
      <PaymentsSection />
      <CompareSection total={OPERATION_COUNT} />
      <RuntimeOrbit />
      <ClosingSection />
    </>
  )
}
