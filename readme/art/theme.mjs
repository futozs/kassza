function toSrgbChannel(linear) {
  const value = linear <= 0.0031308 ? 12.92 * linear : 1.055 * linear ** (1 / 2.4) - 0.055
  return Math.round(Math.min(1, Math.max(0, value)) * 255)
}

export function oklch(lightnessPercent, chroma, hue) {
  const lightness = lightnessPercent / 100
  const radians = (hue * Math.PI) / 180
  const a = chroma * Math.cos(radians)
  const b = chroma * Math.sin(radians)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
  const channels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return `#${channels.map((channel) => toSrgbChannel(channel).toString(16).padStart(2, '0')).join('')}`
}

const darkCode = {
  foreground: oklch(91, 0.01, 95),
  keyword: oklch(80, 0.13, 150),
  string: oklch(83, 0.1, 80),
  constant: oklch(79, 0.12, 45),
  function: oklch(81, 0.08, 240),
  property: oklch(87, 0.01, 95),
  punctuation: oklch(67, 0.012, 120),
  comment: oklch(62, 0.014, 120),
  lineNumber: oklch(48, 0.012, 150),
  tag: oklch(80, 0.13, 150),
}

const lightCode = {
  foreground: oklch(25, 0.018, 155),
  keyword: oklch(44, 0.12, 152),
  string: oklch(47, 0.1, 58),
  constant: oklch(50, 0.15, 32),
  function: oklch(43, 0.1, 250),
  property: oklch(35, 0.016, 155),
  punctuation: oklch(52, 0.012, 150),
  comment: oklch(56, 0.014, 110),
  lineNumber: oklch(66, 0.012, 150),
  tag: oklch(44, 0.12, 152),
}

const receipt = {
  receiptInk: oklch(24, 0.02, 155),
  receiptMuted: oklch(46, 0.015, 120),
  receiptRule: oklch(84, 0.025, 90),
  receiptAccent: oklch(42, 0.11, 151),
}

export const themes = {
  light: {
    name: 'light',
    ...receipt,
    paper: oklch(99.2, 0.006, 95),
    paperRaised: oklch(99.7, 0.004, 95),
    surface: oklch(96.9, 0.009, 95),
    rule: oklch(90.6, 0.011, 95),
    ruleStrong: oklch(83.5, 0.013, 95),
    ink: oklch(21, 0.018, 155),
    ink2: oklch(35, 0.016, 155),
    muted: oklch(49, 0.013, 150),
    brand: oklch(39.3, 0.095, 152.5),
    brandDeep: oklch(26.6, 0.065, 152.9),
    brandInk: oklch(99, 0.008, 95),
    accent: oklch(49, 0.125, 150),
    accentSoft: oklch(95.6, 0.028, 150),
    amber: oklch(76.9, 0.188, 70),
    receipt: oklch(99.4, 0.009, 95),
    receiptEdge: oklch(94.1, 0.03, 90),
    shadow: oklch(30, 0.02, 155),
    glow: oklch(88, 0.09, 150),
    dot: oklch(80, 0.015, 95),
    editor: oklch(20.5, 0.016, 158),
    editorChrome: oklch(24.5, 0.016, 158),
    editorRule: oklch(31, 0.016, 158),
    code: darkCode,
    siteCode: lightCode,
  },
  dark: {
    name: 'dark',
    ...receipt,
    paper: oklch(17.2, 0.012, 160),
    paperRaised: oklch(19.8, 0.013, 160),
    surface: oklch(21.4, 0.013, 160),
    rule: oklch(29.5, 0.014, 160),
    ruleStrong: oklch(37, 0.015, 160),
    ink: oklch(94, 0.01, 95),
    ink2: oklch(84.5, 0.01, 95),
    muted: oklch(70.5, 0.012, 120),
    brand: oklch(73, 0.13, 150),
    brandDeep: oklch(26.6, 0.065, 152.9),
    brandInk: oklch(17.2, 0.012, 160),
    accent: oklch(79, 0.135, 150),
    accentSoft: oklch(26, 0.04, 155),
    amber: oklch(80, 0.15, 75),
    receipt: oklch(96.5, 0.012, 95),
    receiptEdge: oklch(88, 0.03, 90),
    shadow: oklch(5, 0.01, 160),
    glow: oklch(45, 0.1, 150),
    dot: oklch(33, 0.014, 160),
    editor: oklch(14.5, 0.012, 160),
    editorChrome: oklch(19, 0.013, 160),
    editorRule: oklch(27, 0.014, 160),
    code: darkCode,
    siteCode: { ...darkCode, lineNumber: oklch(45, 0.012, 150) },
  },
}
