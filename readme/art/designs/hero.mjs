import { el, icon, logoDefs, num, receiptPath, svgDocument } from '../svg.mjs'
import { lockup, measureLockup, TAGLINE } from './lockup.mjs'
import {
  backdrop,
  backdropDefs,
  barcode,
  cardBorder,
  cardClip,
  centered,
  codeWindow,
} from './parts.mjs'

const WIDTH = 1280
const HEIGHT = 640
const RADIUS = 28
const ICON_SIZE = 128
const WORD_SIZE = 124

const CODE = [
  'const szamla =',
  '  await kassza.invoices.create({',
  "    buyer: { name: 'Vevő Kft.' },",
  '    items: [{',
  "      name: 'Webfejlesztés',",
  '      quantity: 10,',
  '      netUnitPrice: 15_000,',
  '      vat: 27,',
  '    }],',
  '  })',
]

const RECEIPT_WIDTH = 292
const RECEIPT_HEIGHT = 418

const STYLE = `
@keyframes print{from{transform:translateY(-34px)}to{transform:none}}
@keyframes stamp{from{transform:scale(1.8);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes blink{50%{opacity:0}}
@keyframes comet{0%{stroke-dashoffset:90}55%,100%{stroke-dashoffset:-1000}}
.stamp{transform-box:fill-box;transform-origin:center}
.comet{stroke-dasharray:90 1300}
@media (prefers-reduced-motion:no-preference){
.print{animation:print 1.2s cubic-bezier(.16,1,.3,1) .2s both}
.stamp{animation:stamp .55s cubic-bezier(.2,1.4,.4,1) 1.2s both}
.blink{animation:blink 1.1s steps(1) infinite}
.comet{animation:comet 5s cubic-bezier(.55,0,.25,1) 1s infinite}
}`

function softShadow(id, { cx, cy, rx, ry }) {
  return el('ellipse', { cx, cy, rx, ry, fill: `url(#${id})` })
}

function cubicPoint(points, t) {
  const [p0, p1, p2, p3] = points
  const u = 1 - t
  const blend = (key) =>
    u ** 3 * p0[key] + 3 * u ** 2 * t * p1[key] + 3 * u * t ** 2 * p2[key] + t ** 3 * p3[key]
  return { x: blend('x'), y: blend('y') }
}

function receiptRow(scope, { y, left, right, size = 14, font = 'mono', fill }) {
  return [
    scope.text(left, { font, size, x: 22, y, fill }),
    scope.text(right, { font, size, x: RECEIPT_WIDTH - 22, y, anchor: 'end', fill }),
  ].join('')
}

function dashedRule(y, theme, double = false) {
  const line = (offset) =>
    el('path', {
      d: `M22 ${y + offset}H${RECEIPT_WIDTH - 22}`,
      stroke: theme.receiptRule,
      'stroke-width': 1.4,
      'stroke-dasharray': double ? undefined : '4 4',
    })
  return double ? line(0) + line(4) : line(0)
}

function stamp(scope, type, theme) {
  const label = 'KIÁLLÍTVA'
  const size = 17
  const textWidth = type.measure(label, { font: 'monoBold', size, tracking: 0.14 })
  const width = textWidth + 58
  const height = 40
  const color = theme.receiptAccent
  const inner = [
    el('rect', { width, height, rx: 8, fill: 'none', stroke: color, 'stroke-width': 3 }),
    el('rect', {
      x: 5,
      y: 5,
      width: width - 10,
      height: height - 10,
      rx: 5,
      fill: 'none',
      stroke: color,
      'stroke-width': 1.2,
    }),
    icon('check', { x: 13, y: 11, size: 18, stroke: color, width: 3 }),
    scope.text(label, {
      font: 'monoBold',
      size,
      x: 38,
      y: height / 2 + 6,
      tracking: 0.14,
      fill: color,
    }),
  ].join('')
  return el(
    'g',
    {
      transform: `translate(${num((RECEIPT_WIDTH - width) / 2)} 290) rotate(-5 ${num(width / 2)} 20)`,
    },
    el('g', { class: 'stamp', opacity: 0.9 }, inner),
  )
}

