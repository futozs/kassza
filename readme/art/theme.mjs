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
  foreground: oklch(91, 0.006, 255),
  keyword: oklch(78, 0.12, 305),
  string: oklch(83, 0.1, 80),
  constant: oklch(79, 0.12, 45),
  function: oklch(81, 0.08, 240),
  property: oklch(87, 0.006, 255),
  punctuation: oklch(67, 0.014, 255),
  comment: oklch(62, 0.014, 255),
  lineNumber: oklch(48, 0.014, 258),
  tag: oklch(78, 0.12, 305),
}

const lightCode = {
  foreground: oklch(25, 0.022, 258),
  keyword: oklch(47, 0.16, 305),
  string: oklch(47, 0.1, 58),
  constant: oklch(50, 0.15, 32),
  function: oklch(43, 0.1, 250),
  property: oklch(36, 0.022, 258),
  punctuation: oklch(53, 0.014, 258),
  comment: oklch(57, 0.014, 258),
  lineNumber: oklch(66, 0.012, 258),
  tag: oklch(47, 0.16, 305),
}

const receipt = {
  receiptInk: oklch(24, 0.024, 258),
  receiptMuted: oklch(48, 0.02, 258),
  receiptRule: oklch(86, 0.01, 255),
  receiptAccent: oklch(55, 0.165, 42),
}

export const themes = {
  light: {
    name: 'light',
    ...receipt,
    paper: oklch(100, 0, 0),
    paperRaised: oklch(100, 0, 0),
    surface: oklch(97.4, 0.004, 255),
    rule: oklch(91.8, 0.007, 255),
    ruleStrong: oklch(85, 0.01, 255),
    ink: oklch(23.5, 0.024, 258),
    ink2: oklch(36, 0.022, 258),
    muted: oklch(50, 0.02, 258),
    brand: oklch(31, 0.027, 258),
    brandDeep: oklch(24, 0.024, 258),
    brandInk: oklch(100, 0, 0),
    accent: oklch(55, 0.165, 42),
    accentSoft: oklch(96.2, 0.025, 55),
    amber: oklch(68, 0.19, 45),
    receipt: oklch(100, 0, 0),
    receiptEdge: oklch(92.5, 0.008, 255),
    shadow: oklch(30, 0.03, 258),
    glow: oklch(100, 0, 0),
    dot: oklch(86, 0.008, 255),
    editor: oklch(21, 0.022, 258),
    editorChrome: oklch(25, 0.022, 258),
    editorRule: oklch(32, 0.022, 258),
    code: darkCode,
    siteCode: lightCode,
  },
  dark: {
    name: 'dark',
    ...receipt,
    paper: oklch(18, 0.014, 258),
    paperRaised: oklch(20.5, 0.015, 258),
    surface: oklch(22, 0.016, 258),
    rule: oklch(30, 0.017, 258),
    ruleStrong: oklch(37.5, 0.018, 258),
    ink: oklch(95, 0.004, 255),
    ink2: oklch(85, 0.008, 255),
    muted: oklch(70, 0.014, 255),
    brand: oklch(74, 0.16, 48),
    brandDeep: oklch(24, 0.024, 258),
    brandInk: oklch(18, 0.014, 258),
    accent: oklch(76, 0.15, 50),
    accentSoft: oklch(27, 0.045, 45),
    amber: oklch(72, 0.18, 47),
    receipt: oklch(97, 0.004, 255),
    receiptEdge: oklch(88, 0.01, 255),
    shadow: oklch(6, 0.01, 258),
    glow: oklch(18, 0.014, 258),
    dot: oklch(31, 0.017, 258),
    editor: oklch(14.5, 0.014, 258),
    editorChrome: oklch(19, 0.015, 258),
    editorRule: oklch(27, 0.017, 258),
    code: darkCode,
    siteCode: { ...darkCode, lineNumber: oklch(45, 0.014, 258) },
  },
}
