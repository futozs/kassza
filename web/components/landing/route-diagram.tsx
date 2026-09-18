import {
  Arrow,
  BracesGlyph,
  CheckMark,
  EnvelopeGlyph,
  ReceiptGlyph,
  svgFont,
  svgTone,
} from './svg-parts'

const TITLE = 'Egy számla útja a kódodtól a vevőig'
const DESCRIPTION =
  'A kódod egy objektumot ad át a kasszának. A kassza validál, kerekít, az XSD sorrendjében felépíti az XML-t, és magyar idő szerint tölti ki a dátumokat, majd multipart POST kérésben, a session cookie-val együtt elküldi a Számla Agentnek. A Számlázz.hu kiállítja a számlát, és XML választ meg PDF-et küld vissza, amiből a kódod CreatedInvoice eredményt vagy SzamlazzError hibát kap. A vevő e-mailben megkapja a számlát. Fizetés után a Számlázz.hu IPN értesítést küld a szerverednek.'

const KASSZA_STEPS = [
  'validáció',
  'kerekítés tételenként',
  'XML az XSD sorrendjében',
  'dátum: Europe/Budapest',
] as const

function Station({
  x,
  y,
  width,
  height,
  emphasis = false,
  external = false,
}: {
  x: number
  y: number
  width: number
  height: number
  emphasis?: boolean
  external?: boolean
}) {
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={14}
      fill={emphasis ? svgTone.accentSoft : external ? svgTone.surface : svgTone.paper}
      stroke={emphasis ? svgTone.accent : svgTone.ruleStrong}
      strokeWidth={emphasis ? 1.6 : 1}
    />
  )
}

function Label({
  x,
  y,
  children,
  anchor = 'middle',
  tone = svgTone.ink2,
  mono = true,
  size = 12.5,
}: {
  x: number
  y: number
  children: string
  anchor?: 'start' | 'middle' | 'end'
  tone?: string
  mono?: boolean
  size?: number
}) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={anchor}
      fill={tone}
      fontSize={size}
      fontFamily={mono ? svgFont.mono : svgFont.sans}
    >
      {children}
    </text>
  )
}

function Title({
  x,
  y,
  children,
  size = 17,
}: {
  x: number
  y: number
  children: string
  size?: number
}) {
  return (
    <text
      x={x}
      y={y}
      fill={svgTone.ink}
      fontSize={size}
      fontWeight={700}
      fontFamily={svgFont.display}
    >
      {children}
    </text>
  )
}

function CookieChip({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={92}
        height={22}
        rx={11}
        fill={svgTone.amberSoft}
        stroke={svgTone.amber}
      />
      <text
        x={x + 46}
        y={y + 15}
        textAnchor="middle"
        fill={svgTone.ink}
        fontSize={11.5}
        fontFamily={svgFont.mono}
      >
        JSESSIONID
      </text>
    </g>
  )
}

function KasszaChecklist({ x, y }: { x: number; y: number }) {
  return (
    <g>
      {KASSZA_STEPS.map((step, index) => (
        <g key={step}>
          <CheckMark x={x} y={y + index * 26 - 11} size={12} />
          <text
            x={x + 22}
            y={y + index * 26}
            fill={svgTone.ink2}
            fontSize={13.5}
            fontFamily={svgFont.sans}
          >
            {step}
          </text>
        </g>
      ))}
    </g>
  )
}

function WideRoute() {
  return (
    <svg
      viewBox="0 0 1200 312"
      role="img"
      aria-labelledby="route-wide-title route-wide-desc"
      className="hidden h-auto w-full xl:block"
    >
      <title id="route-wide-title">{TITLE}</title>
      <desc id="route-wide-desc">{DESCRIPTION}</desc>

      <path
        d="M810 196 V288 H90 V205"
        fill="none"
        stroke={svgTone.accent}
        strokeWidth={1.5}
        strokeDasharray="5 5"
      />
      <Arrow x1={90} y1={214} x2={90} y2={198} color={svgTone.accent} />
      <Label x={450} y={278} mono={false} size={13} tone={svgTone.ink2}>
        fizetés után: IPN értesítés a szerverednek (kassza/ipn)
      </Label>

      <Station x={0} y={64} width={180} height={132} />
      <BracesGlyph x={20} y={84} size={22} />
      <Title x={20} y={140}>
        A kódod
      </Title>
      <Label x={20} y={163} anchor="start">
        invoices.create()
      </Label>
      <Label x={20} y={182} anchor="start" tone={svgTone.muted} mono={false} size={12.5}>
        típusos objektum
      </Label>

      <Station x={290} y={40} width={260} height={180} emphasis />
      <Title x={312} y={76} size={20}>
        kassza
      </Title>
      <KasszaChecklist x={312} y={112} />

      <Station x={700} y={64} width={220} height={132} external />
      <Title x={720} y={100}>
        Számlázz.hu
      </Title>
      <Label x={720} y={122} anchor="start" tone={svgTone.muted} mono={false} size={13}>
        Számla Agent
      </Label>
      <Label x={720} y={156} anchor="start" mono={false} size={13}>
        kiállítja a számlát
      </Label>
      <Label x={720} y={176} anchor="start" mono={false} size={13}>
        XML választ és PDF-et ad
      </Label>

      <Station x={1030} y={64} width={170} height={132} />
      <EnvelopeGlyph x={1050} y={84} />
      <Title x={1050} y={140}>
        A vevő
      </Title>
      <Label x={1050} y={163} anchor="start" mono={false} size={13}>
        e-mailben kapja
      </Label>
      <Label x={1050} y={182} anchor="start" tone={svgTone.muted} size={12}>
        buyer.email
      </Label>

      <Arrow x1={184} y1={104} x2={286} y2={104} color={svgTone.ink2} />
      <Label x={235} y={94}>
        objektum
      </Label>
      <Arrow x1={286} y1={164} x2={184} y2={164} />
      <Label x={235} y={184} tone={svgTone.muted}>
        eredmény
      </Label>

      <Arrow x1={554} y1={104} x2={696} y2={104} color={svgTone.ink2} />
      <Label x={625} y={94}>
        POST · XML
      </Label>
      <CookieChip x={579} y={116} />
      <Arrow x1={696} y1={164} x2={554} y2={164} />
      <Label x={625} y={184} tone={svgTone.muted}>
        XML + PDF
      </Label>

      <Arrow x1={924} y1={130} x2={1026} y2={130} color={svgTone.ink2} />
      <ReceiptGlyph x={961} y={78} width={28} height={36} />
      <Label x={975} y={152} tone={svgTone.muted}>
        e-mail
      </Label>
    </svg>
  )
}