function receipt(scope, type, theme) {
  const ink = theme.receiptInk
  const muted = theme.receiptMuted
  const body = [
    el('path', {
      d: receiptPath({
        x: 0,
        y: 0,
        width: RECEIPT_WIDTH,
        height: RECEIPT_HEIGHT,
        tooth: 16,
        depth: 8,
      }),
      fill: 'url(#hero-paper)',
    }),
    scope.text('SZÁMLA', {
      font: 'monoBold',
      size: 20,
      x: RECEIPT_WIDTH / 2,
      y: 50,
      anchor: 'middle',
      tracking: 0.26,
      fill: ink,
    }),
    scope.text('E-WEB-2026-12 · Vevő Kft.', {
      font: 'mono',
      size: 12.5,
      x: RECEIPT_WIDTH / 2,
      y: 74,
      anchor: 'middle',
      fill: muted,
    }),
    dashedRule(94, theme),
    scope.text('Webfejlesztés', { font: 'monoMedium', size: 15, x: 22, y: 124, fill: ink }),
    receiptRow(scope, {
      y: 147,
      left: '10 óra × 15 000',
      right: '150 000',
      size: 13.5,
      fill: muted,
    }),
    dashedRule(166, theme),
    receiptRow(scope, { y: 192, left: 'Nettó', right: '150 000 Ft', fill: ink }),
    receiptRow(scope, { y: 216, left: 'ÁFA 27%', right: '40 500 Ft', fill: ink }),
    dashedRule(234, theme, true),
    scope.text('BRUTTÓ', { font: 'monoBold', size: 15, x: 22, y: 268, tracking: 0.1, fill: ink }),
    scope.text('190 500 Ft', {
      font: 'monoBold',
      size: 21,
      x: RECEIPT_WIDTH - 22,
      y: 269,
      anchor: 'end',
      fill: ink,
    }),
    barcode({
      x: 22,
      y: 346,
      width: RECEIPT_WIDTH - 44,
      height: 28,
      seed: 'E-WEB-2026-12',
      fill: ink,
    }),
    icon('mail', { x: 66, y: 386, size: 16, stroke: theme.receiptMuted, width: 1.8 }),
    scope.text('e-mailben elküldve', {
      font: 'mono',
      size: 12.5,
      x: 88,
      y: 399,
      fill: theme.receiptMuted,
    }),
    stamp(scope, type, theme),
  ].join('')
  return el('g', { class: 'print' }, body)
}

function flowLabels(scope, type, theme, points) {
  const labels = ['validál', 'kerekít', 'XML-t épít']
  return labels
    .map((label, index) => {
      const point = cubicPoint(points, 0.28 + index * 0.22)
      const width = type.measure(label, { font: 'monoMedium', size: 15 }) + 38
      const x = point.x - width / 2
      return el(
        'g',
        {},
        [
          el('rect', {
            x,
            y: point.y - 16,
            width,
            height: 32,
            rx: 16,
            fill: theme.paperRaised,
            stroke: theme.ruleStrong,
          }),
          icon('check', { x: x + 11, y: point.y - 8, size: 16, stroke: theme.accent, width: 2.6 }),
          scope.text(label, {
            font: 'monoMedium',
            size: 15,
            x: x + 31,
            y: point.y + 5.1,
            fill: theme.ink2,
          }),
        ].join(''),
      )
    })
    .join('')
}

function announcement(scope, type, theme, site, centerY) {
  const size = 17
  const label = 'ÚJ'
  const message = `Sandbox, ${site.recipes.length} recept és ${site.pages.size} oldalas magyar dokumentáció`
  const labelWidth = type.measure(label, { font: 'monoBold', size: 12.5, tracking: 0.12 }) + 20
  const messageWidth = type.measure(message, { font: 'sansMedium', size })
  const width = 5 + labelWidth + 12 + messageWidth + 12 + 18 + 14
  const height = 34
  const x = WIDTH / 2 - width / 2
  const y = centerY - height / 2
  return [
    el('rect', {
      x,
      y,
      width,
      height,
      rx: height / 2,
      fill: theme.paperRaised,
      stroke: theme.ruleStrong,
    }),
    el('rect', {
      x: x + 5,
      y: y + 5,
      width: labelWidth,
      height: height - 10,
      rx: (height - 10) / 2,
      fill: theme.amber,
    }),
    scope.text(label, {
      font: 'monoBold',
      size: 12.5,
      x: x + 5 + labelWidth / 2,
      y: centerY + 4.4,
      anchor: 'middle',
      tracking: 0.12,
      fill: '#1c1405',
    }),
    scope.text(message, {
      font: 'sansMedium',
      size,
      x: x + 5 + labelWidth + 12,
      y: centerY + 5.6,
      fill: theme.ink2,
    }),
    icon('arrowRight', {
      x: x + width - 32,
      y: centerY - 9,
      size: 18,
      stroke: theme.accent,
      width: 2.2,
    }),
  ].join('')
}

function installPill(scope, type, theme, centerY) {
  const size = 22
  const command = 'npm i kassza'
  const promptWidth = type.measure('$', { font: 'monoMedium', size })
  const commandWidth = type.measure(command, { font: 'monoMedium', size })
  const width = 32 + promptWidth + 14 + commandWidth + 32
  const height = 60
  const x = WIDTH / 2 - width / 2
  const y = centerY - height / 2
  const baseline = centerY + size * 0.34
  return [
    el('rect', {
      x,
      y: y + 3,
      width,
      height,
      rx: height / 2,
      fill: theme.shadow,
      opacity: theme.name === 'dark' ? 0.5 : 0.06,
    }),
    el('rect', {
      x,
      y,
      width,
      height,
      rx: height / 2,
      fill: theme.paperRaised,
      stroke: theme.ruleStrong,
    }),
    scope.text('$', { font: 'monoMedium', size, x: x + 32, y: baseline, fill: theme.accent }),
    scope.text(command, {
      font: 'monoMedium',
      size,
      x: x + 32 + promptWidth + 14,
      y: baseline,
      fill: theme.ink,
    }),
  ].join('')
}

