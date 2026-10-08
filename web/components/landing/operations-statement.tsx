'use client'

import { ArrowRight } from 'lucide-react'
import { type MotionValue, motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import Link from 'next/link'
import { useRef } from 'react'
import { LandingContainer } from './landing-container'
import { Wave } from './wave'

const WORDS = ['Számla', 'Díjbekérő', 'Nyugta', 'Sztornó', 'Befizetés', 'PDF', 'Adószám'] as const
const DIM = 0.14
const WORD_SPREAD = 1.6

function Word({
  progress,
  index,
  total,
  children,
}: {
  progress: MotionValue<number>
  index: number
  total: number
  children: string
}) {
  const start = index / total
  const end = Math.min(1, (index + WORD_SPREAD) / total)
  const opacity = useTransform(progress, [start, end], [DIM, 1])
  const x = useTransform(progress, [start, end], ['-0.12em', '0em'])
  return (
    <motion.span className="ops-word" style={{ opacity, x }}>
      {children}
      <span className="text-amber">.</span>
    </motion.span>
  )
}

export function OperationsStatement({ count }: { count: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const reduce = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.8', 'end 0.55'] })

  return (
    <section aria-labelledby="muveletek" className="ops-section">
      <Wave className="text-brand-deep" />
      <div className="bg-brand-deep pt-10 pb-28 sm:pt-16 lg:pb-36">
        <LandingContainer className="flex flex-col items-center text-center">
          <h2 id="muveletek" className="ops-kicker">
            {count} Számla Agent művelet. Mind.
          </h2>
          <div ref={ref} className="mt-10 flex flex-col items-center">
            {WORDS.map((word, index) =>
              reduce ? (
                <span key={word} className="ops-word">
                  {word}
                  <span className="text-amber">.</span>
                </span>
              ) : (
                <Word key={word} progress={scrollYProgress} index={index} total={WORDS.length}>
                  {word}
                </Word>
              ),
            )}
          </div>
          <p className="mt-12 max-w-[26rem] text-[1.1rem] leading-relaxed text-white/60">
            Mindegyik egyetlen típusos függvényhívás.
          </p>
          <Link href="/docs" className="ops-link group mt-6">
            Mutasd a műveleteket
            <ArrowRight
              className="size-4 transition-transform duration-300 group-hover:translate-x-0.5"
              aria-hidden="true"
            />
          </Link>
        </LandingContainer>
      </div>
      <Wave flip className="text-brand-deep" />
    </section>
  )
}
