import { Play } from 'lucide-react'
import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'
import { type GeneratedExampleCall, getExample } from '@/lib/examples'
import { highlightCode } from '@/lib/highlight'
import { CodeBlockTab, CodeBlockTabs, CodeBlockTabsList, CodeBlockTabsTrigger } from './tabs'

const ACTION_TITLES: Readonly<Record<string, string>> = {
  createInvoice: 'Számla létrehozás',
  reverseInvoice: 'Számla sztornó',
  registerPayment: 'Befizetés rögzítése',
  getInvoicePdf: 'PDF lekérés',
  getInvoiceXml: 'Számla adatai',
  deleteProforma: 'Díjbekérő törlése',
  createReceipt: 'Nyugta létrehozás',
  reverseReceipt: 'Nyugta sztornó',
  getReceipt: 'Nyugta lekérdezés',
  sendReceipt: 'Nyugta kiküldés',
  queryTaxpayer: 'Adószám lekérdezés',
}

function pickCalls(
  calls: readonly GeneratedExampleCall[],
  action: string | undefined,
): readonly GeneratedExampleCall[] {
  if (!action) return calls
  return calls.filter((call) => call.action === action)
}

function responseText(call: GeneratedExampleCall): string {
  const headers = call.responseHeaders.map(([name, value]) => `${name}: ${value}`).join('\n')
  return headers ? `${headers}\n\n${call.responseBody}` : call.responseBody
}

export async function Example({
  slug,
  action,
  title,
}: {
  slug: string
  action?: string
  title?: string
}) {
  const example = getExample(slug)
  const calls = pickCalls(example.calls, action)
  const code = await highlightCode(example.code, {
    lang: 'ts',
    title: `${slug}.ts`,
    twoslash: true,
  })
  const requests: ReactNode[] = []
  const responses: ReactNode[] = []
  for (const [position, call] of calls.entries()) {
    const prefix = calls.length > 1 ? `${position + 1}. ` : ''
    const label = `${prefix}${ACTION_TITLES[call.action] ?? call.action}`
    requests.push(
      <Fragment key={`keres-${call.field}-${position}`}>
        {await highlightCode(call.requestXml, { lang: 'xml', title: `${label} · ${call.field}` })}
      </Fragment>,
    )
    responses.push(
      <Fragment key={`valasz-${call.field}-${position}`}>
        {
          await highlightCode(responseText(call), {
            lang: call.responseKind === 'xml' ? 'xml' : 'text',
            title: `${label} · válasz, HTTP ${call.status}`,
          })
        }
      </Fragment>,
    )
  }
  const output = await highlightCode(
    example.output.map((line) => line.text).join('\n') || 'A példa nem írt a konzolra.',
    { lang: 'text', title: 'Konzol' },
  )

  return (
    <section className="not-prose my-6" aria-label={title ?? example.title}>
      <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{title ?? example.title}</p>
          <p className="text-sm text-muted">{example.description}</p>
        </div>
        <Link
          href={`/sandbox?pelda=${slug}`}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-rule bg-paper-raised px-3 text-sm font-medium whitespace-nowrap text-accent transition-colors hover:border-accent"
        >
          <Play className="size-3.5 fill-current" aria-hidden="true" />
          Futtatás a sandboxban
        </Link>
      </div>
      <CodeBlockTabs defaultValue="kod" groupId="kassza-pelda">
        <CodeBlockTabsList>
          <CodeBlockTabsTrigger value="kod">Kód</CodeBlockTabsTrigger>
          {calls.length > 0 ? (
            <CodeBlockTabsTrigger value="keres">Elküldött XML</CodeBlockTabsTrigger>
          ) : null}
          {calls.length > 0 ? (
            <CodeBlockTabsTrigger value="valasz">Válasz</CodeBlockTabsTrigger>
          ) : null}
          <CodeBlockTabsTrigger value="konzol">Konzol</CodeBlockTabsTrigger>
        </CodeBlockTabsList>
        <CodeBlockTab value="kod">{code}</CodeBlockTab>
        {calls.length > 0 ? <CodeBlockTab value="keres">{requests}</CodeBlockTab> : null}
        {calls.length > 0 ? <CodeBlockTab value="valasz">{responses}</CodeBlockTab> : null}
        <CodeBlockTab value="konzol">{output}</CodeBlockTab>
      </CodeBlockTabs>
    </section>
  )
}
