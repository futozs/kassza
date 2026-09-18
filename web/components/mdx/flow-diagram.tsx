const steps = [
  { label: 'invoices.create()', detail: 'a kódod meghívja a kasszát' },
  { label: 'XML, multipart POST', detail: 'validáció, kerekítés, XSD sorrend' },
  { label: 'XML válasz + PDF', detail: 'számlaszám, összegek, fejlécek' },
  { label: 'CreatedInvoice', detail: 'vagy SzamlazzError kategóriával' },
] as const

function Node({
  x,
  y,
  width,
  title,
  subtitle,
  emphasis = false,
}: {
  x: number
  y: number
  width: number
  title: string
  subtitle: string
  emphasis?: boolean
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={72}
        rx={12}
        fill={emphasis ? 'var(--accent-soft)' : 'var(--paper-raised)'}
        stroke={emphasis ? 'var(--accent)' : 'var(--rule-strong)'}
        strokeWidth={emphasis ? 1.5 : 1}
      />
      <text
        x={x + width / 2}
        y={y + 31}
        textAnchor="middle"
        fill="var(--ink)"
        fontSize={15}
        fontWeight={650}
      >
        {title}
      </text>
      <text x={x + width / 2} y={y + 51} textAnchor="middle" fill="var(--muted)" fontSize={12}>
        {subtitle}
      </text>
    </g>
  )
}

function Arrow({
  x1,
  x2,
  y,
  label,
  detail,
  direction,
  number,
}: {
  x1: number
  x2: number
  y: number
  label: string
  detail: string
  direction: 'right' | 'left'
  number: number
}) {
  const start = direction === 'right' ? x1 : x2
  const end = direction === 'right' ? x2 : x1
  const tip = direction === 'right' ? end - 8 : end + 8
  const middle = (x1 + x2) / 2
  return (
    <g>
      <line x1={start} y1={y} x2={tip} y2={y} stroke="var(--muted)" strokeWidth={1.5} />
      <path
        d={
          direction === 'right'
            ? `M${end - 9} ${y - 5} L${end} ${y} L${end - 9} ${y + 5} Z`
            : `M${end + 9} ${y - 5} L${end} ${y} L${end + 9} ${y + 5} Z`
        }
        fill="var(--muted)"
      />
      <text
        x={middle}
        y={y - 10}
        textAnchor="middle"
        fill="var(--ink-2)"
        fontSize={12.5}
        fontFamily="var(--ff-mono)"
      >
        {number}. {label}
      </text>
      <text x={middle} y={y + 20} textAnchor="middle" fill="var(--muted)" fontSize={11.5}>
        {detail}
      </text>
    </g>
  )
}

export function FlowDiagram() {
  return (
    <figure className="not-prose my-6 overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-surface">
      <svg
        viewBox="0 0 900 260"
        role="img"
        aria-labelledby="flow-title flow-desc"
        className="hidden h-auto w-full font-sans sm:block"
      >
        <title id="flow-title">Egy számla útja a kasszán keresztül</title>
        <desc id="flow-desc">
          A kódod meghívja a kasszát, a kassza XML-t küld a Számlázz.hu Számla Agentnek, amely XML
          választ és PDF-et ad vissza, a kassza pedig típusos eredményt vagy SzamlazzErrort ad a
          kódodnak. A Számlázz.hu e-mailben elküldi a számlát a vevőnek.
        </desc>
        <Node x={24} y={70} width={190} title="A rendszered" subtitle="webshop, API, cron" />
        <Node x={355} y={70} width={190} title="kassza" subtitle="a te szervereden fut" emphasis />
        <Node x={686} y={70} width={190} title="Számlázz.hu" subtitle="Számla Agent" />
        <Arrow
          x1={214}
          x2={355}
          y={92}
          label={steps[0].label}
          detail={steps[0].detail}
          direction="right"
          number={1}
        />
        <Arrow
          x1={545}
          x2={686}
          y={92}
          label={steps[1].label}
          detail={steps[1].detail}
          direction="right"
          number={2}
        />
        <Arrow
          x1={545}
          x2={686}
          y={150}
          label={steps[2].label}
          detail={steps[2].detail}
          direction="left"
          number={3}
        />
        <Arrow
          x1={214}
          x2={355}
          y={150}
          label={steps[3].label}
          detail={steps[3].detail}
          direction="left"
          number={4}
        />
        <path
          d="M781 142 C 781 225, 781 225, 690 225"
          fill="none"
          stroke="var(--amber)"
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
        <text
          x={590}
          y={229}
          textAnchor="middle"
          fill="var(--amber-ink)"
          fontSize={12.5}
          fontFamily="var(--ff-mono)"
        >
          5. e-mail a vevőnek a PDF-fel
        </text>
      </svg>
      <ol className="flex flex-col gap-3 p-4 text-sm sm:hidden">
        {steps.map((step, index) => (
          <li key={step.label} className="flex gap-3">
            <span className="tnum flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-xs font-semibold text-accent">
              {index + 1}
            </span>
            <span>
              <code className="font-mono text-ink">{step.label}</code>
              <span className="block text-muted">{step.detail}</span>
            </span>
          </li>
        ))}
        <li className="flex gap-3">
          <span className="tnum flex size-6 shrink-0 items-center justify-center rounded-full bg-amber-soft font-mono text-xs font-semibold text-amber-ink">
            5
          </span>
          <span className="text-ink-2">A Számlázz.hu e-mailben elküldi a PDF-et a vevőnek.</span>
        </li>
      </ol>
    </figure>
  )
}
