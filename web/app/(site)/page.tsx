import { calculateInvoiceItem } from 'kassza/money'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { ClosingSection } from '@/components/landing/closing-section'
import { ComparisonSection, type MappingRow } from '@/components/landing/comparison-section'
import { Hero } from '@/components/landing/hero'
import { OperationsSection } from '@/components/landing/operations-section'
import { PitfallsSection } from '@/components/landing/pitfalls-section'
import { PlatformsSection } from '@/components/landing/platforms-section'
import { RouteSection } from '@/components/landing/route-section'
import {
  extractXmlSection,
  type InvoiceXmlSection,
  markAmountLines,
  renderSampleInvoiceXml,
  roundingSample,
  xmlErrorSample,
} from '@/components/landing/sample-invoice'
import {
  clientSnippet,
  envSnippet,
  errorHandlingSnippet,
  firstInvoiceSnippet,
  heroSnippet,
  installSnippet,
  ipnSnippet,
  mappingSnippets,
} from '@/components/landing/snippets'
import { type Step, StepsSection } from '@/components/landing/steps-section'
import { highlightCode } from '@/lib/highlight'
import { site } from '@/lib/site'

export const metadata: Metadata = {
  title: { absolute: 'kassza: Számlázz.hu Számla Agent kliens TypeScripthez' },
  description:
    'Nem hivatalos, nulla függőségű TypeScript kliens a Számlázz.hu Számla Agenthez. Sorrendhelyes XML, hivatalos kerekítés, budapesti dátum, session cookie, magyar hibaüzenetek és dupla számla elleni védelem mind a 11 művelethez.',
  alternates: { canonical: '/' },
}

const FIRST_INVOICE_ITEM = { quantity: 10, netUnitPrice: 15_000, vat: 27 } as const

const forint = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 })

function Code({ children }: { children: ReactNode }) {
  return <code className="font-mono text-[0.88em] text-ink">{children}</code>
}

const MAPPING_ROWS: readonly {
  readonly id: InvoiceXmlSection
  readonly title: string
  readonly note: ReactNode
}[] = [
  {
    id: 'beallitasok',
    title: 'Beállítások',
    note: (
      <>
        Az Agent kulcs a <Code>SZAMLAZZ_AGENT_KEY</Code> környezeti változóból jön. Az e-számla, a
        PDF letöltés és a válaszverzió alapértéket kap.
      </>
    ),
  },
  {
    id: 'fejlec',
    title: 'Fejléc',
    note: (
      <>
        A három dátum a mai nap, <Code>Europe/Budapest</Code> szerint. A <Code>toISOString()</Code>{' '}
        éjfél és hajnali kettő között még tegnapot adna, abból 352-es hiba lesz.
      </>
    ),
  },
  {
    id: 'vevo',
    title: 'Vevő',
    note: (
      <>
        A <Code>sendEmail</Code> azért <Code>true</Code>, mert a vevőnek van e-mail címe: a
        Számlázz.hu el is küldi neki a számlát.
      </>
    ),
  },
  {
    id: 'tetelek',
    title: 'Tételek',
    note: (
      <>
        A kiemelt négy számot a kassza számolta ki a bruttó egységárból, a hivatalos bruttó alapú
        kerekítéssel. A nyers API-nál ez a te dolgod.
      </>
    ),
  },
]

async function buildMappingRows(xml: string): Promise<MappingRow[]> {
  return Promise.all(
    MAPPING_ROWS.map(async (row) => ({
      ...row,
      xml: await highlightCode(markAmountLines(extractXmlSection(xml, row.id)), { lang: 'xml' }),
      ts: await highlightCode(mappingSnippets[row.id], { lang: 'ts' }),
    })),
  )
}

async function buildSteps(): Promise<Step[]> {
  const firstInvoiceGross = calculateInvoiceItem(FIRST_INVOICE_ITEM).grossAmount
  const [install, env, client, firstInvoice, errors, ipn] = await Promise.all([
    highlightCode(installSnippet, { lang: 'bash' }),
    highlightCode(envSnippet, { lang: 'dotenv', title: '.env' }),
    highlightCode(clientSnippet, { lang: 'ts', title: 'kassza.ts' }),
    highlightCode(firstInvoiceSnippet, { lang: 'ts', title: 'szamla.ts' }),
    highlightCode(errorHandlingSnippet, { lang: 'ts', title: 'szamlazas.ts' }),
    highlightCode(ipnSnippet, { lang: 'ts', title: 'app/api/szamlazz-ipn/route.ts' }),
  ])
  return [
    {
      id: 'telepites',
      title: 'Telepítsd',
      body: (
        <p>
          Egyetlen csomag, futásidejű függőség nélkül. Node.js 22 vagy újabb kell hozzá, de Bunon,
          Denón, Cloudflare Workersen és Vercel Edge-en is ugyanígy fut.
        </p>
      ),
      link: { href: '/docs/alapok/telepites', label: 'Telepítés részletesen' },
      code: [{ id: 'install', node: install }],
    },
    {
      id: 'kulcs',
      title: 'Add meg az Agent kulcsot',
      body: (
        <p>
          A kulcsot a Számlázz.hu felületén, a vezérlőpult alján hozod létre. Titok, csak kisbetűs
          lehet, és csak a szerveren a helye. A <Code>verifyCredentials()</Code> egy ártalmatlan
          lekérdezéssel ellenőrzi.
        </p>
      ),
      link: { href: '/docs/alapok/hitelesites', label: 'Hitelesítés' },
      code: [
        { id: 'env', node: env },
        { id: 'client', node: client },
      ],
    },
    {
      id: 'elso-szamla',
      title: 'Állítsd ki az első számlát',
      body: (
        <p>
          Nettó egységár B2B-hez, bruttó B2C-hez. Az <Code>orderNumber</Code> a saját azonosítód,
          ezzel később visszakeresed a számlát. A <Code>szamla.grossTotal</Code> itt{' '}
          <span className="tnum whitespace-nowrap">{forint.format(firstInvoiceGross)} Ft</span>{' '}
          lesz.
        </p>
      ),
      link: { href: '/docs/szamla-letrehozas', label: 'Számla létrehozása' },
      code: [{ id: 'first-invoice', node: firstInvoice }],
    },
    {
      id: 'hibak',
      title: 'Kezeld a hibát és a fizetést',
      body: (
        <p>
          Bizonytalan hiba után (hálózat, időtúllépés, részleges siker, már létező rendelésszám) a{' '}
          <Code>find</Code> megmondja, elkészült-e a számla. Ha a vevő fizet, a Számlázz.hu IPN
          értesítést küld, amit a <Code>kassza/ipn</Code> egy route handlerben feldolgoz.
        </p>
      ),
      link: { href: '/docs/alapok/hibakezeles', label: 'Hibakezelés' },
      code: [
        { id: 'errors', node: errors },
        { id: 'ipn', node: ipn },
      ],
    },
  ]
}

export default async function HomePage() {
  const sample = roundingSample()
  const xml = await renderSampleInvoiceXml()
  const [heroCode, mappingRows, steps] = await Promise.all([
    highlightCode(heroSnippet, { lang: 'ts', title: 'szamla.ts' }),
    buildMappingRows(xml),
    buildSteps(),
  ])

  return (
    <>
      <Hero code={heroCode} sample={sample} version={site.version} />
      <RouteSection />
      <ComparisonSection rows={mappingRows} />
      <PitfallsSection sample={sample} error={xmlErrorSample()} />
      <StepsSection steps={steps} />
      <OperationsSection />
      <PlatformsSection />
      <ClosingSection />
    </>
  )
}
