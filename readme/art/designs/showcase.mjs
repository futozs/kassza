import { highlightTs, highlightXml } from '../code.mjs'
import { SAMPLE_CODE } from '../sample.mjs'
import { el, icon, logoDefs, logoMark, shadowFilter, svgDocument } from '../svg.mjs'
import { backdrop, backdropDefs, cardBorder, cardClip, sliceRuns } from './parts.mjs'

const WIDTH = 1280
const HEIGHT = 880
const RADIUS = 28
const WINDOW = { x: 64, y: 168, width: 1152, height: 820 }
const CHROME = 46
const NAVBAR = 56
const SIDEBAR = 252
const HEADER = 66
const PANEL = 430
const BODY_TOP = CHROME + NAVBAR
const MAIN_TOP = BODY_TOP + HEADER
const CODE_SIZE = 13.5
const CODE_LINE = 22
const XML_SIZE = 12
const XML_LINE = 19
const DESCRIPTION = 'B2B számla nettó egységárakkal, fizetési határidővel és e-mail értesítővel.'

function fitText(type, text, maxWidth, options) {
  if (type.measure(text, options) <= maxWidth) return text
  let end = text.length
  while (end > 1 && type.measure(`${text.slice(0, end).trimEnd()}…`, options) > maxWidth) end--
  return `${text.slice(0, end).trimEnd()}…`
}

function heading(scope, theme) {
  return [
    scope.text('Próbáld ki a böngészőben', {
      font: 'heading',
      size: 44,
      x: WIDTH / 2,
      y: 88,
      anchor: 'middle',
      tracking: -0.02,
      fill: theme.ink,
    }),
    scope.text(
      'Agent kulcs nélkül, szimulált Számlázz.hu ellen, a ténylegesen elküldött XML-lel.',
      {
        font: 'sans',
        size: 19,
        x: WIDTH / 2,
        y: 126,
        anchor: 'middle',
        fill: theme.muted,
      },
    ),
  ].join('')
}

function chrome(scope, type, theme, config) {
  const host = new URL(config.web).host
  const path = '/sandbox?pelda=szamla'
  const hostWidth = type.measure(host, { font: 'sans', size: 14 })
  const pathWidth = type.measure(path, { font: 'sans', size: 14 })
  const pillWidth = 34 + 20 + hostWidth + pathWidth + 40
  const pillX = WINDOW.width / 2 - pillWidth / 2
  const dots = [theme.code.constant, theme.amber, theme.accent].map((fill, index) =>
    el('circle', { cx: 24 + index * 19, cy: CHROME / 2, r: 6, fill, opacity: 0.9 }),
  )
  return [
    el('rect', { width: WINDOW.width, height: CHROME, fill: theme.surface }),
    el('path', { d: `M0 ${CHROME}H${WINDOW.width}`, stroke: theme.rule }),
    ...dots,
    el('rect', {
      x: pillX,
      y: 8,
      width: pillWidth,
      height: 30,
      rx: 15,
      fill: theme.paperRaised,
      stroke: theme.rule,
    }),
    icon('lock', { x: pillX + 16, y: 16, size: 14, stroke: theme.muted, width: 1.8 }),
    scope.text(host, { font: 'sans', size: 14, x: pillX + 38, y: 28, fill: theme.ink2 }),
    scope.text(path, {
      font: 'sans',
      size: 14,
      x: pillX + 38 + hostWidth,
      y: 28,
      fill: theme.muted,
    }),
  ].join('')
}

