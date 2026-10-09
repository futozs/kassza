import { el, icon, svgDocument } from '../svg.mjs'

const BUTTON_HEIGHT = 40

function palette(theme, primary) {
  if (!primary) {
    return {
      fill: theme.paperRaised,
      stroke: theme.ruleStrong,
      lip: theme.rule,
      tile: theme.accentSoft,
      glyph: theme.accent,
      title: theme.ink,
      subtitle: theme.muted,
      arrow: theme.muted,
    }
  }
  return {
    fill: theme.name === 'dark' ? theme.accent : theme.brand,
    stroke: theme.name === 'dark' ? theme.accent : theme.brand,
    lip: theme.name === 'dark' ? theme.brand : theme.brandDeep,
    tile: theme.name === 'dark' ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.14)',
    glyph: theme.brandInk,
    title: theme.brandInk,
    subtitle: theme.brandInk,
    arrow: theme.brandInk,
  }
}

const SECTION_BUTTONS = [
  { name: 'button-docs', icon: 'book', label: 'Dokumentáció' },
  { name: 'button-sandbox', icon: 'play', label: 'Futtasd a sandboxban', primary: true },
]

function sectionButton(type, theme, item) {
  const scope = type.scope()
  const colors = palette(theme, item.primary)
  const prefix = item.prefix ? `${item.prefix} ` : ''
  const prefixWidth = prefix ? type.measure(prefix, { font: 'sansMedium', size: 15 }) : 0
  const labelWidth = prefixWidth + type.measure(item.label, { font: 'sansSemibold', size: 15 })
  const width = Math.ceil(16 + 18 + 9 + labelWidth + 10 + 15 + 16 + 2)
  const center = 1 + BUTTON_HEIGHT / 2
  const radius = BUTTON_HEIGHT / 2
  const body = [
    el('rect', {
      x: 1,
      y: 3.5,
      width: width - 2,
      height: BUTTON_HEIGHT,
      rx: radius,
      fill: colors.lip,
    }),
    el('rect', {
      x: 1,
      y: 1,
      width: width - 2,
      height: BUTTON_HEIGHT,
      rx: radius,
      fill: colors.fill,
      stroke: colors.stroke,
    }),
    icon(item.icon, {
      x: 17,
      y: center - 9,
      size: 18,
      stroke: item.icon === 'play' ? 'none' : colors.glyph,
      fill: item.icon === 'play' ? colors.glyph : 'none',
      width: 2,
    }),
    prefix
      ? scope.text(prefix, {
          font: 'sansMedium',
          size: 15,
          x: 17 + 18 + 9,
          y: center + 5.3,
          fill: colors.subtitle,
        })
      : '',
    scope.text(item.label, {
      font: 'sansSemibold',
      size: 15,
      x: 17 + 18 + 9 + prefixWidth,
      y: center + 5.3,
      fill: colors.title,
    }),
    icon('arrowRight', {
      x: 17 + 18 + 9 + labelWidth + 10,
      y: center - 7.5,
      size: 15,
      stroke: colors.arrow,
      width: 2.2,
    }),
  ].join('')
  return svgDocument({
    width,
    height: BUTTON_HEIGHT + 4,
    title: `${prefix}${item.label}`,
    description: `${prefix}${item.label} a kassza weboldalán.`,
    defs: scope.defs(),
    body,
  })
}

export function buttonDocuments({ type, theme, site }) {
  const recipes = site.recipes.map((recipe) => ({
    name: `button-recipe-${recipe.slug.split('/').at(-1)}`,
    icon: 'chefHat',
    prefix: 'Recept:',
    label: recipe.title,
  }))
  return [...SECTION_BUTTONS, ...recipes].map((item) => ({
    name: item.name,
    svg: sectionButton(type, theme, item),
  }))
}
