import type { CSSProperties } from 'react'
import { cn } from '@/lib/cn'
import { InView } from './in-view'

interface PackageCoverage {
  readonly name: string
  readonly operations: number
  readonly highlight?: boolean
}

const OTHER_PACKAGES: readonly PackageCoverage[] = [
  { name: 'szamlazz.js', operations: 3 },
  { name: '@ribbery009/szamlazz-ts', operations: 3 },
  { name: '@halftome/szamlazz-client', operations: 3 },
  { name: 'szamlazz.ts', operations: 3 },
  { name: 'szamlazzhu-client', operations: 2 },
]

export function CoverageBars({ total }: { total: number }) {
  const rows: readonly PackageCoverage[] = [
    { name: 'kassza', operations: total, highlight: true },
    ...OTHER_PACKAGES,
  ]
  return (
    <InView className="mt-10 w-full max-w-[30rem]">
      <figure className="m-0">
        <figcaption className="text-sm font-semibold text-ink">
          Számla Agent műveletek, {total}-ből
        </figcaption>
        <ul className="mt-4 flex flex-col gap-3">
          {rows.map((row, index) => (
            <li key={row.name}>
              <div className="flex items-baseline justify-between gap-4 font-mono text-[0.8rem]">
                <span
                  className={cn(
                    'truncate',
                    row.highlight ? 'font-semibold text-ink' : 'text-ink-2',
                  )}
                >
                  {row.name}
                </span>
                <span
                  className={cn(
                    'tnum shrink-0',
                    row.highlight ? 'font-semibold text-accent' : 'text-muted',
                  )}
                >
                  {row.operations}/{total}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={cn(
                    'motion-bar h-full rounded-full',
                    row.highlight ? 'bg-accent' : 'bg-rule-strong',
                  )}
                  style={
                    {
                      width: `${(row.operations / total) * 100}%`,
                      '--step': index,
                    } as CSSProperties
                  }
                />
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs leading-relaxed text-muted">
          A publikált csomagok kódjában ellenőrizve, 2026 szeptemberében: melyik Agent műveletet
          küldik valóban.
        </p>
      </figure>
    </InView>
  )
}