function navbar(scope, type, theme) {
  const baseline = CHROME + 34
  const links = [
    { label: 'Dokumentáció', active: false },
    { label: 'Sandbox', active: true },
    { label: 'Receptek', active: false },
  ]
  let cursor = 172
  const nav = links.map((link) => {
    const markup = scope.text(link.label, {
      font: 'sansMedium',
      size: 15,
      x: cursor,
      y: baseline,
      fill: link.active ? theme.accent : theme.ink2,
    })
    cursor += type.measure(link.label, { font: 'sansMedium', size: 15 }) + 30
    return markup
  })
  const searchX = WINDOW.width - 20 - 206
  const searchY = CHROME + 11
  const external = ['npm ↗', 'GitHub ↗']
  let right = searchX - 26
  const outbound = external.map((label) => {
    const width = type.measure(label, { font: 'sansMedium', size: 14.5 })
    right -= width
    const markup = scope.text(label, {
      font: 'sansMedium',
      size: 14.5,
      x: right,
      y: baseline,
      fill: theme.ink2,
    })
    right -= 26
    return markup
  })
  return [
    el('rect', { y: CHROME, width: WINDOW.width, height: NAVBAR, fill: theme.paper }),
    el('path', { d: `M0 ${BODY_TOP}H${WINDOW.width}`, stroke: theme.rule }),
    logoMark('showcase-logo', { x: 20, y: CHROME + 14, size: 28 }),
    scope.text('kassza', {
      font: 'display',
      size: 21,
      x: 57,
      y: CHROME + 35,
      tracking: -0.03,
      fill: theme.ink,
    }),
    ...nav,
    ...outbound,
    el('rect', {
      x: searchX,
      y: searchY,
      width: 206,
      height: 34,
      rx: 17,
      fill: theme.surface,
      stroke: theme.rule,
    }),
    icon('search', { x: searchX + 14, y: searchY + 9, size: 16, stroke: theme.muted, width: 1.9 }),
    scope.text('Keresés', {
      font: 'sans',
      size: 14,
      x: searchX + 38,
      y: searchY + 22,
      fill: theme.muted,
    }),
    el('rect', {
      x: searchX + 150,
      y: searchY + 7,
      width: 20,
      height: 20,
      rx: 5,
      fill: theme.paperRaised,
      stroke: theme.rule,
    }),
    icon('command', {
      x: searchX + 154,
      y: searchY + 11,
      size: 12,
      stroke: theme.muted,
      width: 1.6,
    }),
    el('rect', {
      x: searchX + 174,
      y: searchY + 7,
      width: 20,
      height: 20,
      rx: 5,
      fill: theme.paperRaised,
      stroke: theme.rule,
    }),
    scope.text('K', {
      font: 'monoMedium',
      size: 11.5,
      x: searchX + 184,
      y: searchY + 21,
      anchor: 'middle',
      fill: theme.muted,
    }),
  ].join('')
}

function sidebar(scope, type, theme, site) {
  const parts = [
    el('rect', { y: BODY_TOP, width: SIDEBAR, height: WINDOW.height, fill: theme.paper }),
    el('path', { d: `M${SIDEBAR} ${BODY_TOP}V${WINDOW.height}`, stroke: theme.rule }),
    scope.text('Sandbox', {
      font: 'sansSemibold',
      size: 19,
      x: 20,
      y: BODY_TOP + 38,
      fill: theme.ink,
    }),
    scope.text('Futtatható példák egy szimulált', {
      font: 'sans',
      size: 13,
      x: 20,
      y: BODY_TOP + 61,
      fill: theme.muted,
    }),
    scope.text('Számlázz.hu ellen.', {
      font: 'sans',
      size: 13,
      x: 20,
      y: BODY_TOP + 79,
      fill: theme.muted,
    }),
  ]
  let y = BODY_TOP + 116
  let group = null
  site.examples.forEach((example, index) => {
    if (example.group !== group) {
      group = example.group
      if (index > 0) y += 16
      parts.push(
        scope.text(group.toLocaleUpperCase('hu-HU'), {
          font: 'monoMedium',
          size: 11.5,
          x: 20,
          y,
          tracking: 0.08,
          fill: theme.muted,
        }),
      )
      y += 28
    }
    const active = index === 0
    if (active) {
      parts.push(
        el('rect', {
          x: 10,
          y: y - 19,
          width: SIDEBAR - 22,
          height: 29,
          rx: 7,
          fill: theme.accentSoft,
        }),
      )
    }
    const options = { font: active ? 'sansMedium' : 'sans', size: 14 }
    parts.push(
      scope.text(fitText(type, example.title, SIDEBAR - 44, options), {
        ...options,
        x: 20,
        y,
        fill: active ? theme.accent : theme.ink2,
      }),
    )
    y += 31
  })
  return parts.join('')
}

function ghostButton(scope, type, theme, { x, label, glyph, muted }) {
  const width = type.measure(label, { font: 'sansMedium', size: 14 })
  const color = muted ? theme.muted : theme.ink2
  return {
    width: width + 30,
    markup: [
      icon(glyph, { x, y: BODY_TOP + 25, size: 16, stroke: color, width: 1.9 }),
      scope.text(label, { font: 'sansMedium', size: 14, x: x + 23, y: BODY_TOP + 38, fill: color }),
    ].join(''),
  }
}

