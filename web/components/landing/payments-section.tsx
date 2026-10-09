'use client'

import { ArrowRight, FileText, Receipt } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { LogoMark } from '@/components/site/logo'
import { LandingContainer } from './landing-container'
import { EASE_OUT_EXPO } from './reveal'
import { SectionTitle } from './section-title'

const PROVIDERS = ['Stripe', 'SimplePay', 'Barion', 'Revolut', 'PayPal'] as const
const VIEW_W = 1000
const VIEW_H = 400
const LEFT_X = 210
const HUB_X = 500
const RIGHT_X = 790
const HUB_Y = VIEW_H / 2
const OUTPUT_Y = [150, 250] as const

function rowY(index: number, count: number): number {
  const gap = VIEW_H / count
  return gap / 2 + gap * index
}

function inPath(y: number): string {
  return `M${LEFT_X} ${y} C ${LEFT_X + 160} ${y}, ${HUB_X - 160} ${HUB_Y}, ${HUB_X - 46} ${HUB_Y}`
}

function outPath(y: number): string {
  return `M${HUB_X + 46} ${HUB_Y} C ${HUB_X + 150} ${HUB_Y}, ${RIGHT_X - 150} ${y}, ${RIGHT_X} ${y}`
}

function Beam({ d, delay }: { d: string; delay: number }) {
  const reduce = useReducedMotion()
  const draw = {
    initial: reduce ? false : ({ pathLength: 0, opacity: 0 } as const),
    whileInView: { pathLength: 1, opacity: 1 },
    viewport: { once: true, amount: 0.4 },
    transition: { duration: 0.8, delay, ease: EASE_OUT_EXPO },
  }
  return (
    <g>
      <path d={d} className="beam-track" />
      <motion.path d={d} className="beam-line" {...draw} />
    </g>
  )
}

function Node({
  x,
  y,
  delay,
  children,
}: {
  x: number
  y: number
  delay: number
  children: ReactNode
}) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      className="flow-node"
      style={{ left: `${(x / VIEW_W) * 100}%`, top: `${(y / VIEW_H) * 100}%` }}
      initial={reduce ? false : { opacity: 0, scale: 0.6 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, amount: 0.4 }}
      transition={{ type: 'spring', stiffness: 260, damping: 20, delay }}
    >
      {children}
    </motion.div>
  )
}

export function PaymentsSection() {
  return (
    <section aria-labelledby="fizetesek" className="py-20 sm:py-28">
      <LandingContainer>
        <SectionTitle id="fizetesek" title={<>Fizetés után a számla magától elkészül.</>}>
          Kész webhook-kezelő öt fizetési szolgáltatóhoz, aláírás-ellenőrzéssel. Ha a szolgáltató
          újraküldi az értesítést, akkor sem lesz két számla.
        </SectionTitle>

        <div
          className="flow mt-14 sm:mt-20"
          role="img"
          aria-label="Stripe, SimplePay, Barion, Revolut és PayPal fizetésből a kassza számlát vagy nyugtát állít ki"
        >
          <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="flow-svg" aria-hidden="true">
            {PROVIDERS.map((provider, index) => (
              <Beam
                key={provider}
                d={inPath(rowY(index, PROVIDERS.length))}
                delay={0.1 + index * 0.06}
              />
            ))}
            {OUTPUT_Y.map((y, index) => (
              <Beam key={y} d={outPath(y)} delay={0.6 + index * 0.08} />
            ))}
          </svg>
          {PROVIDERS.map((provider, index) => (
            <Node key={provider} x={LEFT_X} y={rowY(index, PROVIDERS.length)} delay={index * 0.05}>
              <span className="flow-pill flow-pill--in">{provider}</span>
            </Node>
          ))}
          <Node x={HUB_X} y={HUB_Y} delay={0.5}>
            <span className="flow-hub">
              <LogoMark className="size-14 drop-shadow-none sm:size-16" />
            </span>
          </Node>
          <Node x={RIGHT_X} y={OUTPUT_Y[0]} delay={0.95}>
            <span className="flow-pill flow-pill--out">
              <FileText className="size-4 text-accent" />
              Számla
            </span>
          </Node>
          <Node x={RIGHT_X} y={OUTPUT_Y[1]} delay={1.03}>
            <span className="flow-pill flow-pill--out">
              <Receipt className="size-4 text-accent" />
              Nyugta
            </span>
          </Node>
        </div>

        <div className="mt-12 flex justify-center">
          <Link href="/docs/fizetesek" className="pill-button pill-button--secondary group">
            Fizetési integrációk
            <ArrowRight
              className="size-4 transition-transform duration-300 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </div>
      </LandingContainer>
    </section>
  )
}
