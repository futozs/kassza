'use client'

import { motion, useReducedMotion } from 'motion/react'
import { cn } from '@/lib/cn'
import { LandingContainer } from './landing-container'
import { EASE_OUT_EXPO } from './reveal'
import { SectionTitle } from './section-title'

interface PackageCoverage {
  readonly name: string
  readonly operations: number
}

const OTHER_PACKAGES: readonly PackageCoverage[] = [
  { name: 'szamlazz.js', operations: 3 },
  { name: '@ribbery009/szamlazz-ts', operations: 3 },
  { name: '@halftome/szamlazz-client', operations: 3 },
  { name: 'szamlazz.ts', operations: 3 },
  { name: 'szamlazzhu-client', operations: 2 },
]

function Bar({ row, total, index }: { row: PackageCoverage; total: number; index: number }) {
  const reduce = useReducedMotion()
  const highlight = index === 0
  return (
    <li className={cn('compare-row', highlight && 'compare-row--hero')}>
      <div className="flex items-baseline justify-between gap-4">
        <span
          className={cn('truncate font-mono', highlight ? 'font-semibold text-ink' : 'text-ink-2')}
        >
          {row.name}
        </span>
        <span
          className={cn(
            'tnum shrink-0 font-mono',
            highlight ? 'font-semibold text-accent' : 'text-muted',
          )}
        >
          {row.operations}/{total}
        </span>
      </div>
      <div className="compare-track">
        <motion.div
          className={cn('compare-fill', highlight && 'compare-fill--hero')}
          style={{ width: `${(row.operations / total) * 100}%`, originX: 0 }}
          initial={reduce ? false : { scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, amount: 0.8 }}
          transition={{ duration: 1.3, delay: 0.15 + index * 0.1, ease: EASE_OUT_EXPO }}
        />
      </div>
    </li>
  )
}

export function CompareSection({ total }: { total: number }) {
  const rows: readonly PackageCoverage[] = [
    { name: 'kassza', operations: total },
    ...OTHER_PACKAGES,
  ]
  return (
    <section aria-labelledby="osszevetes" className="py-20 sm:py-28">
      <LandingContainer>
        <SectionTitle
          id="osszevetes"
          title={
            <>
              A többiek 3 műveletet tudnak.
              <br className="hidden sm:block" />{' '}
              <span className="text-accent">A kassza mind a {total}-et.</span>
            </>
          }
        />
        <ul className="compare mt-14 sm:mt-16">
          {rows.map((row, index) => (
            <Bar key={row.name} row={row} total={total} index={index} />
          ))}
        </ul>
        <p className="mx-auto mt-6 max-w-[40rem] text-center text-[0.85rem] leading-relaxed text-muted">
          A publikált npm-csomagok kódjában ellenőrizve, 2026 szeptemberében: melyik Számla Agent
          műveletet küldik valóban.
        </p>
      </LandingContainer>
    </section>
  )
}
