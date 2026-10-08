'use client'

import { ArrowRight } from 'lucide-react'
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react'
import { type ReactNode, useRef } from 'react'
import { LandingContainer } from './landing-container'
import { Reveal } from './reveal'
import { SectionTitle } from './section-title'

const SPRING = { stiffness: 90, damping: 26, mass: 0.5 }

function Pane({ label, meta, children }: { label: string; meta: string; children: ReactNode }) {
  return (
    <figure className="proof-pane">
      <figcaption className="proof-pane-head">
        <span className="font-semibold text-ink">{label}</span>
        <span className="tnum font-mono text-[0.75rem] text-muted">{meta}</span>
      </figcaption>
      <div className="proof-pane-body">{children}</div>
    </figure>
  )
}

export function ProofSection({
  ts,
  xml,
  tsLines,
  xmlLines,
}: {
  ts: ReactNode
  xml: ReactNode
  tsLines: number
  xmlLines: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const progress = useSpring(scrollYProgress, SPRING)
  const xmlShift = useTransform(progress, [0, 1], ['0%', '-38%'])
  const tsShift = useTransform(progress, [0, 1], ['4%', '-4%'])

  return (
    <section aria-labelledby="hogyan" className="proof-section py-20 sm:py-28">
      <LandingContainer>
        <SectionTitle id="hogyan" title={<>Te ennyit írsz. A többit a kassza.</>}>
          Egy típusos objektumot adsz át. Ebből épül fel a Számla Agent XML kötött sorrendben,
          hivatalos kerekítéssel, és ez megy el a Számlázz.hu-nak.
        </SectionTitle>

        <div ref={ref} className="proof-grid mt-16 sm:mt-20">
          <Reveal>
            <motion.div style={reduce ? undefined : { y: tsShift }}>
              <Pane label="Amit te írsz" meta={`${tsLines} sor TypeScript`}>
                {ts}
              </Pane>
            </motion.div>
          </Reveal>
          <Reveal delay={0.1} className="proof-arrow-wrap">
            <span className="proof-arrow">
              <ArrowRight className="size-5" aria-hidden="true" />
            </span>
          </Reveal>
          <Reveal delay={0.2}>
            <Pane label="Amit a Számlázz.hu kap" meta={`${xmlLines} sor XML`}>
              <div className="proof-window">
                <motion.div style={reduce ? undefined : { y: xmlShift }}>{xml}</motion.div>
              </div>
            </Pane>
          </Reveal>
        </div>
      </LandingContainer>
    </section>
  )
}
