'use client'

import { animate, motion, useInView, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { LandingContainer } from './landing-container'
import { EASE_OUT_EXPO, REVEAL_SECONDS } from './reveal'

export interface Stat {
  readonly value: number
  readonly suffix?: string
  readonly label: string
}

const COUNT_SECONDS = 1
const STAGGER_SECONDS = 0.05

function Counter({ stat, index }: { stat: Stat; index: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })
  const reduce = useReducedMotion()

  useEffect(() => {
    const node = ref.current
    if (!node || !inView || reduce) return
    const controls = animate(0, stat.value, {
      duration: COUNT_SECONDS,
      delay: index * STAGGER_SECONDS,
      ease: EASE_OUT_EXPO,
      onUpdate: (latest) => {
        node.textContent = String(Math.round(latest))
      },
    })
    return () => controls.stop()
  }, [inView, reduce, stat.value, index])

  return (
    <motion.li
      className="stat"
      initial={reduce ? false : { opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.6 }}
      transition={{ duration: REVEAL_SECONDS, delay: index * STAGGER_SECONDS, ease: EASE_OUT_EXPO }}
    >
      <span className="stat-value tnum">
        <span ref={ref}>{stat.value}</span>
        {stat.suffix ? <span className="text-muted">{stat.suffix}</span> : null}
      </span>
      <span className="stat-label">{stat.label}</span>
    </motion.li>
  )
}

export function StatsBand({ stats }: { stats: readonly Stat[] }) {
  return (
    <section aria-label="A kassza számokban" className="pb-20 sm:pb-28">
      <LandingContainer>
        <ul className="stats-grid">
          {stats.map((stat, index) => (
            <Counter key={stat.label} stat={stat} index={index} />
          ))}
        </ul>
      </LandingContainer>
    </section>
  )
}
