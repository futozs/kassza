import type * as PageTree from 'fumadocs-core/page-tree'
import Link from 'next/link'

function PaginationCard({
  item,
  direction,
}: {
  item: PageTree.Item
  direction: 'previous' | 'next'
}) {
  const isNext = direction === 'next'
  return (
    <Link
      href={item.url}
      rel={isNext ? 'next' : 'prev'}
      className={`group flex min-w-0 flex-col gap-1 rounded-[var(--radius-md)] border border-rule bg-paper-raised px-4 py-3.5 transition-[border-color,box-shadow] duration-200 ease-out hover:border-accent hover:shadow-[var(--shadow-whisper)] ${isNext ? 'items-end text-right sm:col-start-2' : 'items-start'}`}
    >
      <span className="text-[0.8rem] text-muted">{isNext ? 'Következő oldal' : 'Előző oldal'}</span>
      <span className="max-w-full truncate font-semibold text-accent">
        {isNext ? (
          <>
            {item.name} <span aria-hidden="true">»</span>
          </>
        ) : (
          <>
            <span aria-hidden="true">«</span> {item.name}
          </>
        )}
      </span>
    </Link>
  )
}

export function Pagination({
  previous,
  next,
}: {
  previous?: PageTree.Item | undefined
  next?: PageTree.Item | undefined
}) {
  if (!previous && !next) return null
  return (
    <nav aria-label="Lapozás a dokumentációban" className="mt-8 grid gap-4 sm:grid-cols-2">
      {previous ? <PaginationCard item={previous} direction="previous" /> : null}
      {next ? <PaginationCard item={next} direction="next" /> : null}
    </nav>
  )
}
