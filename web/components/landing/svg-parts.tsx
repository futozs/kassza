export const svgFont = {
  mono: 'var(--ff-mono), ui-monospace, monospace',
  sans: 'var(--ff-sans), ui-sans-serif, sans-serif',
  display: 'var(--ff-display), ui-sans-serif, sans-serif',
} as const

export const svgTone = {
  ink: 'var(--ink)',
  ink2: 'var(--ink-2)',
  muted: 'var(--muted)',
  rule: 'var(--rule)',
  ruleStrong: 'var(--rule-strong)',
  paper: 'var(--paper-raised)',
  surface: 'var(--surface)',
  surface2: 'var(--surface-2)',
  accent: 'var(--accent)',
  accentSoft: 'var(--accent-soft)',
  amber: 'var(--amber)',
  amberSoft: 'var(--amber-soft)',
  danger: 'var(--danger-ink)',
  dangerSoft: 'var(--danger-bg)',
  success: 'var(--tip-ink)',
  successSoft: 'var(--tip-bg)',
  receipt: 'var(--receipt)',
} as const

const HEAD_LENGTH = 9
const HEAD_HALF_WIDTH = 4.5

export function Arrow({
  x1,
  y1,
  x2,
  y2,
  color = svgTone.muted,
  dashed = false,
  width = 1.5,
}: {
  x1: number
  y1: number
  x2: number
  y2: number
  color?: string
  dashed?: boolean
  width?: number
}) {
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const baseX = x2 - HEAD_LENGTH * cos
  const baseY = y2 - HEAD_LENGTH * sin
  const head = [
    `${x2},${y2}`,
    `${baseX - HEAD_HALF_WIDTH * sin},${baseY + HEAD_HALF_WIDTH * cos}`,
    `${baseX + HEAD_HALF_WIDTH * sin},${baseY - HEAD_HALF_WIDTH * cos}`,
  ].join(' ')
  return (
    <g>
      <line
        x1={x1}
        y1={y1}
        x2={baseX}
        y2={baseY}
        stroke={color}
        strokeWidth={width}
        strokeDasharray={dashed ? '5 5' : undefined}
        strokeLinecap="round"
      />
      <polygon points={head} fill={color} />
    </g>
  )
}

export function CheckMark({
  x,
  y,
  size = 12,
  color = svgTone.accent,
}: {
  x: number
  y: number
  size?: number
  color?: string
}) {
  const s = size / 12
  return (
    <path
      d={`M${x} ${y + 6.5 * s} L${x + 4.2 * s} ${y + 10.5 * s} L${x + 12 * s} ${y + 1.5 * s}`}
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
}

export function CrossMark({
  cx,
  cy,
  size = 10,
  color = svgTone.danger,
}: {
  cx: number
  cy: number
  size?: number
  color?: string
}) {
  const h = size / 2
  return (
    <path
      d={`M${cx - h} ${cy - h} L${cx + h} ${cy + h} M${cx + h} ${cy - h} L${cx - h} ${cy + h}`}
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
    />
  )
}

export function StatusDot({
  cx,
  cy,
  status,
  r = 15,
}: {
  cx: number
  cy: number
  status: 'fail' | 'ok'
  r?: number
}) {
  const fail = status === 'fail'
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={fail ? svgTone.dangerSoft : svgTone.successSoft}
        stroke={fail ? svgTone.danger : svgTone.success}
        strokeWidth={1.5}
      />
      {fail ? (
        <CrossMark cx={cx} cy={cy} size={r * 0.6} />
      ) : (
        <CheckMark x={cx - r * 0.42} y={cy - r * 0.38} size={r * 0.84} color={svgTone.success} />
      )}
    </g>
  )
}

const TOOTH = 3.5

export function ReceiptGlyph({
  x,
  y,
  width = 30,
  height = 38,
}: {
  x: number
  y: number
  width?: number
  height?: number
}) {
  const teeth = Math.max(2, Math.round(width / (TOOTH * 2)))
  const step = width / teeth
  let edge = ''
  for (let index = teeth; index > 0; index--) {
    const right = x + index * step
    edge += ` L${right - step / 2} ${y + height - TOOTH} L${right - step} ${y + height}`
  }
  const d = `M${x} ${y} H${x + width} V${y + height}${edge} Z`
  return (
    <g>
      <path
        d={d}
        fill={svgTone.receipt}
        stroke={svgTone.ruleStrong}
        strokeWidth={1}
        strokeLinejoin="round"
      />
      <line
        x1={x + 5}
        y1={y + 8}
        x2={x + width - 5}
        y2={y + 8}
        stroke={svgTone.ruleStrong}
        strokeWidth={1.5}
      />
      <line
        x1={x + 5}
        y1={y + 14}
        x2={x + width - 9}
        y2={y + 14}
        stroke={svgTone.ruleStrong}
        strokeWidth={1.5}
      />
      <line
        x1={x + 5}
        y1={y + 20}
        x2={x + width - 7}
        y2={y + 20}
        stroke={svgTone.ruleStrong}
        strokeWidth={1.5}
      />
      <rect
        x={x + width - 14}
        y={y + height - 13}
        width={9}
        height={3}
        rx={1.5}
        fill={svgTone.amber}
      />
    </g>
  )
}

export function EnvelopeGlyph({
  x,
  y,
  width = 30,
  height = 21,
}: {
  x: number
  y: number
  width?: number
  height?: number
}) {
  return (
    <g fill="none" stroke={svgTone.ink2} strokeWidth={1.5} strokeLinejoin="round">
      <rect x={x} y={y} width={width} height={height} rx={3} fill={svgTone.paper} />
      <path
        d={`M${x + 1.5} ${y + 2.5} L${x + width / 2} ${y + height * 0.58} L${x + width - 1.5} ${y + 2.5}`}
      />
    </g>
  )
}

export function BracesGlyph({ x, y, size = 22 }: { x: number; y: number; size?: number }) {
  const s = size / 22
  return (
    <g
      fill="none"
      stroke={svgTone.ink2}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d={`M${x + 7 * s} ${y} C${x + 3 * s} ${y} ${x + 4 * s} ${y + 8 * s} ${x} ${y + 11 * s} C${x + 4 * s} ${y + 14 * s} ${x + 3 * s} ${y + 22 * s} ${x + 7 * s} ${y + 22 * s}`}
      />
      <path
        d={`M${x + 17 * s} ${y} C${x + 21 * s} ${y} ${x + 20 * s} ${y + 8 * s} ${x + 24 * s} ${y + 11 * s} C${x + 20 * s} ${y + 14 * s} ${x + 21 * s} ${y + 22 * s} ${x + 17 * s} ${y + 22 * s}`}
      />
    </g>
  )
}
