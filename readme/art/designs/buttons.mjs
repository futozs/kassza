import { el, icon, svgDocument } from '../svg.mjs'

const NAV_WIDTH = 428
const NAV_HEIGHT = 76
const NAV_TILE = 48
const NAV_RADIUS = 16
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

function navItems(site, config) {
  return [
    {
      name: 'nav-web',
      icon: 'globe',
      title: 'Weboldal',
      subtitle: new URL(config.web).host,
      primary: true,
    },
    {
      name: 'nav-docs',
      icon: 'book',
      title: 'Dokumentáció',
      subtitle: `${site.pages.size} oldal, magyarul`,
    },
    {
      name: 'nav-sandbox',
      icon: 'play',
      title: 'Sandbox',
      subtitle: `${site.examples.length} futtatható példa`,
    },
    {
      name: 'nav-recipes',
      icon: 'chefHat',
      title: 'Receptek',
      subtitle: `${site.recipes.length} kész integráció`,
    },
  ]
}

function navCard(type, theme, item) {
  const scope = type.scope()
  const colors = palette(theme, item.primary)
  const width = NAV_WIDTH
  const cardWidth = width - 2
  const tileY = 1 + (NAV_HEIGHT - NAV_TILE) / 2
  const textX = 1 + 14 + NAV_TILE + 16
  const textWidth = width - textX - 60
  const subtitleOptions = { font: 'sans', size: 15 }
  if (type.measure(item.subtitle, subtitleOptions) > textWidth) {
    throw new Error(`A(z) „${item.title}” kártya alcíme nem fér el: ${item.subtitle}`)
  }
  const glyphFill = item.icon === 'play' ? colors.glyph : 'none'
  const glyphStroke = item.icon === 'play' ? 'none' : colors.glyph
  const body = [
    el('rect', {
      x: 1,
      y: 4,
      width: cardWidth,
      height: NAV_HEIGHT,
      rx: NAV_RADIUS,
      fill: colors.lip,
    }),
    el('rect', {
      x: 1,
      y: 1,
      width: cardWidth,
      height: NAV_HEIGHT,
      rx: NAV_RADIUS,
      fill: colors.fill,
      stroke: colors.stroke,
    }),
    el('rect', { x: 15, y: tileY, width: NAV_TILE, height: NAV_TILE, rx: 13, fill: colors.tile }),
    icon(item.icon, {
      x: 15 + (NAV_TILE - 26) / 2,
      y: tileY + (NAV_TILE - 26) / 2,
      size: 26,
      stroke: glyphStroke,
      fill: glyphFill,
      width: 1.9,
    }),
    scope.text(item.title, {
      font: 'sansSemibold',
      size: 20,
      x: textX,
      y: 34,
      fill: colors.title,
    }),
    scope.text(item.subtitle, {
      ...subtitleOptions,
      x: textX,
      y: 57,
      fill: colors.subtitle,
      extra: item.primary ? ' opacity=".82"' : '',
    }),
    icon('arrowRight', {
      x: width - 22 - 22,
      y: 1 + NAV_HEIGHT / 2 - 11,
      size: 22,
      stroke: colors.arrow,
      width: 2,
    }),
  ].join('')
  return svgDocument({
    width,
    height: NAV_HEIGHT + 5,
    title: `${item.title}: ${item.subtitle}`,
    description: `${item.title} (${item.subtitle}) a kassza weboldalán.`,
    defs: scope.defs(),
    body,
  })
}

export function navDocuments({ type, theme, site, config }) {
  return navItems(site, config).map((item) => ({
    name: item.name,
    svg: navCard(type, theme, item),
  }))
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
