import { Arrow, svgFont, svgTone } from './svg-parts'

const AXIS_Y = 132
const STORE_BOTTOM = 42
const BREAK_START = 214
const BREAK_END = 262

const REQUESTS = [
  { x: 24, writes: true },
  { x: 104, writes: false },
  { x: 164, writes: false },
  { x: 304, writes: true },
] as const

function Caption({
  x,
  y,
  children,
  anchor = 'middle',
  tone = svgTone.ink2,
}: {
  x: number
  y: number
  children: string
  anchor?: 'start' | 'middle' | 'end'
  tone?: string
}) {
  return (
    <text x={x} y={y} textAnchor={anchor} fill={tone} fontSize={12.5} fontFamily={svgFont.sans}>
      {children}
    </text>
  )
}

export function SessionFigure() {
  return (
    <svg
      viewBox="0 0 380 180"
      role="img"
      aria-labelledby="session-figure-title session-figure-desc"
      className="h-auto w-full"
    >
      <title id="session-figure-title">Session cookie újrahasznosítása</title>
      <desc id="session-figure-desc">
        Az első kérés új sessiont nyit, a kassza a cookie-t eltárolja memóriában, Redisben vagy
        Cloudflare KV-ben. A következő kérések visszaküldik, így nincs új hitelesítés. 90 perc
        tétlenség után a Számlázz.hu törli a sessiont, ekkor a következő kérés újat nyit.
      </desc>

      <rect
        x={0.5}
        y={8}
        width={379}
        height={STORE_BOTTOM - 8}
        rx={8}
        fill={svgTone.surface}
        stroke={svgTone.ruleStrong}
      />
      <text x={12} y={30} fill={svgTone.ink2} fontSize={12.5} fontFamily={svgFont.sans}>
        <tspan fontFamily={svgFont.mono} fill={svgTone.ink} fontWeight={600}>
          cookieStore
        </tspan>
        <tspan> memóriában, Redisben vagy KV-ben</tspan>
      </text>

      {REQUESTS.map((request) =>
        request.writes ? (
          <Arrow
            key={request.x}
            x1={request.x}
            y1={AXIS_Y - 8}
            x2={request.x}
            y2={STORE_BOTTOM + 2}
            color={svgTone.amber}
            dashed
          />
        ) : (
          <Arrow
            key={request.x}
            x1={request.x}
            y1={STORE_BOTTOM + 2}
            x2={request.x}
            y2={AXIS_Y - 8}
            color={svgTone.accent}
            dashed
          />
        ),
      )}

      <line
        x1={0}
        y1={AXIS_Y}
        x2={BREAK_START}
        y2={AXIS_Y}
        stroke={svgTone.ruleStrong}
        strokeWidth={1.5}
      />
      <line
        x1={BREAK_END}
        y1={AXIS_Y}
        x2={380}
        y2={AXIS_Y}
        stroke={svgTone.ruleStrong}
        strokeWidth={1.5}
      />
      <path
        d={`M${BREAK_START - 4} ${AXIS_Y + 7} L${BREAK_START + 4} ${AXIS_Y - 7} M${BREAK_END - 4} ${AXIS_Y + 7} L${BREAK_END + 4} ${AXIS_Y - 7}`}
        stroke={svgTone.ruleStrong}
        strokeWidth={1.5}
      />
      <Caption x={(BREAK_START + BREAK_END) / 2} y={AXIS_Y - 14} tone={svgTone.muted}>
        90 perc tétlenség
      </Caption>

      {REQUESTS.map((request) => (
        <circle
          key={request.x}
          cx={request.x}
          cy={AXIS_Y}
          r={6}
          fill={svgTone.paper}
          stroke={svgTone.ink2}
          strokeWidth={1.5}
        />
      ))}

      <Caption x={8} y={AXIS_Y + 26} anchor="start">
        1. kérés
      </Caption>
      <Caption x={8} y={AXIS_Y + 42} anchor="start" tone={svgTone.muted}>
        új session
      </Caption>
      <Caption x={134} y={AXIS_Y + 26}>
        cookie visszaküldve
      </Caption>
      <Caption x={134} y={AXIS_Y + 42} tone={svgTone.muted}>
        nincs új hitelesítés
      </Caption>
      <Caption x={304} y={AXIS_Y + 26}>
        lejárt: új session
      </Caption>
      <Caption x={304} y={AXIS_Y + 42} tone={svgTone.muted}>
        a kassza intézi
      </Caption>
    </svg>
  )
}
