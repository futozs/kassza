import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { BenefitsSection } from '@/components/landing/benefits-section'
import { ClosingSection } from '@/components/landing/closing-section'
import { CoverageSection } from '@/components/landing/coverage-section'
import { Hero, type HeroFacts } from '@/components/landing/hero'
import { OPERATION_COUNT } from '@/components/landing/operations'
import { renderSampleInvoiceXml } from '@/components/landing/sample-invoice'
import {
  envSnippet,
  heroSnippet,
  installSnippet,
  quickInvoiceSnippet,
} from '@/components/landing/snippets'
import { StartSection, type StartStep } from '@/components/landing/start-section'
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

const RECIPES_PREFIX = '/docs/receptek/'
const XML_PREVIEW_LINES = 24

function Code({ children }: { children: ReactNode }) {
  return <code className="font-mono text-[0.88em] text-ink">{children}</code>
}

function heroFacts(): HeroFacts {
  const pages = source.getPages()
  return {
    operations: OPERATION_COUNT,
    examples: examples.length,
    recipes: pages.filter((page) => page.url.startsWith(RECIPES_PREFIX)).length,
    version: site.version,
  }
}

function previewXml(xml: string): { preview: string; total: number } {
  const lines = xml.trimEnd().split('\n')
  if (lines.length <= XML_PREVIEW_LINES) return { preview: lines.join('\n'), total: lines.length }
  const rest = lines.length - XML_PREVIEW_LINES
  const preview = [...lines.slice(0, XML_PREVIEW_LINES), `<!-- … és még ${rest} sor -->`]
  return { preview: preview.join('\n'), total: lines.length }
}

async function buildStartSteps(): Promise<StartStep[]> {
  const [install, env, invoice] = await Promise.all([
    highlightCode(installSnippet, { lang: 'bash' }),
    highlightCode(envSnippet, { lang: 'dotenv', title: '.env' }),
    highlightCode(quickInvoiceSnippet, { lang: 'ts', title: 'szamla.ts' }),
  ])
  return [
    {
      title: 'Telepítsd',
      body: <p>Egyetlen csomag, futásidejű függőség nélkül. Node.js 22 vagy újabb kell hozzá.</p>,
      code: install,
      link: { href: '/docs/alapok/telepites', label: 'Telepítés' },
    },
    {
      title: 'Add meg az Agent kulcsot',
      body: (
        <p>
          A kulcsot a Számlázz.hu fiókodban hozod létre. A <Code>verifyCredentials()</Code>{' '}
          ellenőrzi, hogy működik-e.
        </p>
      ),
      code: env,
      link: { href: '/docs/alapok/hitelesites', label: 'Hitelesítés' },
    },
    {
      title: 'Állítsd ki a számlát',
      body: (
        <p>
          Az <Code>orderNumber</Code> a saját rendelésszámod, ezzel később visszakeresed a számlát.
        </p>
      ),
      code: invoice,
      link: { href: '/docs/szamla-letrehozas', label: 'Számla létrehozása' },
    },
  ]
}

export default async function HomePage() {
  const { preview, total } = previewXml(await renderSampleInvoiceXml())
  const [tsCode, xmlCode, steps] = await Promise.all([
    highlightCode(heroSnippet, { lang: 'ts', title: 'szamla.ts' }),
    highlightCode(preview, { lang: 'xml', title: 'A Számlázz.hu ezt kapja' }),
    buildStartSteps(),
  ])

  return (
    <>
      <Hero
        tabs={[
          { id: 'ts', label: 'Amit te írsz', node: tsCode },
          { id: 'xml', label: 'Amit a kassza elküld', node: xmlCode },
        ]}
        xmlLines={total}
        facts={heroFacts()}
      />
      <BenefitsSection />
      <CoverageSection />
      <StartSection steps={steps} />
      <ClosingSection />
    </>
  )
}