function mainHeader(scope, type, theme) {
  const runLabel = 'Futtatás'
  const runLabelWidth = type.measure(runLabel, { font: 'sansSemibold', size: 14.5 })
  const runWidth = 16 + 16 + 9 + runLabelWidth + 12 + 40 + 10
  const runX = WINDOW.width - 20 - runWidth
  const runFill = theme.name === 'dark' ? theme.accent : theme.brand
  const share = ghostButton(scope, type, theme, {
    x: runX - 124,
    label: 'Megosztás',
    glyph: 'share',
  })
  const reset = ghostButton(scope, type, theme, {
    x: runX - 124 - 142,
    label: 'Visszaállítás',
    glyph: 'reset',
    muted: true,
  })
  const titleLeft = SIDEBAR + 22
  const descriptionWidth = runX - 124 - 142 - titleLeft - 30
  return [
    el('path', { d: `M${SIDEBAR} ${MAIN_TOP}H${WINDOW.width}`, stroke: theme.rule }),
    scope.text('Számla kiállítása', {
      font: 'sansSemibold',
      size: 17,
      x: titleLeft,
      y: BODY_TOP + 29,
      fill: theme.ink,
    }),
    scope.text(fitText(type, DESCRIPTION, descriptionWidth, { font: 'sans', size: 13 }), {
      font: 'sans',
      size: 13,
      x: titleLeft,
      y: BODY_TOP + 50,
      fill: theme.muted,
    }),
    reset.markup,
    share.markup,
    el('rect', { x: runX, y: BODY_TOP + 15, width: runWidth, height: 36, rx: 18, fill: runFill }),
    icon('play', { x: runX + 14, y: BODY_TOP + 25, size: 16, fill: theme.brandInk }),
    scope.text(runLabel, {
      font: 'sansSemibold',
      size: 14.5,
      x: runX + 14 + 16 + 9,
      y: BODY_TOP + 38,
      fill: theme.brandInk,
    }),
    el('rect', {
      x: runX + runWidth - 50,
      y: BODY_TOP + 22,
      width: 38,
      height: 22,
      rx: 6,
      fill: theme.brandInk,
      opacity: 0.16,
    }),
    icon('command', {
      x: runX + runWidth - 45,
      y: BODY_TOP + 27,
      size: 12,
      stroke: theme.brandInk,
      width: 1.7,
    }),
    scope.text('↵', {
      font: 'sansMedium',
      size: 13,
      x: runX + runWidth - 30,
      y: BODY_TOP + 38,
      fill: theme.brandInk,
    }),
  ].join('')
}

function wrapLine(line, maxChars) {
  if (line.length <= maxChars) return [[0, line.length, 0]]
  const indent = line.length - line.trimStart().length
  const segments = []
  let start = 0
  while (line.length - start > maxChars - (start === 0 ? 0 : indent)) {
    const limit = start + maxChars - (start === 0 ? 0 : indent)
    const breakAt = line.lastIndexOf(' ', limit)
    const end = breakAt > start ? breakAt + 1 : limit
    segments.push([start, end])
    start = end
  }
  segments.push([start, line.length])
  return segments.map(([from, to], index) => [from, to, index === 0 ? 0 : indent])
}

function editor(scope, type, theme) {
  const left = SIDEBAR
  const right = WINDOW.width - PANEL
  const gutterRight = left + 46
  const codeLeft = left + 62
  const charWidth = type.measure('0', { font: 'mono', size: CODE_SIZE })
  const maxChars = Math.floor((right - codeLeft - 18) / charWidth)
  const parts = [
    el('rect', {
      x: left + 1,
      y: MAIN_TOP + 1,
      width: right - left - 1,
      height: WINDOW.height,
      fill: theme.paper,
    }),
  ]
  let row = 0
  SAMPLE_CODE.forEach((line, index) => {
    const runs = highlightTs(line, theme.siteCode)
    const segments = line ? wrapLine(line, maxChars) : [[0, 0, 0]]
    segments.forEach(([from, to, indent], segmentIndex) => {
      const baseline = MAIN_TOP + 30 + row * CODE_LINE
      if (index === 0 && segmentIndex === 0) {
        parts.push(
          el('rect', {
            x: left + 1,
            y: baseline - 16,
            width: right - left - 2,
            height: CODE_LINE,
            fill: theme.surface,
          }),
        )
      }
      if (segmentIndex === 0) {
        parts.push(
          scope.text(String(index + 1), {
            font: 'mono',
            size: CODE_SIZE,
            x: gutterRight,
            y: baseline,
            anchor: 'end',
            fill: index === 0 ? theme.ink2 : theme.siteCode.lineNumber,
          }),
        )
      }
      const slice = sliceRuns(runs, from, to)
      if (slice.length > 0) {
        parts.push(
          scope.text(slice, {
            font: 'mono',
            size: CODE_SIZE,
            x: codeLeft + indent * charWidth,
            y: baseline,
            fill: theme.siteCode.foreground,
          }),
        )
      }
      row++
    })
  })
  return parts.join('')
}

