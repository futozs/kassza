import { logoGradients, logoPaths } from '@/lib/brand'

export function LogoArt() {
  return (
    <g>
      <defs>
        <linearGradient id="km-tile" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={logoGradients.tile[0]} />
          <stop offset="1" stopColor={logoGradients.tile[1]} />
        </linearGradient>
        <linearGradient id="km-rim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity={logoGradients.rim} />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.08" />
        </linearGradient>
        <linearGradient id="km-stem" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={logoGradients.stem[0]} />
          <stop offset="1" stopColor={logoGradients.stem[1]} />
        </linearGradient>
        <linearGradient id="km-chev" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={logoGradients.chevron[0]} />
          <stop offset="1" stopColor={logoGradients.chevron[1]} />
        </linearGradient>
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
    </g>
  )
}
