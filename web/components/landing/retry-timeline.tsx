import { Arrow, StatusDot, svgFont, svgTone } from './svg-parts'

const LOOKUP_NODES = [
  { x: 50, status: 'fail', label: 'hálózati hiba' },
  { x: 190, status: 'fail', label: 'hálózati hiba' },
  { x: 330, status: 'ok', label: 'megjött a PDF' },
] as const

const WAITS = [
  { x: 120, label: 'vár 1 s' },
  { x: 260, label: 'vár 2 s' },
] as const

const LOOKUP_Y = 86
const CREATE_Y = 250

function Heading({ y, title, method }: { y: number; title: string; method: string }) {
  return (
    <g>
      <text
        x={0}
        y={y}
        fill={svgTone.ink}
        fontSize={14.5}
        fontWeight={700}
        fontFamily={svgFont.display}
      >
        {title}
      </text>
      <text x={0} y={y + 19} fill={svgTone.muted} fontSize={12.5} fontFamily={svgFont.mono}>
        {method}
      </text>
    </g>
  )
}

function Caption({
  x,
  y,
  children,
  tone = svgTone.ink2,
  anchor = 'middle',
  mono = false,
  weight = 400,
}: {
  x: number
  y: number
  children: string
  tone?: string
  anchor?: 'start' | 'middle' | 'end'
  mono?: boolean
  weight?: number
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fill={tone}
      fontSize={12.5}
      fontWeight={weight}
      fontFamily={mono ? svgFont.mono : svgFont.sans}
    >
      {children}
    </text>
  )
}

function LookupLane() {
  return (
    <g>
      <Heading y={18} title="Lekérdezés: magától újrapróbálja" method="invoices.getPdf()" />
      {WAITS.map((wait) => (
        <g key={wait.x}>
          <line
            x1={wait.x - 55}
            y1={LOOKUP_Y}
            x2={wait.x + 55}
            y2={LOOKUP_Y}
            stroke={svgTone.ruleStrong}
            strokeWidth={1.5}
          />
          <rect
            x={wait.x - 29}
            y={LOOKUP_Y - 11}
            width={58}
            height={22}
            rx={11}
            fill={svgTone.paper}
            stroke={svgTone.rule}
          />
          <Caption x={wait.x} y={LOOKUP_Y + 4} mono tone={svgTone.muted}>
            {wait.label}
          </Caption>
        </g>
      ))}
      {LOOKUP_NODES.map((node, index) => (
        <g key={node.x}>
          <Caption x={node.x} y={LOOKUP_Y - 26} mono tone={svgTone.muted}>
            {`${index + 1}. próba`}
          </Caption>
          <StatusDot cx={node.x} cy={LOOKUP_Y} status={node.status} />
          <Caption
            x={node.x}
            y={LOOKUP_Y + 36}
            tone={node.status === 'ok' ? svgTone.ink : svgTone.ink2}
          >
            {node.label}
          </Caption>
        </g>
      ))}
    </g>
  )
}

function CreateLane() {
  return (
    <g>
      <Heading y={182} title="Számla kiállítása: soha nem küldi újra" method="invoices.create()" />

      <StatusDot cx={50} cy={CREATE_Y} status="fail" />
      <Caption x={50} y={CREATE_Y + 36}>
        időtúllépés
      </Caption>
      <Caption x={50} y={CREATE_Y + 51} tone={svgTone.muted}>
        elkészült?
      </Caption>

      <line
        x1={65}
        y1={CREATE_Y}
        x2={104}
        y2={CREATE_Y}
        stroke={svgTone.ruleStrong}
        strokeWidth={1.5}
      />
      <line
        x1={108}
        y1={CREATE_Y - 20}
        x2={108}
        y2={CREATE_Y + 20}
        stroke={svgTone.ink}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <Arrow x1={112} y1={CREATE_Y} x2={138} y2={CREATE_Y} color={svgTone.danger} />

      <rect
        x={140}
        y={CREATE_Y - 18}
        width={228}
        height={36}
        rx={8}
        fill={svgTone.dangerSoft}
        stroke={svgTone.danger}
      />
      <Caption x={254} y={CREATE_Y + 4.5} mono tone={svgTone.danger} weight={600}>
        {"SzamlazzError · 'timeout'"}
      </Caption>

      <Arrow x1={254} y1={CREATE_Y + 19} x2={254} y2={CREATE_Y + 44} color={svgTone.ink2} />
      <rect
        x={110}
        y={CREATE_Y + 46}
        width={258}
        height={36}
        rx={8}
        fill={svgTone.accentSoft}
        stroke={svgTone.accent}
      />
      <Caption x={239} y={CREATE_Y + 68.5} mono tone={svgTone.ink}>
        {'invoices.find({ orderNumber })'}
      </Caption>

      <Arrow x1={190} y1={CREATE_Y + 83} x2={110} y2={CREATE_Y + 112} color={svgTone.ink2} />
      <Arrow x1={290} y1={CREATE_Y + 83} x2={300} y2={CREATE_Y + 112} color={svgTone.ink2} />

      <rect
        x={0}
        y={CREATE_Y + 114}
        width={184}
        height={56}
        rx={10}
        fill={svgTone.paper}
        stroke={svgTone.ruleStrong}
      />
      <StatusDot cx={24} cy={CREATE_Y + 142} status="ok" r={12} />
      <Caption x={46} y={CREATE_Y + 137} anchor="start" tone={svgTone.ink} weight={600}>
        megvan
      </Caption>
      <Caption x={46} y={CREATE_Y + 155} anchor="start" tone={svgTone.muted}>
        nem állítod ki újra
      </Caption>

      <rect
        x={196}
        y={CREATE_Y + 114}
        width={184}
        height={56}
        rx={10}
        fill={svgTone.paper}
        stroke={svgTone.ruleStrong}
      />
      <Caption x={212} y={CREATE_Y + 137} anchor="start" mono tone={svgTone.ink} weight={600}>
        null
      </Caption>
      <Caption x={212} y={CREATE_Y + 155} anchor="start" tone={svgTone.muted}>
        most már kiállíthatod
      </Caption>
    </g>
  )
}

export function RetryTimeline() {
  return (
    <svg
      viewBox="0 0 380 426"
      role="img"
      aria-labelledby="retry-timeline-title retry-timeline-desc"
      className="h-auto w-full"
    >
      <title id="retry-timeline-title">Újrapróbálás: lekérdezést igen, számlát soha</title>
      <desc id="retry-timeline-desc">
        Egy lekérdezés, például az invoices.getPdf(), hálózati hiba után 1, majd 2 másodperc
        várakozással újra próbálkozik, a harmadik próbára megjön a PDF. Az invoices.create()
        időtúllépés után nem küldi újra a kérést, hanem SzamlazzError hibát dob timeout
        kategóriával. Ezután az invoices.find a rendelésszámmal megmondja, elkészült-e a számla: ha
        megvan, nem állítod ki újra, ha null, most már kiállíthatod.
      </desc>
      <LookupLane />
      <line x1={0} y1={152} x2={380} y2={152} stroke={svgTone.rule} />
      <CreateLane />
    </svg>
  )
}
