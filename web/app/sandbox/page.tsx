import type { Metadata } from 'next'
import { SandboxApp } from '@/components/sandbox/sandbox-app'
import examples from '@/generated/examples.json'
import manifest from '@/generated/sandbox-manifest.json'
import { site } from '@/lib/site'
import type { ExampleGroup } from '@/sandbox/examples/catalog'

export const metadata: Metadata = {
  title: 'Sandbox',
  description:
    'Futtasd a kassza példáit a böngészőben, Agent kulcs nélkül. A kód egy szimulált Számlázz.hu ellen fut, és látod a pontosan elküldött XML-t.',
  alternates: { canonical: '/sandbox' },
}

export default function SandboxPage() {
  return (
    <SandboxApp
      examples={examples.map((example) => ({
        slug: example.slug,
        title: example.title,
        group: example.group as ExampleGroup,
        description: example.description,
        docs: example.docs,
        code: example.code,
      }))}
      manifest={manifest}
      kasszaVersion={site.version}
    />
  )
}
