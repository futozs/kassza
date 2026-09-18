const RECEIPT_PATH =
  'M146 84H366A20 20 0 0 1 386 104V428l-13 -18 l-13 18 l-13 -18 l-13 18 l-13 -18 l-13 18 l-13 -18 l-13 18 l-13 -18 l-13 18 l-13 -18 l-13 18 l-13 -18 l-13 18 l-13 -18 l-13 18 l-13 -18 l-13 18 l-13 -18 l-13 18V104A20 20 0 0 1 146 84Z'
const LETTER_PATH = 'M170 136h40v88l76-88h50l-80 90 86 116h-50l-62-86-20 22v64h-40z'

const ICONS = {
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  globe:
    'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM3.6 9h16.8M3.6 15h16.8M12 3c-2.5 2.5-3.8 5.5-3.8 9s1.3 6.5 3.8 9c2.5-2.5 3.8-5.5 3.8-9S14.5 5.5 12 3z',
  book: 'M12 6.6C10.1 5.2 7.4 4.5 4 4.5v13.2c3.4 0 6.1.7 8 2.1 1.9-1.4 4.6-2.1 8-2.1V4.5c-3.4 0-6.1.7-8 2.1zM12 6.6v13.2',
  chefHat:
    'M7 21h10M7 17.5h10M7 21v-7.4a4.2 4.2 0 0 1 .7-8.2 4.8 4.8 0 0 1 8.6 0 4.2 4.2 0 0 1 .7 8.2V21',
  lock: 'M6.5 11h11a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-7A1.5 1.5 0 0 1 6.5 11zM8 11V7.5a4 4 0 0 1 8 0V11',
  mail: 'M4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11A1.5 1.5 0 0 1 4.5 5zM3.6 6.6 12 13l8.4-6.4',
  play: 'M8 5.6v12.8a.9.9 0 0 0 1.4.8l10-6.4a.9.9 0 0 0 0-1.6l-10-6.4A.9.9 0 0 0 8 5.6z',
  reset: 'M3.5 12a8.5 8.5 0 1 0 2.8-6.3L3.5 8.3M3.5 3.5v4.8h4.8',
  share:
    'M9.5 14.5l5-5M8 10.5 5.6 12.9a3.4 3.4 0 0 0 4.8 4.8l2.4-2.4M16 13.5l2.4-2.4a3.4 3.4 0 0 0-4.8-4.8L11.2 8.7',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14zM20 20l-4-4',
  chevronDown: 'M6 9l6 6 6-6',
  command: 'M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3',
}

const XML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }

export function num(value, digits = 2) {
  const rounded = Number(value.toFixed(digits))
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

export function escapeXml(value) {
  return String(value).replace(/[&<>"']/g, (char) => XML_ESCAPES[char])
}

export function attrs(values) {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && value !== false)
    .map(([key, value]) => ` ${key}="${typeof value === 'number' ? num(value) : escapeXml(value)}"`)
    .join('')
}

export function el(name, values = {}, children = '') {
  return children === ''
    ? `<${name}${attrs(values)}/>`
    : `<${name}${attrs(values)}>${children}</${name}>`
}

export function svgDocument({ width, height, title, description, style = '', defs = '', body }) {
  const head = el('svg', {
    xmlns: 'http://www.w3.org/2000/svg',
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    role: 'img',
    'aria-labelledby': 'title desc',
  }).replace('/>', '>')
  return [
    head,
    `<title id="title">${escapeXml(title)}</title>`,
    `<desc id="desc">${escapeXml(description)}</desc>`,
    style ? `<style>${style.replace(/\s*\n\s*/g, '')}</style>` : '',
    defs ? `<defs>${defs}</defs>` : '',
    body,
    '</svg>',
    '',
  ]
    .filter((line, index, lines) => line !== '' || index === lines.length - 1)
    .join('\n')
}

export function icon(name, { x, y, size = 24, stroke = 'none', fill = 'none', width = 2 }) {
  const path = ICONS[name]
  if (!path) throw new Error(`Ismeretlen ikon: ${name}`)
  const scale = size / 24
  return el('path', {
    d: path,
    transform: `translate(${num(x)} ${num(y)}) scale(${num(scale, 4)})`,
    fill,
    stroke,
    'stroke-width': num(width / scale, 3),
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  })
}

export function logoDefs(prefix) {
  return [
    `<linearGradient id="${prefix}-tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14532D"/><stop offset="1" stop-color="#052E16"/></linearGradient>`,
    `<linearGradient id="${prefix}-paper" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFDF5"/><stop offset="1" stop-color="#F3EBD3"/></linearGradient>`,
  ].join('')
}

export function logoMark(prefix, { x, y, size, ring }) {
  const scale = size / 512
  const ringStroke = ring
    ? el('rect', {
        x: 1,
        y: 1,
        width: 510,
        height: 510,
        rx: 111,
        fill: 'none',
        stroke: ring,
        'stroke-width': 2 / scale,
      })
    : ''
  return el(
    'g',
    { transform: `translate(${num(x)} ${num(y)}) scale(${num(scale, 5)})` },
    [
      el('rect', { width: 512, height: 512, rx: 112, fill: `url(#${prefix}-tile)` }),
      el('path', { d: RECEIPT_PATH, fill: '#000', opacity: 0.22, transform: 'translate(0 10)' }),
      el('path', { d: RECEIPT_PATH, fill: `url(#${prefix}-paper)` }),
      el('path', { d: LETTER_PATH, fill: '#14532D' }),
      el('rect', { x: 160, y: 368, width: 120, height: 12, rx: 6, fill: '#14532D', opacity: 0.28 }),
      el('rect', { x: 304, y: 368, width: 48, height: 12, rx: 6, fill: '#F59E0B' }),
      ringStroke,
    ].join(''),
  )
}

export function receiptPath({ x, y, width, height, tooth = 14, depth = 7, radius = 6 }) {
  const count = Math.max(1, Math.round(width / tooth))
  const step = width / count
  let d = `M${num(x + radius)} ${num(y)}H${num(x + width - radius)}`
  d += `A${radius} ${radius} 0 0 1 ${num(x + width)} ${num(y + radius)}V${num(y + height)}`
  for (let index = 0; index < count; index++)
    d += `l${num(-step / 2)} ${depth}l${num(-step / 2)} ${-depth}`
  d += `V${num(y + radius)}A${radius} ${radius} 0 0 1 ${num(x + radius)} ${num(y)}Z`
  return d
}

export function shadowFilter(id, { color, opacity, blur = 14, dy = 14 }) {
  return [
    `<filter id="${id}" x="-30%" y="-30%" width="160%" height="170%" color-interpolation-filters="sRGB">`,
    `<feGaussianBlur in="SourceAlpha" stdDeviation="${blur}"/>`,
    `<feOffset dy="${dy}" result="blur"/>`,
    `<feFlood flood-color="${color}" flood-opacity="${num(opacity, 3)}"/>`,
    '<feComposite in2="blur" operator="in"/>',
    '<feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>',
    '</filter>',
  ].join('')
}

export function dotPattern(id, { gap = 24, radius = 1.2, color }) {
  const center = gap / 2
  return el(
    'pattern',
    { id, width: gap, height: gap, patternUnits: 'userSpaceOnUse' },
    el('circle', { cx: center, cy: center, r: radius, fill: color }),
  )
}
