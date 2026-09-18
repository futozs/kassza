import { svgFont, svgTone } from './svg-parts'

const SOURCES = [
  { label: 'HTTP fejléc', raw: 'szlahu_error_code: 57' },
  { label: 'XML válasz', raw: '<hibakod>57</hibakod>' },
  { label: 'szöveges válasz', raw: '[ERR] 57 XML beolvasási…' },
] as const

const ROW_GAP = 74
const BOX_WIDTH = 206
const BOX_HEIGHT = 32
const TARGET_X = 262
const TARGET_Y = 94
const TARGET_HEIGHT = 48

export function ErrorFigure() {
  const targetMiddle = TARGET_Y + TARGET_HEIGHT / 2
  return (
    <svg
      viewBox="0 0 380 214"
      role="img"
      aria-labelledby="error-figure-title error-figure-desc"
      className="h-auto w-full"
    >
      <title id="error-figure-title">Három hibaformátum, egy SzamlazzError</title>
      <desc id="error-figure-desc">
        A Számla Agent a hibát HTTP fejlécben (szlahu_error_code), XML válaszban (hibakod elem) vagy
        [ERR] kezdetű szövegben adja vissza. A kassza mindhármat ugyanarra a SzamlazzError típusra
        alakítja.
      </desc>
      {SOURCES.map((source, index) => {
        const top = 24 + index * ROW_GAP
        const middle = top + BOX_HEIGHT / 2
        return (
          <g key={source.label}>
            <text x={0} y={top - 8} fill={svgTone.muted} fontSize={12.5} fontFamily={svgFont.sans}>
              {source.label}
            </text>
            <rect
              x={0}
              y={top}
              width={BOX_WIDTH}
              height={BOX_HEIGHT}
              rx={6}
              fill={svgTone.paper}
              stroke={svgTone.ruleStrong}
            />
            <text x={12} y={top + 21} fill={svgTone.ink2} fontSize={12.5} fontFamily={svgFont.mono}>
              {source.raw}
            </text>
            <path
              d={`M${BOX_WIDTH} ${middle} C${BOX_WIDTH + 30} ${middle} ${TARGET_X - 30} ${targetMiddle} ${TARGET_X - 8} ${targetMiddle}`}
              fill="none"
              stroke={svgTone.muted}
              strokeWidth={1.5}
            />
          </g>
        )
      })}
      <polygon
        points={`${TARGET_X},${targetMiddle} ${TARGET_X - 9},${targetMiddle - 4.5} ${TARGET_X - 9},${targetMiddle + 4.5}`}
        fill={svgTone.muted}
      />
      <rect
        x={TARGET_X}
        y={TARGET_Y}
        width={380 - TARGET_X}
        height={TARGET_HEIGHT}
        rx={8}
        fill={svgTone.accentSoft}
        stroke={svgTone.accent}
        strokeWidth={1.5}
      />
      <text
        x={(TARGET_X + 380) / 2}
        y={TARGET_Y + 21}
        textAnchor="middle"
        fill={svgTone.ink}
        fontSize={12.5}
        fontWeight={700}
        fontFamily={svgFont.mono}
      >
        SzamlazzError
      </text>
      <text
        x={(TARGET_X + 380) / 2}
        y={TARGET_Y + 38}
        textAnchor="middle"
        fill={svgTone.muted}
        fontSize={12.5}
        fontFamily={svgFont.sans}
      >
        egyetlen típus
      </text>
    </svg>
  )
}