function NarrowRoute() {
  return (
    <svg
      viewBox="0 0 330 652"
      role="img"
      aria-labelledby="route-narrow-title route-narrow-desc"
      className="mx-auto h-auto w-full max-w-[26rem] xl:hidden"
    >
      <title id="route-narrow-title">{TITLE}</title>
      <desc id="route-narrow-desc">{DESCRIPTION}</desc>

      <path
        d="M36 442 H12 V50 H26"
        fill="none"
        stroke={svgTone.accent}
        strokeWidth={1.5}
        strokeDasharray="5 5"
      />
      <Arrow x1={22} y1={50} x2={34} y2={50} color={svgTone.accent} />
      <text
        x={28}
        y={246}
        transform="rotate(-90 28 246)"
        textAnchor="middle"
        fill={svgTone.ink2}
        fontSize={11.5}
        fontFamily={svgFont.sans}
      >
        IPN értesítés fizetéskor
      </text>

      <Station x={36} y={8} width={264} height={84} />
      <Title x={54} y={44} size={16}>
        A kódod
      </Title>
      <Label x={54} y={70} anchor="start">
        invoices.create()
      </Label>
      <BracesGlyph x={258} y={30} size={20} />

      <Arrow x1={150} y1={94} x2={150} y2={146} color={svgTone.ink2} />
      <Label x={142} y={126} anchor="end">
        objektum
      </Label>
      <Arrow x1={214} y1={146} x2={214} y2={94} />
      <Label x={222} y={126} anchor="start" tone={svgTone.muted}>
        eredmény
      </Label>

      <Station x={36} y={150} width={264} height={172} emphasis />
      <Title x={54} y={182} size={18}>
        kassza
      </Title>
      <KasszaChecklist x={54} y={212} />

      <Arrow x1={150} y1={324} x2={150} y2={396} color={svgTone.ink2} />
      <Label x={142} y={348} anchor="end">
        POST · XML
      </Label>
      <CookieChip x={48} y={360} />
      <Arrow x1={214} y1={396} x2={214} y2={324} />
      <Label x={222} y={366} anchor="start" tone={svgTone.muted}>
        XML + PDF
      </Label>

      <Station x={36} y={400} width={264} height={84} external />
      <Title x={54} y={432} size={16}>
        Számlázz.hu
      </Title>
      <Label x={54} y={458} anchor="start" tone={svgTone.muted} mono={false} size={12.5}>
        Számla Agent: kiállítja a számlát
      </Label>

      <Arrow x1={150} y1={486} x2={150} y2={556} color={svgTone.ink2} />
      <ReceiptGlyph x={166} y={502} width={26} height={34} />
      <Label x={142} y={526} anchor="end" tone={svgTone.muted}>
        e-mail
      </Label>

      <Station x={36} y={560} width={264} height={84} />
      <Title x={54} y={592} size={16}>
        A vevő
      </Title>
      <Label x={54} y={618} anchor="start" mono={false} size={12.5}>
        e-mailben megkapja a számlát
      </Label>
      <EnvelopeGlyph x={258} y={580} width={26} height={18} />
    </svg>
  )
}

export function RouteDiagram() {
  return (
    <figure className="m-0 min-w-0">
      <WideRoute />
      <NarrowRoute />
      <figcaption className="mt-5 max-w-[68ch] text-sm leading-relaxed text-muted">
        A szaggatott vonal később jön: amikor a vevő fizet, a Számlázz.hu értesíti a szerveredet, a{' '}
        <code className="font-mono text-[0.85em] text-ink-2">kassza/ipn</code> pedig feldolgozza.
      </figcaption>
    </figure>
  )
}
