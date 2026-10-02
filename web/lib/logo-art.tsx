import { logoGradients, logoPaths } from '@/lib/brand'

function Gradient({
  id,
  stops,
  diagonal,
}: {
  id: string
  stops: readonly string[]
  diagonal?: boolean
}) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2={diagonal ? '1' : '0'} y2="1">
      <stop offset="0" stopColor={stops[0]} />
      <stop offset="1" stopColor={stops[1]} />
    </linearGradient>
  )
}

export function LogoArt() {
  return (
    <>
      <defs>
        <Gradient id="km-tile" stops={logoGradients.tile} />
        <linearGradient id="km-rim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity={logoGradients.rim} />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.08" />
        </linearGradient>
        <Gradient id="km-stem" stops={logoGradients.stem} />
        <Gradient id="km-chev" stops={logoGradients.chevron} diagonal />
        <filter
          id="km-shadow"
          x="-25%"
          y="-20%"
          width="150%"
          height="160%"
          colorInterpolationFilters="sRGB"
        >
          <feDropShadow
            dx="0"
            dy="10"
            stdDeviation="9"
            floodColor="#000000"
            floodOpacity={logoGradients.shadow}
          />
        </filter>
      </defs>
      <rect width="512" height="512" rx="112" fill="url(#km-tile)" />
      <rect
        x="1.5"
        y="1.5"
        width="509"
        height="509"
        rx="110.5"
        fill="none"
        stroke="url(#km-rim)"
        strokeWidth="3"
      />
      <g filter="url(#km-shadow)">
        <path d={logoPaths.stem} fill="url(#km-stem)" />
        <path d={logoPaths.chevron} fill="url(#km-chev)" />
      </g>
    </>
  )
}