function panelTabs(scope, type, theme, left) {
  const tabs = [
    { label: 'Konzol · 4', active: false },
    { label: 'Számla Agent · 1', active: true },
    { label: 'Szimulált fiók', active: false },
  ]
  let cursor = left + 20
  const parts = []
  for (const tab of tabs) {
    const width = type.measure(tab.label, { font: 'sansMedium', size: 14 })
    parts.push(
      scope.text(tab.label, {
        font: 'sansMedium',
        size: 14,
        x: cursor,
        y: MAIN_TOP + 28,
        fill: tab.active ? theme.accent : theme.muted,
      }),
    )
    if (tab.active) {
      parts.push(
        el('rect', {
          x: cursor,
          y: MAIN_TOP + 42,
          width,
          height: 2.5,
          rx: 1.25,
          fill: theme.accent,
        }),
      )
    }
    cursor += width + 26
  }
  parts.push(el('path', { d: `M${left} ${MAIN_TOP + 44}H${WINDOW.width}`, stroke: theme.rule }))
  return parts.join('')
}

function requestSummary(scope, type, theme, left) {
  const top = MAIN_TOP + 44
  const textLeft = left + 44
  const maxWidth = WINDOW.width - textLeft - 24
  const rows = [
    { glyph: 'reset', color: theme.muted, text: 'Új session' },
    { glyph: 'check', color: theme.accent, text: 'Bizonylat kiállítva: KASSZA-2026-1' },
    {
      glyph: 'mail',
      color: theme.accent,
      text: 'Számlaértesítő e-mail a vevőnek: vevo@example.hu',
    },
  ]
  return [
    icon('chevronDown', { x: left + 18, y: top + 16, size: 16, stroke: theme.muted, width: 2 }),
    scope.text('Számla létrehozás', {
      font: 'sansSemibold',
      size: 15,
      x: textLeft,
      y: top + 29,
      fill: theme.ink,
    }),
    el('rect', {
      x: WINDOW.width - 20 - 44,
      y: top + 13,
      width: 44,
      height: 22,
      rx: 11,
      fill: theme.accentSoft,
    }),
    scope.text('200', {
      font: 'monoMedium',
      size: 12.5,
      x: WINDOW.width - 20 - 22,
      y: top + 28.5,
      anchor: 'middle',
      fill: theme.accent,
    }),
    scope.text(
      fitText(type, 'POST /szamla/ · action-xmlagentxmlfile', maxWidth, { font: 'mono', size: 12 }),
      {
        font: 'mono',
        size: 12,
        x: textLeft,
        y: top + 50,
        fill: theme.muted,
      },
    ),
    ...rows.map((row, index) => {
      const y = top + 82 + index * 25
      return [
        icon(row.glyph, { x: textLeft, y: y - 12, size: 15, stroke: row.color, width: 2 }),
        scope.text(fitText(type, row.text, maxWidth - 24, { font: 'sans', size: 13.5 }), {
          font: 'sans',
          size: 13.5,
          x: textLeft + 24,
          y,
          fill: index === 0 ? theme.muted : theme.ink2,
        }),
      ].join('')
    }),
  ].join('')
}

