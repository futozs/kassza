import { el, logoDefs, logoMark, svgDocument } from '../svg.mjs'
import { oklch } from '../theme.mjs'

export const TAGLINE = 'Számlázz.hu, TypeScriptben'
const WORD = 'kassza'
const WORD_TRACKING = -0.02
const TAG_SCALE = 0.158
const TAG_BASELINE = 0.37
const BAR_WIDTH = 0.4
const BAR_HEIGHT = 0.072
const BAR_GAP = 0.085
const ICON_GAP = 0.2

export function measureLockup(type, { iconSize, fontSize }) {
  const word = type.bounds(WORD, { font: 'display', size: fontSize, tracking: WORD_TRACKING })
  const tagSize = fontSize * TAG_SCALE
  const barWidth = fontSize * BAR_WIDTH
  const barGap = fontSize * BAR_GAP
  const natural = type.bounds(TAGLINE, { font: 'monoMedium', size: tagSize })
  const slack = word.width - (barWidth + barGap + natural.right)
  const tagTracking = Math.min(0.12, Math.max(-0.02, slack / ((TAGLINE.length - 1) * tagSize)))
  const tag = type.bounds(TAGLINE, { font: 'monoMedium', size: tagSize, tracking: tagTracking })
  const tagBaseline = fontSize * TAG_BASELINE
  const inkTop = word.top
  const inkBottom = Math.max(word.bottom, tagBaseline + tag.bottom)
  const gap = iconSize * ICON_GAP
  const textWidth = Math.max(word.width, barWidth + barGap + tag.right)
  return {
    word,
    tag,
    tagSize,
    tagTracking,
    tagBaseline,
    barWidth,
    barGap,
    inkTop,
    inkBottom,
    gap,
    width: iconSize + gap + textWidth,
    height: Math.max(iconSize, inkBottom - inkTop),
  }
}

export function lockup(scope, type, options) {
  const { x, y, iconSize, fontSize, prefix, colors, ring } = options
  const layout = measureLockup(type, { iconSize, fontSize })
  const centerY = y + layout.height / 2
  const baseline = centerY - (layout.inkTop + layout.inkBottom) / 2
  const textLeft = x + iconSize + layout.gap
  const xHeight = type.metrics('monoMedium', layout.tagSize).xHeight
  const barHeight = fontSize * BAR_HEIGHT
  const tagBaseline = baseline + layout.tagBaseline
  const markup = [
    logoMark(prefix, { x, y: centerY - iconSize / 2, size: iconSize, ring }),
    scope.text(WORD, {
      font: 'display',
      size: fontSize,
      x: textLeft - layout.word.left,
      y: baseline,
      tracking: WORD_TRACKING,
      fill: colors.word,
    }),
    el('rect', {
      x: textLeft,
      y: tagBaseline - xHeight / 2 - barHeight / 2,
      width: layout.barWidth,
      height: barHeight,
      rx: barHeight / 2,
      fill: colors.bar,
    }),
    scope.text(TAGLINE, {
      font: 'monoMedium',
      size: layout.tagSize,
      x: textLeft + layout.barWidth + layout.barGap,
      y: tagBaseline,
      tracking: layout.tagTracking,
      fill: colors.tag,
    }),
  ].join('')
  return { markup, width: layout.width, height: layout.height }
}

export function wordmarkDocument({ type }) {
  const iconSize = 256
  const fontSize = 212
  const padding = 28
  const scope = type.scope()
  const layout = measureLockup(type, { iconSize, fontSize })
  const width = Math.ceil(layout.width + padding * 2)
  const height = Math.ceil(layout.height + padding * 2)
  const { markup } = lockup(scope, type, {
    x: padding,
    y: padding,
    iconSize,
    fontSize,
    prefix: 'logo',
    colors: { word: oklch(56, 0.13, 150), bar: '#F59E0B', tag: oklch(59, 0.012, 150) },
  })
  return svgDocument({
    width,
    height,
    title: 'kassza',
    description: `kassza logó: ${TAGLINE}`,
    defs: logoDefs('logo') + scope.defs(),
    body: markup,
  })
}
