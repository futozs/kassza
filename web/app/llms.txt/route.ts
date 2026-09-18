import { absoluteUrl } from '@/lib/docs-links'
import { buildLlmsSections, renderLlmsIndex, toLlmsLink } from '@/lib/llms'
import { site } from '@/lib/site'
import { source } from '@/lib/source'

export const revalidate = false

export function GET() {
  const sections = buildLlmsSections(source.getPageTree(), (item) => {
    const page = source.getNodePage(item)
    return page ? toLlmsLink(page, site.url) : undefined
  })

  const body = renderLlmsIndex({
    title: site.name,
    summary: site.description,
    details: [
      `A kassza nem hivatalos, nyílt forráskódú projekt, a Számlázz.hu (KBOSS.hu Kft.) nem áll mögötte. Telepítés: \`npm install kassza\`. A Számla Agent hivatalos leírása: ${site.officialDocs}`,
      `Minden dokumentációs oldal Markdownként is elérhető, ha az oldal URL-jéhez hozzáadod a \`.md\` kiterjesztést (a kezdőlapé \`/docs/index.md\`). A teljes dokumentáció egyetlen fájlban: ${absoluteUrl('/llms-full.txt', site.url)}`,
    ],
    sections,
    optional: [
      {
        title: 'Sandbox',
        url: absoluteUrl('/sandbox', site.url),
        description:
          'A kassza példái a böngészőben futtathatók, Agent kulcs nélkül, egy szimulált Számlázz.hu ellen.',
      },
      { title: 'GitHub', url: site.repo, description: 'Forráskód, hibabejelentés.' },
      {
        title: 'npm',
        url: site.npm,
        description: `A kassza csomag, jelenlegi verzió: ${site.version}.`,
      },
      { title: 'Változásnapló', url: site.changelog },
      {
        title: 'Számlázz.hu Számla Agent (hivatalos dokumentáció)',
        url: site.officialDocs,
      },
    ],
  })

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
