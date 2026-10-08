'use client'

import { ArrowRight } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'
import {
  AgentVisual,
  DuplicateVisual,
  ErrorVisual,
  type FeatureData,
  RoundingVisual,
  TimezoneVisual,
} from './feature-visuals'
import { LandingContainer } from './landing-container'
import { EASE_OUT_EXPO } from './reveal'
import { SectionTitle } from './section-title'

function Tile({
  index,
  title,
  body,
  visual,
  link,
  wide = false,
  className,
}: {
  index: number
  title: string
  body: string
  visual: ReactNode
  link?: { href: string; label: string }
  wide?: boolean
  className?: string
}) {
  const reduce = useReducedMotion()
  return (
    <motion.li
      className={cn('tile', wide && 'tile--wide', className)}
      initial={reduce ? 'show' : 'hidden'}
      whileInView="show"
      viewport={{ once: true, amount: 0.15 }}
      variants={{
        hidden: { opacity: 0, y: 40 },
        show: {
          opacity: 1,
          y: 0,
          transition: { duration: 1, delay: (index % 2) * 0.08, ease: EASE_OUT_EXPO },
        },
      }}
    >
      <div className="tile-visual">{visual}</div>
      <div className="tile-copy">
        <h3 className="tile-title">{title}</h3>
        <p className="mt-2 text-[1rem] leading-relaxed text-pretty text-ink-2">{body}</p>
        {link ? (
          <Link href={link.href} className="tile-link group">
            {link.label}
            <ArrowRight
              className="size-3.5 transition-transform duration-300 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        ) : null}
      </div>
    </motion.li>
  )
}

export function FeaturesSection({ data }: { data: FeatureData }) {
  return (
    <section aria-labelledby="miert" className="py-20 sm:py-28">
      <LandingContainer>
        <SectionTitle
          id="miert"
          title={
            <>
              Ami a nyers API-nál a te dolgod,
              <br className="hidden sm:block" /> az itt már kész.
            </>
          }
        >
          A Számla Agent szigorú: kötött XML-sorrend, saját kerekítés, magyar idő, és kitiltás jár
          az ismételgetésért. A kassza mindezt elintézi helyetted.
        </SectionTitle>

        <ul className="tiles mt-16 sm:mt-20">
          <Tile
            index={0}
            wide
            title="Nincs dupla számla"
            body="Ha kiállítás közben megszakad a kapcsolat, a rendelésszám alapján kideríti, elkészült-e a számla. Nem kell találgatni, és nem kell sztornózni."
            visual={<DuplicateVisual data={data} />}
            link={{ href: '/docs/alapok/pontosan-egyszer', label: 'Pontosan egyszer' }}
          />
          <Tile
            index={1}
            title="Fillérre pontos"
            body="A hivatalos kerekítéssel számol, számlára és nyugtára külön szabállyal."
            visual={<RoundingVisual data={data} />}
          />
          <Tile
            index={2}
            title="Mindig magyar idő"
            body="Europe/Budapest szerint dátumoz, így éjfél után sem csúszik el a kelt."
            visual={<TimezoneVisual />}
          />
          <Tile
            index={3}
            title="Érthető hibák"
            body={`Mind a ${data.errorCount} dokumentált hibakódhoz magyar üzenet és javítási tipp tartozik.`}
            visual={<ErrorVisual data={data} />}
            link={{ href: '/docs/alapok/hibakezeles', label: 'Hibakezelés' }}
          />
          <Tile
            index={4}
            title="AI-ügynököknek is"
            body="Beépített MCP-szerver. Írni csak előnézet és megerősítés után tud, így véletlenül sem állít ki számlát."
            visual={<AgentVisual data={data} />}
            link={{ href: '/docs/kiegeszitok/mcp-szerver', label: 'MCP-szerver' }}
          />
        </ul>
      </LandingContainer>
    </section>
  )
}