function xmlPanel(scope, type, theme, left, xml) {
  const boxX = left + 18
  const boxY = MAIN_TOP + 44 + 170
  const boxWidth = WINDOW.width - boxX - 18
  const textLeft = boxX + 16
  const maxWidth = boxWidth - 32
  const tabs = [
    { label: 'Elküldött XML', active: true },
    { label: 'Válasz', active: false },
  ]
  let cursor = textLeft
  const tabMarkup = tabs.map((tab) => {
    const width = type.measure(tab.label, { font: 'monoMedium', size: 12.5 })
    const markup = [
      scope.text(tab.label, {
        font: 'monoMedium',
        size: 12.5,
        x: cursor,
        y: boxY + 24,
        fill: tab.active ? theme.ink : theme.muted,
      }),
      tab.active
        ? el('rect', { x: cursor, y: boxY + 34, width, height: 2, rx: 1, fill: theme.accent })
        : '',
    ].join('')
    cursor += width + 24
    return markup
  })
  const lines = xml.map((line, index) => {
    const text = fitText(type, line, maxWidth, { font: 'mono', size: XML_SIZE })
    return scope.text(highlightXml(text, theme.siteCode), {
      font: 'mono',
      size: XML_SIZE,
      x: textLeft,
      y: boxY + 62 + index * XML_LINE,
      fill: theme.siteCode.foreground,
    })
  })
  return [
    el('rect', {
      x: boxX,
      y: boxY,
      width: boxWidth,
      height: WINDOW.height,
      rx: 10,
      fill: theme.surface,
      stroke: theme.rule,
    }),
    ...tabMarkup,
    el('path', { d: `M${boxX} ${boxY + 36}H${boxX + boxWidth}`, stroke: theme.rule }),
    ...lines,
  ].join('')
}

function panel(scope, type, theme, xml) {
  const left = WINDOW.width - PANEL
  return [
    el('rect', { x: left, y: MAIN_TOP, width: PANEL, height: WINDOW.height, fill: theme.paper }),
    el('path', { d: `M${left} ${MAIN_TOP}V${WINDOW.height}`, stroke: theme.rule }),
    panelTabs(scope, type, theme, left),
    requestSummary(scope, type, theme, left),
    xmlPanel(scope, type, theme, left, xml),
  ].join('')
}

function browserWindow(scope, type, theme, context) {
  const inner = [
    el('rect', { width: WINDOW.width, height: WINDOW.height, fill: theme.paper }),
    sidebar(scope, type, theme, context.site),
    editor(scope, type, theme),
    panel(scope, type, theme, context.sampleXml),
    mainHeader(scope, type, theme),
    navbar(scope, type, theme),
    chrome(scope, type, theme, context.config),
  ].join('')
  return el(
    'g',
    { transform: `translate(${WINDOW.x} ${WINDOW.y})` },
    [
      el('rect', {
        width: WINDOW.width,
        height: WINDOW.height,
        rx: 16,
        fill: theme.paper,
        filter: 'url(#showcase-shadow)',
      }),
      el('g', { 'clip-path': 'url(#showcase-window)' }, inner),
      el('rect', {
        x: 0.5,
        y: 0.5,
        width: WINDOW.width - 1,
        height: WINDOW.height - 1,
        rx: 15.5,
        fill: 'none',
        stroke: theme.ruleStrong,
      }),
    ].join(''),
  )
}

export function showcaseDocument(context) {
  const { type, theme } = context
  const scope = type.scope()
  const fadeTop = HEIGHT - 170
  const defs = [
    logoDefs('showcase-logo'),
    cardClip('showcase-card', { width: WIDTH, height: HEIGHT, radius: RADIUS }),
    cardClip('showcase-window', { width: WINDOW.width, height: WINDOW.height, radius: 16 }),
    backdropDefs('showcase', theme),
    shadowFilter('showcase-shadow', {
      color: theme.shadow,
      opacity: theme.name === 'dark' ? 0.6 : 0.16,
      blur: 22,
      dy: 18,
    }),
    `<linearGradient id="showcase-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${theme.paper}" stop-opacity="0"/><stop offset=".85" stop-color="${theme.paper}" stop-opacity="1"/></linearGradient>`,
  ].join('')
  const body = el(
    'g',
    { 'clip-path': 'url(#showcase-card)' },
    [
      backdrop('showcase', theme, {
        width: WIDTH,
        height: HEIGHT,
        glow: { cx: 640, cy: 140, rx: 620, ry: 260 },
      }),
      heading(scope, theme),
      browserWindow(scope, type, theme, context),
      el('rect', {
        y: fadeTop,
        width: WIDTH,
        height: HEIGHT - fadeTop,
        fill: 'url(#showcase-fade)',
      }),
    ].join(''),
  )
  return svgDocument({
    width: WIDTH,
    height: HEIGHT,
    title: 'A kassza sandbox a böngészőben',
    description:
      'A kassza weboldalának sandboxa: bal oldalt a futtatható példák listája, középen a számla kiállításának TypeScript kódja, jobbra a Számla Agent napló a ténylegesen elküldött xmlszamla XML-lel.',
    defs: defs + scope.defs(),
    body: body + cardBorder(theme, { width: WIDTH, height: HEIGHT, radius: RADIUS }),
  })
}
