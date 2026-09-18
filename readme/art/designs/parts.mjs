import { highlightTs, highlightXml } from '../code.mjs'
import { dotPattern, el, num } from '../svg.mjs'

const CHROME_HEIGHT = 40
const CORNER = 16

export function windowChrome(scope, theme, { width, title, radius = CORNER }) {
  const dots = [theme.code.constant, theme.amber, theme.accent].map((fill, index) =>
    el('circle', { cx: 22 + index * 18, cy: CHROME_HEIGHT / 2, r: 5.5, fill, opacity: 0.85 }),
  )
  return [
    el('path', {
      d: `M0 ${radius}A${radius} ${radius} 0 0 1 ${radius} 0H${width - radius}A${radius} ${radius} 0 0 1 ${width} ${radius}V${CHROME_HEIGHT}H0Z`,
      fill: theme.editorChrome,
    }),
    el('path', { d: `M0 ${CHROME_HEIGHT}H${width}`, stroke: theme.editorRule }),
    ...dots,
    title
      ? scope.text(title, {
          font: 'mono',
          size: 13,
          x: width / 2,
          y: CHROME_HEIGHT / 2 + 4.5,
          anchor: 'middle',
          fill: theme.code.lineNumber,
        })
      : '',
  ].join('')
}

export function codeWindow(scope, type, theme, options) {
  const {
    width,
    lines,
    language = 'ts',
    title,
    fontSize = 15,
    lineHeight = 24,
    padding = 20,
    numbers = true,
    cursor = false,
  } = options
  const height = CHROME_HEIGHT + padding * 2 + lines.length * lineHeight - (lineHeight - fontSize)
  const gutter = numbers
    ? type.measure(String(lines.length), { font: 'mono', size: fontSize }) + 18
    : 0
  const codeLeft = padding + gutter
  const highlight = language === 'xml' ? highlightXml : highlightTs
  const rows = lines.map((line, index) => {
    const baseline = CHROME_HEIGHT + padding + fontSize * 0.78 + index * lineHeight
    const number = numbers
      ? scope.text(String(index + 1), {
          font: 'mono',
          size: fontSize,
          x: padding + gutter - 18,
          y: baseline,
          anchor: 'end',
          fill: theme.code.lineNumber,
        })
      : ''
    const code = line.trim()
      ? scope.text(highlight(line, theme.code), {
          font: 'mono',
          size: fontSize,
          x: codeLeft,
          y: baseline,
          fill: theme.code.foreground,
        })
      : ''
    return number + code
  })
  const lastLine = lines.at(-1) ?? ''
  const cursorMark = cursor
    ? el('rect', {
        class: 'blink',
        x: codeLeft + type.measure(lastLine, { font: 'mono', size: fontSize }) + 3,
        y: CHROME_HEIGHT + padding + (lines.length - 1) * lineHeight - 2,
        width: 2,
        height: fontSize + 4,
        rx: 1,
        fill: theme.amber,
      })
    : ''
  const markup = [
    el('rect', {
      width,
      height,
      rx: CORNER,
      fill: theme.editor,
      stroke: theme.editorRule,
    }),
    windowChrome(scope, theme, { width, title }),
    ...rows,
    cursorMark,
  ].join('')
  return { markup, width, height }
}

export function centered(width, height, cx, cy, rotation, inner) {
  return el(
    'g',
    {
      transform: `translate(${num(cx)} ${num(cy)}) rotate(${rotation}) translate(${num(-width / 2)} ${num(-height / 2)})`,
    },
    inner,
  )
}

export function barcode({ x, y, width, height, seed, fill }) {
  const bars = []
  let cursor = x
  let state = [...seed].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 2147483647, 7)
  while (cursor < x + width) {
    state = (state * 48271) % 2147483647
    const barWidth = 1.5 + (state % 4) * 1.1
    state = (state * 48271) % 2147483647
    const gapWidth = 1.4 + (state % 3) * 1.2
    if (cursor + barWidth > x + width) break
    bars.push(`M${num(cursor)} ${num(y)}h${num(barWidth)}v${num(height)}h${num(-barWidth)}z`)
    cursor += barWidth + gapWidth
  }
  return el('path', { d: bars.join(''), fill })
}

export function backdropDefs(prefix, theme) {
  const glowOpacity = theme.name === 'dark' ? 0.34 : 0.55
  return [
    `<radialGradient id="${prefix}-glow"><stop offset="0" stop-color="${theme.glow}" stop-opacity="${glowOpacity}"/><stop offset="1" stop-color="${theme.glow}" stop-opacity="0"/></radialGradient>`,
    `<radialGradient id="${prefix}-vignette" cx=".5" cy=".42" r=".75"><stop offset=".45" stop-color="${theme.paper}" stop-opacity="0"/><stop offset="1" stop-color="${theme.paper}" stop-opacity=".96"/></radialGradient>`,
    dotPattern(`${prefix}-dots`, { gap: 22, radius: 1.15, color: theme.dot }),
  ].join('')
}

export function backdrop(prefix, theme, { width, height, glow }) {
  return [
    el('rect', { width, height, fill: theme.paper }),
    el('ellipse', { ...glow, fill: `url(#${prefix}-glow)` }),
    el('rect', { width, height, fill: `url(#${prefix}-dots)` }),
    el('rect', { width, height, fill: `url(#${prefix}-vignette)` }),
  ].join('')
}

export function cardClip(id, { width, height, radius }) {
  return `<clipPath id="${id}"><rect width="${width}" height="${height}" rx="${radius}"/></clipPath>`
}

export function cardBorder(theme, { width, height, radius }) {
  return el('rect', {
    x: 0.5,
    y: 0.5,
    width: width - 1,
    height: height - 1,
    rx: radius - 0.5,
    fill: 'none',
    stroke: theme.rule,
  })
}

export function sliceRuns(runs, start, end) {
  const sliced = []
  let offset = 0
  for (const run of runs) {
    const runStart = offset
    const runEnd = offset + run.text.length
    offset = runEnd
    if (runEnd <= start || runStart >= end) continue
    const text = run.text.slice(
      Math.max(0, start - runStart),
      Math.min(run.text.length, end - runStart),
    )
    if (text) sliced.push({ ...run, text })
  }
  return sliced
}
