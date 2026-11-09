import Image from 'next/image'
import Link from 'next/link'
import type { CSSProperties } from 'react'

const BADGE_SRC = '/hivatalos-szamlazz-plugin.svg'
const BADGE_RATIO = 135 / 151
export const OFFICIAL_BADGE_LABEL = 'Hivatalos Számlázz.hu plugin'

export function OfficialBadge({
  height,
  className = '',
  style,
}: {
  height: number
  className?: string
  style?: CSSProperties
}) {
  return (
    <Link
      href="/docs/alapok/mi-a-kassza#hivatalos-plugin"
      title={OFFICIAL_BADGE_LABEL}
      className={`inline-block rounded-lg drop-shadow-[0_10px_22px_rgba(217,81,32,0.16)] transition-transform duration-300 ease-out focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent motion-safe:hover:-translate-y-0.5 ${className}`}
      style={style}
    >
      <Image
        src={BADGE_SRC}
        alt={OFFICIAL_BADGE_LABEL}
        width={Math.round(height * BADGE_RATIO)}
        height={height}
        unoptimized
      />
    </Link>
  )
}
