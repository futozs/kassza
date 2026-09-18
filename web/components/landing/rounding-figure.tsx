import type { RoundingSample } from './sample-invoice'
import { svgFont, svgTone } from './svg-parts'

const BAR_WIDTH = 220
const BAR_HEIGHT = 24
const RULER_START_X = 24
const RULER_STEP = 73
const RULER_SPAN = 2
const RULER_BASELINE = 292
const WIDTH = 340

const forint = new Intl.NumberFormat('hu-HU', { maximumFractionDigits: 0 })

function ft(value: number): string {
  return `${forint.format(value)} Ft`
}

function Bar({ y, net, vat }: { y: number; net: number; vat: number }) {
  const netWidth = (BAR_WIDTH * net) / (net + vat)
  return (
    <g>
      <rect
        x={0}
        y={y}
        width={netWidth}
        height={BAR_HEIGHT}
        rx={4}
        fill={svgTone.surface2}
        stroke={svgTone.ruleStrong}
      />
      <rect
        x={netWidth}
        y={y}
        width={BAR_WIDTH - netWidth}
        height={BAR_HEIGHT}
        rx={4}
        fill={svgTone.amberSoft}
        stroke={svgTone.amber}
      />
      <text x={8} y={y + 16.5} fill={svgTone.ink2} fontSize={11.5} fontFamily={svgFont.sans}>
        nettó
      </text>
      <text
        x={netWidth + 8}
        y={y + 16.5}
        fill={svgTone.ink2}
        fontSize={11.5}
        fontFamily={svgFont.sans}
      >
        áfa
      </text>
    </g>
  )
}

function Row({
  y,
  label,
  net,
  vat,
  tone,
}: {
  y: number
  label: string
  net: number
  vat: number
  tone: string
}) {
  return (
    <g>
      <text x={0} y={y} fill={svgTone.ink2} fontSize={13.5} fontFamily={svgFont.sans}>
        {label}
      </text>
      <Bar y={y + 10} net={net} vat={vat} />
      <text
        x={WIDTH}
        y={y + 27}
        textAnchor="end"
        fill={tone}
        fontSize={14.5}
        fontWeight={700}
        fontFamily={svgFont.mono}
      >
        {ft(net + vat)}
      </text>
      <text x={0} y={y + 54} fill={svgTone.muted} fontSize={12.5} fontFamily={svgFont.mono}>
        {`${forint.format(net)} + ${forint.format(vat)}`}
      </text>
    </g>
  )
}

function Marker({ x, tone }: { x: number; tone: string }) {
  return <path d={`M${x - 7} 250 H${x + 7} L${x} 262 Z`} fill={tone} />
}

export function RoundingFigure({ sample }: { sample: RoundingSample }) {
  const first = sample.gross - RULER_SPAN
  const xOf = (value: number) => RULER_START_X + (value - first) * RULER_STEP
  const ticks = Array.from({ length: RULER_SPAN * 2 + 1 }, (_, index) => first + index)
  const target = xOf(sample.gross)
  const naive = xOf(sample.naiveGross)
  const difference = sample.naiveGross - sample.gross

  return (
    <svg
      viewBox={`0 0 ${WIDTH} 322`}
      role="img"
      aria-labelledby="rounding-figure-title rounding-figure-desc"
      className="h-auto w-full"
    >
      <title id="rounding-figure-title">
        {`${sample.quantity} × ${ft(sample.unitPrice)} bruttó, ${sample.vat}% áfa: ${ft(sample.naiveGross)} kézzel, ${ft(sample.gross)} a kasszával`}
      </title>
      <desc id="rounding-figure-desc">
        {`Ha a nettót a bruttóból számolod vissza és abból az áfát, ${ft(sample.naiveNet)} nettó és ${ft(sample.naiveVat)} áfa jön ki, összesen ${ft(sample.naiveGross)}. A hivatalos bruttó alapú kerekítéssel az áfa ${ft(sample.vatAmount)}, a nettó ${ft(sample.net)}, összesen ${ft(sample.gross)}, pontosan annyi, amennyit a vevő fizet.`}
      </desc>

      <Row
        y={18}
        label="Nettóból visszaszámolva"
        net={sample.naiveNet}
        vat={sample.naiveVat}
        tone={svgTone.danger}
      />
      <Row
        y={108}
        label="Bruttó alapú, hivatalos szabály"
        net={sample.net}
        vat={sample.vatAmount}
        tone={svgTone.accent}
      />

      <line x1={0} y1={190} x2={WIDTH} y2={190} stroke={svgTone.rule} />
      <text x={0} y={212} fill={svgTone.muted} fontSize={12} fontFamily={svgFont.sans}>
        a bruttó vége, nagyítva
      </text>

      <line
        x1={target}
        y1={226}
        x2={target}
        y2={RULER_BASELINE}
        stroke={svgTone.ink2}
        strokeDasharray="4 4"
      />
      <path
        d={`M${target} 236 H${naive} M${target} 231 V241 M${naive} 231 V241`}
        stroke={svgTone.danger}
        strokeWidth={1.5}
      />
      <text
        x={(target + naive) / 2}
        y={229}
        textAnchor="middle"
        fill={svgTone.danger}
        fontSize={12}
        fontWeight={600}
        fontFamily={svgFont.mono}
      >
        {`+${difference} Ft`}
      </text>

      <Marker x={target} tone={svgTone.accent} />
      <text
        x={target - 12}
        y={260}
        textAnchor="end"
        fill={svgTone.accent}
        fontSize={12}
        fontWeight={600}
        fontFamily={svgFont.mono}
      >
        kassza
      </text>
      <Marker x={naive} tone={svgTone.danger} />
      <text
        x={naive + 12}
        y={260}
        fill={svgTone.danger}
        fontSize={12}
        fontWeight={600}
        fontFamily={svgFont.mono}
      >
        kézi
      </text>

      <line
        x1={0}
        y1={RULER_BASELINE}
        x2={WIDTH}
        y2={RULER_BASELINE}
        stroke={svgTone.ruleStrong}
        strokeWidth={1.5}
      />
      {ticks.map((value) => (
        <g key={value}>
          <line
            x1={xOf(value)}
            y1={RULER_BASELINE}
            x2={xOf(value)}
            y2={RULER_BASELINE - 10}
            stroke={svgTone.ruleStrong}
            strokeWidth={1.5}
          />
          <line
            x1={xOf(value) + RULER_STEP / 2}
            y1={RULER_BASELINE}
            x2={xOf(value) + RULER_STEP / 2}
            y2={RULER_BASELINE - 5}
            stroke={svgTone.rule}
            strokeWidth={1}
            opacity={value === ticks.at(-1) ? 0 : 1}
          />
          <text
            x={xOf(value)}
            y={RULER_BASELINE + 18}
            textAnchor="middle"
            fill={value === sample.gross ? svgTone.ink : svgTone.muted}
            fontSize={12}
            fontWeight={value === sample.gross ? 600 : 400}
            fontFamily={svgFont.mono}
          >
            {forint.format(value)}
          </text>
        </g>
      ))}
    </svg>
  )
}
