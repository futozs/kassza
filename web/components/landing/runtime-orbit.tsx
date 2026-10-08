'use client'

import { type MotionValue, motion, useScroll, useSpring, useTransform } from 'motion/react'
import { type CSSProperties, useRef } from 'react'
import { LandingContainer } from './landing-container'

interface OrbitRing {
  readonly radius: number
  readonly turn: number
  readonly offset: number
  readonly items: readonly string[]
}

const RINGS: readonly OrbitRing[] = [
  { radius: 0.56, turn: 70, offset: -90, items: ['Node.js', 'Bun', 'Deno'] },
  {
    radius: 0.96,
    turn: -45,
    offset: -60,
    items: ['Cloudflare Workers', 'Vercel Edge', 'Next.js', 'Hono', 'Express', 'Nuxt'],
  },
]

const OUTER_MIN = 0.8
const OUTER_ITEMS = RINGS.filter((ring) => ring.radius > OUTER_MIN).flatMap((ring) => ring.items)

const SPRING = { stiffness: 80, damping: 24, mass: 0.6 }

function placement(ring: OrbitRing, index: number): CSSProperties {
  const angle = ((ring.offset + (360 / ring.items.length) * index) * Math.PI) / 180
  const left = 50 + 50 * ring.radius * Math.cos(angle)
  const top = 50 + 50 * ring.radius * Math.sin(angle)
  return { left: `${left.toFixed(2)}%`, top: `${top.toFixed(2)}%` }
}

function Ring({ ring, progress }: { ring: OrbitRing; progress: MotionValue<number> }) {
  const rotate = useTransform(progress, [0, 1], [0, ring.turn])
  const counter = useTransform(rotate, (value) => -value)
  return (
    <motion.div
      className={ring.radius > OUTER_MIN ? 'orbit-ring orbit-ring--outer' : 'orbit-ring'}
      style={{ rotate }}
    >
      <span
        className="orbit-track"
        style={{ inset: `${50 - 50 * ring.radius}%` } as CSSProperties}
        aria-hidden="true"
      />
      {ring.items.map((item, index) => (
        <motion.span
          key={item}
          className="orbit-item"
          style={{ ...placement(ring, index), rotate: counter }}
        >
          <span className="orbit-dot" aria-hidden="true" />
          {item}
        </motion.span>
      ))}
    </motion.div>
  )
}

export function RuntimeOrbit() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] })
  const progress = useSpring(scrollYProgress, SPRING)
  const scale = useTransform(progress, [0, 0.45], [0.86, 1])

  return (
    <section aria-labelledby="mindenhol" className="py-20 sm:py-28">
      <LandingContainer className="flex flex-col items-center">
        <motion.div ref={ref} className="orbit" style={{ scale }}>
          {RINGS.map((ring) => (
            <Ring key={ring.radius} ring={ring} progress={progress} />
          ))}
          <div className="orbit-center">
            <h2 id="mindenhol" className="flex flex-col items-center">
              <span className="orbit-zero">0</span>
              <span className="orbit-title">függőség.</span>
            </h2>
            <p className="orbit-sub">Ugyanaz a kód fut mindenhol.</p>
          </div>
        </motion.div>
        <ul className="orbit-list">
          {OUTER_ITEMS.map((item) => (
            <li key={item} className="orbit-item">
              <span className="orbit-dot" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </LandingContainer>
    </section>
  )
}
