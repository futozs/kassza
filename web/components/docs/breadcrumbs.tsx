import type { BreadcrumbItem } from 'fumadocs-core/breadcrumb'
import { ChevronRight, House } from 'lucide-react'
import Link from 'next/link'
import { Fragment } from 'react'

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label="Morzsamenü" className="mb-4">
      <ol className="flex flex-wrap items-center gap-y-1 text-[0.8rem]">
        <li>
          <Link
            href="/docs"
            aria-label="Dokumentáció kezdőlap"
            className="inline-flex size-8 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <House className="size-4" aria-hidden="true" />
          </Link>
        </li>
        {items.map((item, position) => {
          const isLast = position === items.length - 1
          return (
            <Fragment key={`${String(item.name)}-${item.url ?? 'group'}`}>
              <li aria-hidden="true" className="px-0.5 text-muted">
                <ChevronRight className="size-3.5" />
              </li>
              <li>
                {isLast ? (
                  <span
                    aria-current="page"
                    className="inline-flex items-center rounded-full bg-accent-soft px-3 py-1.5 font-medium text-accent"
                  >
                    {item.name}
                  </span>
                ) : item.url ? (
                  <Link
                    href={item.url}
                    className="inline-flex items-center rounded-full px-3 py-1.5 text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                  >
                    {item.name}
                  </Link>
                ) : (
                  <span className="inline-flex items-center px-3 py-1.5 text-ink-2">
                    {item.name}
                  </span>
                )}
              </li>
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
