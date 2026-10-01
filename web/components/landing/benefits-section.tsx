import {
  Calculator,
  Clock,
  Globe,
  type LucideIcon,
  MessageSquareText,
  OctagonX,
  ShieldCheck,
} from 'lucide-react'
import { Accent, LandingSection, SectionHeading } from './section-heading'

interface Benefit {
  readonly icon: LucideIcon
  readonly title: string
  readonly body: string
}

const BENEFITS: readonly Benefit[] = [
  {
    icon: ShieldCheck,
    title: 'Nincs dupla számla',
    body: 'Ha kiállítás közben megszakad a kapcsolat, a rendelésszám alapján kideríti, elkészült-e a számla. Nem kell találgatni, és nem kell sztornózni.',
  },
  {
    icon: OctagonX,
    title: 'Nincs kitiltás',
    body: 'Üzleti hibára soha nem küldi újra a kérést, ahogy a Számlázz.hu előírja. Lekérdezést legfeljebb ötször próbál.',
  },
  {
    icon: Calculator,
    title: 'Fillérre pontos összegek',
    body: 'A hivatalos kerekítéssel számol, számlára és nyugtára külön. A 259–264-es kerekítési hibák el sem jutnak a szerverig.',
  },
  {
    icon: Clock,
    title: 'Mindig magyar idő',
    body: 'A dátumokat Europe/Budapest szerint adja, így éjfél után sem csúszik el a kelt, és nincs 352-es hiba.',
  },
  {
    icon: MessageSquareText,
    title: 'Érthető hibaüzenetek',
    body: 'Minden dokumentált hibakódhoz magyar üzenet és javítási tipp tartozik, a hibakategória pedig megmondja, mit tehetsz.',
  },
  {
    icon: Globe,
    title: 'Ott fut, ahol te',
    body: 'Nulla futásidejű függőség. Node.js, Bun, Deno, Cloudflare Workers és Vercel Edge alatt ugyanúgy működik.',
  },
]

export function BenefitsSection() {
  return (
    <LandingSection id="miert">
      <SectionHeading
        id="miert"
        eyebrow="Miért a kassza?"
        title={
          <>
            Ami a nyers API-nál a te dolgod, az itt <Accent>már kész.</Accent>
          </>
        }
      >
        A Számla Agent szigorú: kötött XML-sorrendet, saját kerekítést és magyar időt vár, az
        ismételt próbálkozásért pedig kitiltás jár. A kassza ezt mind elintézi.
      </SectionHeading>
      <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {BENEFITS.map(({ icon: Icon, title, body }) => (
          <li
            key={title}
            className="flex flex-col rounded-[var(--radius-lg)] border border-tint-edge/60 bg-tint p-6 sm:p-7"
          >
            <span className="inline-flex size-10 items-center justify-center rounded-[var(--radius-md)] bg-paper text-accent shadow-hairline">
              <Icon className="size-5" aria-hidden="true" strokeWidth={1.8} />
            </span>
            <h3 className="mt-5 text-[1.05rem] font-semibold text-ink">{title}</h3>
            <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-2">{body}</p>
          </li>
        ))}
      </ul>
    </LandingSection>
  )
}