function metaRow(scope, type, theme, baseline) {
  const items = ['11 Agent művelet', '0 függőség', 'Node, Bun, Deno, Edge']
  const size = 18
  const gap = 34
  const widths = items.map((item) => type.measure(item, { font: 'sansMedium', size }))
  const total = widths.reduce((sum, width) => sum + width, 0) + gap * (items.length - 1)
  let cursor = WIDTH / 2 - total / 2
  const parts = []
  items.forEach((item, index) => {
    if (index > 0) {
      parts.push(
        el('circle', { cx: cursor - gap / 2, cy: baseline - 6, r: 3.2, fill: theme.amber }),
      )
    }
    parts.push(
      scope.text(item, { font: 'sansMedium', size, x: cursor, y: baseline, fill: theme.ink2 }),
    )
    cursor += widths[index] + gap
  })
  return parts.join('')
}

function defs(theme) {
  const shadowOpacity = theme.name === 'dark' ? 0.7 : 0.16
  return [
    logoDefs('hero-logo'),
    cardClip('hero-card', { width: WIDTH, height: HEIGHT, radius: RADIUS }),
    backdropDefs('hero', theme),
    `<linearGradient id="hero-paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${theme.receipt}"/><stop offset="1" stop-color="${theme.receiptEdge}"/></linearGradient>`,
    `<radialGradient id="hero-shadow"><stop offset="0" stop-color="${theme.shadow}" stop-opacity="${shadowOpacity}"/><stop offset="1" stop-color="${theme.shadow}" stop-opacity="0"/></radialGradient>`,
  ].join('')
}

export function heroDocument({ type, theme, site }) {
  const scope = type.scope()
  const layout = measureLockup(type, { iconSize: ICON_SIZE, fontSize: WORD_SIZE })
  const lockupTop = 138
  const brand = lockup(scope, type, {
    x: WIDTH / 2 - layout.width / 2,
    y: lockupTop,
    iconSize: ICON_SIZE,
    fontSize: WORD_SIZE,
    prefix: 'hero-logo',
    ring: theme.name === 'dark' ? 'rgba(255,255,255,.14)' : undefined,
    colors: { word: theme.ink, bar: theme.amber, tag: theme.muted },
  })
  const pillCenter = lockupTop + layout.height + 64
  const code = codeWindow(scope, type, theme, {
    width: 346,
    lines: CODE,
    title: 'szamla.ts',
    fontSize: 13.5,
    lineHeight: 22,
    cursor: true,
  })
  const flow = [
    { x: 300, y: 470 },
    { x: 420, y: 612 },
    { x: 860, y: 612 },
    { x: 986, y: 470 },
  ]
  const flowPath = `M${flow[0].x} ${flow[0].y}C${flow[1].x} ${flow[1].y} ${flow[2].x} ${flow[2].y} ${flow[3].x} ${flow[3].y}`
  const body = el(
    'g',
    { 'clip-path': 'url(#hero-card)' },
    [
      backdrop('hero', theme, {
        width: WIDTH,
        height: HEIGHT,
        glow: { cx: 640, cy: 250, rx: 560, ry: 330 },
      }),
      softShadow('hero-shadow', { cx: 170, cy: 520, rx: 230, ry: 46 }),
      softShadow('hero-shadow', { cx: 1110, cy: 540, rx: 190, ry: 40 }),
      el('path', {
        d: flowPath,
        fill: 'none',
        stroke: theme.ruleStrong,
        'stroke-width': 2,
        'stroke-dasharray': '1 8',
        'stroke-linecap': 'round',
      }),
      el('path', {
        class: 'comet',
        d: flowPath,
        pathLength: 1000,
        fill: 'none',
        stroke: theme.amber,
        'stroke-width': 3.5,
        'stroke-linecap': 'round',
        'stroke-dashoffset': 90,
      }),
      centered(code.width, code.height, 184, 332, -6, code.markup),
      centered(RECEIPT_WIDTH, RECEIPT_HEIGHT, 1100, 332, 5, receipt(scope, type, theme)),
      flowLabels(scope, type, theme, flow),
      announcement(scope, type, theme, site, 76),
      brand.markup,
      installPill(scope, type, theme, pillCenter),
      metaRow(scope, type, theme, pillCenter + 78),
    ].join(''),
  )
  const border = cardBorder(theme, { width: WIDTH, height: HEIGHT, radius: RADIUS })
  return svgDocument({
    width: WIDTH,
    height: HEIGHT,
    title: 'kassza',
    description: `kassza: ${TAGLINE}. Telepítés: npm i kassza. 11 Agent művelet, 0 függőség, Node, Bun, Deno és Edge.`,
    style: STYLE,
    defs: defs(theme) + scope.defs(),
    body: body + border,
  })
}
